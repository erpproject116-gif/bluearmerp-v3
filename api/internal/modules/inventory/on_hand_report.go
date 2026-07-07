package inventory

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/reports"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type onHandRow struct {
	ItemID       int64   `json:"item_id"`
	ItemCode     string  `json:"item_code"`
	ItemName     string  `json:"item_name"`
	LocationID   int64   `json:"location_id"`
	LocationName string  `json:"location_name"`
	QtyOnHand    float64 `json:"qty_on_hand"`
	QtyReserved  float64 `json:"qty_reserved"`
	ReorderLevel *float64 `json:"reorder_level,omitempty"`
	BelowSafety  bool    `json:"below_safety"`
}

func parseOnHandFilters(r *http.Request) (asOf time.Time, minQty, maxQty *float64, belowSafety bool, itemID, locationID *int64, errs map[string]string) {
	asOfStr := strings.TrimSpace(r.URL.Query().Get("as_of"))
	if asOfStr == "" {
		asOfStr = time.Now().Format("2006-01-02")
	}
	parsed, err := time.Parse("2006-01-02", asOfStr)
	if err != nil {
		return time.Time{}, nil, nil, false, nil, nil, map[string]string{"as_of": "Invalid date. Use YYYY-MM-DD."}
	}
	asOf = parsed
	if v := strings.TrimSpace(r.URL.Query().Get("min_qty")); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil {
			minQty = &n
		}
	}
	if v := strings.TrimSpace(r.URL.Query().Get("max_qty")); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil {
			maxQty = &n
		}
	}
	belowSafety = strings.TrimSpace(r.URL.Query().Get("below_safety")) == "true"
	if v := strings.TrimSpace(r.URL.Query().Get("item_id")); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			itemID = &n
		}
	}
	if v := strings.TrimSpace(r.URL.Query().Get("location_id")); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			locationID = &n
		}
	}
	return asOf, minQty, maxQty, belowSafety, itemID, locationID, nil
}

func onHandSQL(tenantID int64, minQty, maxQty *float64, belowSafety bool, itemID, locationID *int64) (string, []any) {
	args := []any{tenantID}
	argN := 2
	base := `
		select i.id, i.item_code, i.item_name, l.id, l.location_name,
		  bal.qty_on_hand::float8, bal.qty_reserved::float8,
		  coalesce(bal.reorder_level, i.reorder_level)::float8,
		  case when coalesce(bal.reorder_level, i.reorder_level) is not null
		    and bal.qty_on_hand < coalesce(bal.reorder_level, i.reorder_level) then true else false end as below_safety
		from public.inv_item_location_balances bal
		join public.inv_items i on i.id = bal.item_id and i.tenant_id = bal.tenant_id
		join public.inv_locations l on l.id = bal.location_id
		where bal.tenant_id = $1`
	where := ""
	if itemID != nil {
		where += fmt.Sprintf(" and i.id = $%d", argN)
		args = append(args, *itemID)
		argN++
	}
	if locationID != nil {
		where += fmt.Sprintf(" and l.id = $%d", argN)
		args = append(args, *locationID)
		argN++
	}
	q := fmt.Sprintf("select * from (%s%s) sub where (qty_on_hand <> 0 or qty_reserved <> 0)", base, where)
	if minQty != nil {
		q += fmt.Sprintf(" and qty_on_hand >= $%d", argN)
		args = append(args, *minQty)
		argN++
	}
	if maxQty != nil {
		q += fmt.Sprintf(" and qty_on_hand <= $%d", argN)
		args = append(args, *maxQty)
		argN++
	}
	if belowSafety {
		q += " and below_safety = true"
	}
	return q, args
}

func listOnHandReport(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{"item_code": "item_code", "qty_on_hand": "qty_on_hand"}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		_, minQty, maxQty, belowSafety, itemID, locationID, errs := parseOnHandFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		p := httputil.ParseListParams(r, "item_code", allowed)
		offset := httputil.Offset(p)
		base, args := onHandSQL(tu.TenantID, minQty, maxQty, belowSafety, itemID, locationID)
		countQ := fmt.Sprintf("select count(*) from (%s) sub", base)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count on-hand report.", "ERR_INTERNAL")
			return
		}
		args = append(args, p.PageSize, offset)
		q := fmt.Sprintf("select * from (%s) sub order by %s %s limit $%d offset $%d", base, p.Sort, reports.OrderSQL(p.Order), len(args)-1, len(args))
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load on-hand report.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []onHandRow
		for rows.Next() {
			var row onHandRow
			var reorder *float64
			if err := rows.Scan(&row.ItemID, &row.ItemCode, &row.ItemName, &row.LocationID, &row.LocationName,
				&row.QtyOnHand, &row.QtyReserved, &reorder, &row.BelowSafety); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read on-hand report.", "ERR_INTERNAL")
				return
			}
			row.ReorderLevel = reorder
			out = append(out, row)
		}
		if out == nil {
			out = []onHandRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func exportOnHandReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		_, minQty, maxQty, belowSafety, itemID, locationID, errs := parseOnHandFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		base, args := onHandSQL(tu.TenantID, minQty, maxQty, belowSafety, itemID, locationID)
		q := fmt.Sprintf("select * from (%s) sub order by item_code asc limit %d", base, reports.ExportMaxRows)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export on-hand report.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="inventory-on-hand.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Item Code", "Item Name", "Location", "On Hand", "Reserved", "Reorder Level", "Below Safety"})
		for rows.Next() {
			var row onHandRow
			var reorder *float64
			if err := rows.Scan(&row.ItemID, &row.ItemCode, &row.ItemName, &row.LocationID, &row.LocationName,
				&row.QtyOnHand, &row.QtyReserved, &reorder, &row.BelowSafety); err != nil {
				return
			}
			reorderStr := ""
			if reorder != nil {
				reorderStr = fmt.Sprintf("%.4f", *reorder)
			}
			_ = cw.Write([]string{
				row.ItemCode, row.ItemName, row.LocationName,
				fmt.Sprintf("%.4f", row.QtyOnHand), fmt.Sprintf("%.4f", row.QtyReserved),
				reorderStr, strconv.FormatBool(row.BelowSafety),
			})
		}
		cw.Flush()
	}
}
