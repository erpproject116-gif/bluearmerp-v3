package inventory

import (
	"net/http"

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

func registerInventoryWorkspaceRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/workspace", inventoryWorkspaceHandler(pool))
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
