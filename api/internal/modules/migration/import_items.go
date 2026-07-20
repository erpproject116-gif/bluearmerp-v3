package migration

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/csvmap"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

var itemCanonical = []string{
	"item_name", "purchase_price", "sales_price", "vip_price", "status",
	"track_serial", "track_lot", "track_inventory_qty", "warranty_duration_months",
	"spec_name", "unit", "item_category", "item_type", "oe_price",
}
var itemRequired = []string{"item_name"}

func importItemsMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		records, colMap, err := csvmap.ReadUpload(r, csvmap.DefaultMaxBytes, func(profileID int64) (map[string]string, error) {
			m, e := loadProfileColumnMap(r.Context(), pool, tu.TenantID, profileID, "items")
			if e == errKindMismatch {
				return nil, fmt.Errorf("import profile kind does not match items")
			}
			return m, e
		})
		if err != nil {
			response.Validation(w, map[string]string{"file": err.Error()})
			return
		}
		remapped, err := csvmap.Remap(records, colMap, itemRequired, itemCanonical)
		if err != nil {
			response.Validation(w, map[string]string{"column_map": err.Error()})
			return
		}
		rows := csvmap.RowsToMaps(remapped)
		if len(rows) > csvmap.DefaultMaxRows {
			response.Validation(w, map[string]string{"file": fmt.Sprintf("Maximum %d rows per import.", csvmap.DefaultMaxRows)})
			return
		}

		result := importResult{}
		for i, row := range rows {
			rowNum := i + 2
			name := strings.TrimSpace(row["item_name"])
			if name == "" {
				result.Failed++
				result.RowErrors = append(result.RowErrors, importRowError{Row: rowNum, Message: "item_name is required"})
				continue
			}
			status := strings.ToLower(strings.TrimSpace(row["status"]))
			if status == "" {
				status = "active"
			}
			if status != "active" && status != "inactive" {
				result.Failed++
				result.RowErrors = append(result.RowErrors, importRowError{Row: rowNum, Message: "status must be active or inactive"})
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
			trackQty := parseBoolDefault(row["track_inventory_qty"], true)
			var warranty *int
			if v := strings.TrimSpace(row["warranty_duration_months"]); v != "" {
				n, e := strconv.Atoi(v)
				if e != nil {
					result.Failed++
					result.RowErrors = append(result.RowErrors, importRowError{Row: rowNum, Message: "invalid warranty_duration_months"})
					continue
				}
				warranty = &n
			}

			var id int64
			err := pool.QueryRow(r.Context(), `
				insert into public.inv_items (
				  tenant_id, item_code, item_name, spec_name, unit, item_category, item_type,
				  purchase_price, sales_price, vip_price, oe_price,
				  warranty_duration_months, track_serial, track_lot, track_inventory_qty, status
				) values (
				  $1, public.allocate_tenant_code($1, 'item'), $2, $3, $4, $5, $6,
				  $7, $8, $9, $10, $11, $12, $13, $14, $15
				) returning id`,
				tu.TenantID, name, nullIfEmpty(row["spec_name"]), nullIfEmpty(row["unit"]),
				itemCategory, itemType, purchase, sales, vip, oe, warranty, trackSerial, trackLot, trackQty, status,
			).Scan(&id)
			if err != nil {
				result.Failed++
				result.RowErrors = append(result.RowErrors, importRowError{Row: rowNum, Message: err.Error()})
				continue
			}
			result.Created++
		}
		response.OK(w, result, "Import finished.")
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
