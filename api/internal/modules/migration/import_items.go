package migration

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

var itemCanonical = []string{
	"item_code", "item_name", "purchase_price", "sales_price", "vip_price", "status",
	"track_serial", "track_lot", "serial_policy", "lot_policy", "track_inventory_qty", "warranty_duration_months",
	"spec_name", "unit", "item_category", "item_type", "oe_price",
}
var itemRequired = []string{"item_name"}

func importItemsMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return mappedItemsHandler(pool, false)
}

func previewItemsMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return mappedItemsHandler(pool, true)
}

func mappedItemsHandler(pool *pgxpool.Pool, forcePreview bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, ok := readMapped(w, r, pool, "items", itemRequired, itemCanonical)
		if !ok {
			return
		}
		dry := forcePreview || parseJobDefaults(r).DryRun
		result := importResult{}
		for i, row := range rows {
			rowNum := i + 2
			name := strings.TrimSpace(row["item_name"])
			if name == "" {
				failRow(&result, rowNum, "item_name is required")
				continue
			}
			status := strings.ToLower(strings.TrimSpace(row["status"]))
			if status == "" {
				status = "active"
			}
			if status != "active" && status != "inactive" {
				failRow(&result, rowNum, "status must be active or inactive")
				continue
			}
			itemCategory := strings.TrimSpace(row["item_category"])
			if itemCategory == "" {
				itemCategory = "merchandise"
			}
			itemType := strings.TrimSpace(row["item_type"])
			if itemType == "" {
				itemType = "item"
			}
			purchase := parseFloatDefault(row["purchase_price"], 0)
			sales := parseFloatDefault(row["sales_price"], 0)
			vip := parseFloatDefault(row["vip_price"], 0)
			oe := parseFloatDefault(row["oe_price"], 0)
			trackSerial := parseBoolDefault(row["track_serial"], false)
			trackLot := parseBoolDefault(row["track_lot"], false)
			if trackSerial && trackLot {
				failRow(&result, rowNum, "track_serial and track_lot cannot both be true")
				continue
			}
			trackQty := parseBoolDefault(row["track_inventory_qty"], true)
			serialPolicy := parseTrackingPolicy(row["serial_policy"])
			lotPolicy := parseTrackingPolicy(row["lot_policy"])
			if !trackSerial {
				serialPolicy = "required"
			}
			if !trackLot {
				lotPolicy = "required"
			}
			var warranty *int
			if v := strings.TrimSpace(row["warranty_duration_months"]); v != "" {
				n, e := strconv.Atoi(v)
				if e != nil {
					failRow(&result, rowNum, "invalid warranty_duration_months")
					continue
				}
				warranty = &n
			}

			existing, matchErr := lookupItem(r.Context(), pool, tu.TenantID, strings.TrimSpace(row["item_code"]), "")
			if existing.ID == 0 {
				existing, matchErr = lookupItem(r.Context(), pool, tu.TenantID, "", name)
			}
			if matchErr != "" && !strings.HasPrefix(matchErr, "unmatched") {
				failRow(&result, rowNum, matchErr)
				continue
			}
			if existing.ID > 0 {
				if dry {
					result.Updated++
					continue
				}
				_, err := pool.Exec(r.Context(), `
					update public.inv_items set
					  item_name = $2, spec_name = $3, unit = $4, item_category = $5, item_type = $6,
					  purchase_price = $7, sales_price = $8, vip_price = $9, oe_price = $10,
					  warranty_duration_months = $11, track_serial = $12, track_lot = $13,
					  serial_policy = $14, lot_policy = $15, track_inventory_qty = $16, status = $17, updated_at = now()
					where id = $1 and tenant_id = $18`,
					existing.ID, name, nullIfEmpty(row["spec_name"]), nullIfEmpty(row["unit"]),
					itemCategory, itemType, purchase, sales, vip, oe, warranty, trackSerial, trackLot,
					serialPolicy, lotPolicy, trackQty, status, tu.TenantID)
				if err != nil {
					failRow(&result, rowNum, err.Error())
					continue
				}
				result.Updated++
				continue
			}
			if dry {
				result.Created++
				continue
			}
			var id int64
			err := pool.QueryRow(r.Context(), `
				insert into public.inv_items (
				  tenant_id, item_code, item_name, spec_name, unit, item_category, item_type,
				  purchase_price, sales_price, vip_price, oe_price,
				  warranty_duration_months, track_serial, track_lot, serial_policy, lot_policy, track_inventory_qty, status
				) values (
				  $1, public.allocate_tenant_code($1, 'item'), $2, $3, $4, $5, $6,
				  $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
				) returning id`,
				tu.TenantID, name, nullIfEmpty(row["spec_name"]), nullIfEmpty(row["unit"]),
				itemCategory, itemType, purchase, sales, vip, oe, warranty, trackSerial, trackLot,
				serialPolicy, lotPolicy, trackQty, status,
			).Scan(&id)
			if err != nil {
				failRow(&result, rowNum, err.Error())
				continue
			}
			result.Created++
		}
		writeImportResult(w, result, dry)
	}
}

func parseFloatDefault(s string, def float64) float64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return def
	}
	n, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return def
	}
	return n
}

func parseBoolDefault(s string, def bool) bool {
	s = strings.ToLower(strings.TrimSpace(s))
	switch s {
	case "1", "true", "yes", "y":
		return true
	case "0", "false", "no", "n":
		return false
	case "":
		return def
	default:
		return def
	}
}

func nullIfEmpty(s string) *string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return &s
}
