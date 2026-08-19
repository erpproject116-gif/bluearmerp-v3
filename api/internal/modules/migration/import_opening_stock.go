package migration

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/inventory"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

var openingStockCanonical = []string{"item_code", "item", "quantity", "location", "as_of_date"}
var openingStockRequired = []string{"quantity", "location"}

func importOpeningStockMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return mappedOpeningStockHandler(pool, false)
}

func previewOpeningStockMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return mappedOpeningStockHandler(pool, true)
}

func mappedOpeningStockHandler(pool *pgxpool.Pool, forcePreview bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, ok := readMapped(w, r, pool, "opening_stock", openingStockRequired, openingStockCanonical)
		if !ok {
			return
		}
		dry := forcePreview || parseJobDefaults(r).DryRun
		result := importResult{}

		type locBucket struct {
			LocationID int64
			Date       string
			Lines      []struct {
				ItemID int64
				Qty    float64
				Row    int
			}
		}
		buckets := map[string]*locBucket{}
		order := []string{}

		for i, row := range rows {
			rowNum := i + 2
			item, errMsg := lookupItem(r.Context(), pool, tu.TenantID, strings.TrimSpace(row["item_code"]), strings.TrimSpace(row["item"]))
			if item.ID == 0 && strings.HasPrefix(errMsg, "unmatched item_code") {
				item, errMsg = lookupItem(r.Context(), pool, tu.TenantID, "", strings.TrimSpace(row["item"]))
			}
			if errMsg != "" {
				failRow(&result, rowNum, errMsg)
				continue
			}
			if item.TrackSerial {
				failRow(&result, rowNum, "serial-tracked items cannot use opening qty — receive serials instead")
				continue
			}
			if item.TrackLot {
				failRow(&result, rowNum, "lot-tracked items cannot use opening qty — receive lots instead")
				continue
			}
			qty := parseFloatDefault(row["quantity"], 0)
			if qty <= 0 {
				failRow(&result, rowNum, "quantity must be greater than 0")
				continue
			}
			locID, locErr := lookupLocation(r.Context(), pool, tu.TenantID, row["location"])
			if locErr != "" {
				failRow(&result, rowNum, locErr)
				continue
			}
			asOf := strings.TrimSpace(row["as_of_date"])
			if asOf == "" {
				asOf = time.Now().UTC().Format("2006-01-02")
			}
			if _, err := time.Parse("2006-01-02", asOf); err != nil {
				failRow(&result, rowNum, "as_of_date must be YYYY-MM-DD")
				continue
			}
			key := fmt.Sprintf("%d|%s", locID, asOf)
			if _, ok := buckets[key]; !ok {
				buckets[key] = &locBucket{LocationID: locID, Date: asOf}
				order = append(order, key)
			}
			b := buckets[key]
			b.Lines = append(b.Lines, struct {
				ItemID int64
				Qty    float64
				Row    int
			}{item.ID, qty, rowNum})
		}

		if dry {
			result.Created += len(order)
			writeImportResult(w, result, true)
			return
		}

		notes := "Opening/cutover"
		for _, key := range order {
			b := buckets[key]
			sourceNo := "opening:" + key
			if hit, _ := alreadyImported(r.Context(), pool, tu.TenantID, "opening_stock", sourceNo); hit {
				result.Updated++
				continue
			}
			tx, err := pool.Begin(r.Context())
			if err != nil {
				failRow(&result, b.Lines[0].Row, err.Error())
				continue
			}
			entryNo := fmt.Sprintf("SE-OPEN-%s-%d", strings.ReplaceAll(b.Date, "-", ""), time.Now().UnixNano()%100000)
			var entryID int64
			err = tx.QueryRow(r.Context(), `
				insert into public.inv_stock_entries (
				  tenant_id, entry_date, entry_no, entry_type, to_location_id, notes, created_by_user_id, mig_source_doc_no
				) values ($1, $2::date, $3, 'receipt', $4, $5, $6, $7) returning id`,
				tu.TenantID, b.Date, entryNo, b.LocationID, notes, tu.AppUserID, sourceNo).Scan(&entryID)
			if err != nil {
				_ = tx.Rollback(r.Context())
				failRow(&result, b.Lines[0].Row, err.Error())
				continue
			}
			okLines := true
			for i, ln := range b.Lines {
				_, err = tx.Exec(r.Context(), `
					insert into public.inv_stock_entry_lines (stock_entry_id, line_no, item_id, qty)
					values ($1,$2,$3,$4)`, entryID, i+1, ln.ItemID, ln.Qty)
				if err != nil {
					okLines = false
					failRow(&result, ln.Row, err.Error())
					break
				}
				if err := inventory.ApplyStockDelta(r.Context(), tx, tu.TenantID, ln.ItemID, b.LocationID, ln.Qty, tu.AppUserID, "stock_entry", entryID, "receipt", notes); err != nil {
					okLines = false
					failRow(&result, ln.Row, err.Error())
					break
				}
			}
			if !okLines {
				_ = tx.Rollback(r.Context())
				continue
			}
			if _, err = tx.Exec(r.Context(), `
				update public.inv_stock_entries set status = 'posted', posted_at = now(), updated_at = now()
				where id = $1`, entryID); err != nil {
				_ = tx.Rollback(r.Context())
				failRow(&result, b.Lines[0].Row, err.Error())
				continue
			}
			if err := rememberImport(r.Context(), tx, tu.TenantID, "opening_stock", sourceNo, entryID); err != nil {
				_ = tx.Rollback(r.Context())
				failRow(&result, b.Lines[0].Row, err.Error())
				continue
			}
			if err := tx.Commit(r.Context()); err != nil {
				failRow(&result, b.Lines[0].Row, err.Error())
				continue
			}
			result.Created++
		}
		writeImportResult(w, result, false)
	}
}
