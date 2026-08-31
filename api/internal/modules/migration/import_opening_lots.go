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

var openingLotsCanonical = []string{
	"item_code", "lot_no", "qty", "catch_weight", "expiry_date", "location", "as_of_date",
}
var openingLotsRequired = []string{"item_code", "lot_no", "location"}

func importOpeningLotsMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return mappedOpeningLotsHandler(pool, false)
}

func previewOpeningLotsMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return mappedOpeningLotsHandler(pool, true)
}

func mappedOpeningLotsHandler(pool *pgxpool.Pool, forcePreview bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, ok := readMapped(w, r, pool, "opening_lots", openingLotsRequired, openingLotsCanonical)
		if !ok {
			return
		}
		dry := forcePreview || parseJobDefaults(r).DryRun
		result := importResult{}

		for i, row := range rows {
			rowNum := i + 2
			item, errMsg := lookupItem(r.Context(), pool, tu.TenantID, strings.TrimSpace(row["item_code"]), "")
			if errMsg != "" {
				failRow(&result, rowNum, errMsg)
				continue
			}
			if item.TrackSerial {
				failRow(&result, rowNum, "serial-tracked items cannot use opening lots — receive serials instead")
				continue
			}
			if !item.TrackLot {
				failRow(&result, rowNum, "item is not lot-tracked — use opening stock instead")
				continue
			}
			lotNo := strings.TrimSpace(row["lot_no"])
			if lotNo == "" {
				failRow(&result, rowNum, "lot_no is required")
				continue
			}
			qty := parseFloatDefault(row["qty"], 0)
			if qty <= 0 {
				qty = parseFloatDefault(row["catch_weight"], 0)
			}
			if qty <= 0 {
				failRow(&result, rowNum, "qty or catch_weight must be greater than 0")
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
			expiry := strings.TrimSpace(row["expiry_date"])
			if expiry != "" {
				if _, err := time.Parse("2006-01-02", expiry); err != nil {
					failRow(&result, rowNum, "expiry_date must be YYYY-MM-DD")
					continue
				}
			}

			sourceNo := fmt.Sprintf("opening_lot:%d|%s|%d", item.ID, lotNo, locID)
			if hit, _ := alreadyImported(r.Context(), pool, tu.TenantID, "opening_lots", sourceNo); hit {
				if dry {
					result.Updated++
				} else {
					result.Updated++
				}
				continue
			}

			if dry {
				result.Created++
				continue
			}

			tx, err := pool.Begin(r.Context())
			if err != nil {
				failRow(&result, rowNum, err.Error())
				continue
			}

			var expiryArg any
			if expiry != "" {
				expiryArg = expiry
			}

			var lotID int64
			err = tx.QueryRow(r.Context(), `
				insert into public.inv_lot_batches (tenant_id, item_id, lot_no, location_id, qty_on_hand, expiry_date)
				values ($1, $2, $3, $4, $5, $6::date)
				on conflict (tenant_id, item_id, lot_no, location_id)
				do update set
				  qty_on_hand = inv_lot_batches.qty_on_hand + excluded.qty_on_hand,
				  expiry_date = coalesce(excluded.expiry_date, inv_lot_batches.expiry_date),
				  updated_at = now()
				returning id`,
				tu.TenantID, item.ID, lotNo, locID, qty, expiryArg).Scan(&lotID)
			if err != nil {
				_ = tx.Rollback(r.Context())
				failRow(&result, rowNum, err.Error())
				continue
			}

			notes := "Opening/cutover lot"
			if err := inventory.ApplyStockDelta(r.Context(), tx, tu.TenantID, item.ID, locID, qty, tu.AppUserID, "opening_lot", lotID, "receipt", notes); err != nil {
				_ = tx.Rollback(r.Context())
				failRow(&result, rowNum, err.Error())
				continue
			}

			if err := rememberImport(r.Context(), tx, tu.TenantID, "opening_lots", sourceNo, lotID); err != nil {
				_ = tx.Rollback(r.Context())
				failRow(&result, rowNum, err.Error())
				continue
			}
			if err := tx.Commit(r.Context()); err != nil {
				failRow(&result, rowNum, err.Error())
				continue
			}
			result.Created++
		}
		writeImportResult(w, result, dry)
	}
}
