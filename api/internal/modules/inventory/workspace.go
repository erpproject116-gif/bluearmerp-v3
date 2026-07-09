package inventory

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type inventoryWorkspaceSummary struct {
	ActiveItems       int64 `json:"active_items"`
	ActiveLocations   int64 `json:"active_locations"`
	LowStockSkus      int64 `json:"low_stock_skus"`
	NegativeStockSkus int64 `json:"negative_stock_skus"`
	OpenStockEntries  int64 `json:"open_stock_entries"`
}

type lowStockAlertRow struct {
	ItemID       int64   `json:"item_id"`
	ItemCode     string  `json:"item_code"`
	ItemName     string  `json:"item_name"`
	LocationID   int64   `json:"location_id"`
	LocationName string  `json:"location_name"`
	QtyOnHand    float64 `json:"qty_on_hand"`
	ReorderLevel float64 `json:"reorder_level"`
	Shortfall    float64 `json:"shortfall"`
}

func registerInventoryWorkspaceRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/workspace", inventoryWorkspaceHandler(pool))
	r.Get("/workspace/low-stock-alerts", lowStockAlertsHandler(pool))
}

func inventoryWorkspaceHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		ctx := r.Context()
		var out inventoryWorkspaceSummary

		_ = pool.QueryRow(ctx, `
			select count(*)
			from public.inv_items
			where tenant_id = $1 and deleted_at is null and status = 'active'`, tu.TenantID).Scan(&out.ActiveItems)

		_ = pool.QueryRow(ctx, `
			select count(*)
			from public.inv_locations
			where tenant_id = $1 and deleted_at is null and status = 'active'`, tu.TenantID).Scan(&out.ActiveLocations)

		_ = pool.QueryRow(ctx, `
			select count(distinct bal.item_id)
			from public.inv_item_location_balances bal
			join public.inv_items i on i.id = bal.item_id and i.tenant_id = bal.tenant_id
			where bal.tenant_id = $1
			  and coalesce(bal.reorder_level, i.reorder_level) is not null
			  and bal.qty_on_hand < coalesce(bal.reorder_level, i.reorder_level)`, tu.TenantID).Scan(&out.LowStockSkus)

		_ = pool.QueryRow(ctx, `
			select count(distinct item_id)
			from public.inv_item_location_balances
			where tenant_id = $1 and qty_on_hand < 0`, tu.TenantID).Scan(&out.NegativeStockSkus)

		_ = pool.QueryRow(ctx, `
			select count(*)
			from public.inv_stock_entries
			where tenant_id = $1 and deleted_at is null and coalesce(status, 'draft') in ('draft', 'submitted')`, tu.TenantID).Scan(&out.OpenStockEntries)

		response.OK(w, out, "OK")
	}
}

func lowStockAlertsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		limit := 15
		if v := r.URL.Query().Get("limit"); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 50 {
				limit = n
			}
		}
		safetyExpr := safetyLevelExpr("")
		q := fmt.Sprintf(`
			select i.id, i.item_code, i.item_name, l.id, l.location_name,
			  bal.qty_on_hand::float8,
			  %s::float8 as reorder_level,
			  (%s - bal.qty_on_hand)::float8 as shortfall
			from public.inv_item_location_balances bal
			join public.inv_items i on i.id = bal.item_id and i.tenant_id = bal.tenant_id
			join public.inv_locations l on l.id = bal.location_id
			where bal.tenant_id = $1
			  and %s is not null
			  and bal.qty_on_hand < %s
			order by shortfall desc, i.item_code asc
			limit $2`, safetyExpr, safetyExpr, safetyExpr, safetyExpr)

		rows, err := pool.Query(r.Context(), q, tu.TenantID, limit)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load low-stock alerts.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []lowStockAlertRow
		for rows.Next() {
			var row lowStockAlertRow
			if err := rows.Scan(&row.ItemID, &row.ItemCode, &row.ItemName, &row.LocationID, &row.LocationName,
				&row.QtyOnHand, &row.ReorderLevel, &row.Shortfall); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read alerts.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []lowStockAlertRow{}
		}
		response.OK(w, out, "OK")
	}
}
