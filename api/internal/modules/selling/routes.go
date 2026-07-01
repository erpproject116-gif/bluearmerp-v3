package selling

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type workspaceSummary struct {
	OpenSalesOrders      int64 `json:"open_sales_orders"`
	OpenQuotations       int64 `json:"open_quotations"`
	ExpiredQuotations    int64 `json:"expired_quotations"`
	PendingDeliveryLines int64 `json:"pending_delivery_lines"`
	LowStockSkus         int64 `json:"low_stock_skus"`
}

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/selling", func(sr chi.Router) {
		sr.Get("/workspace", workspaceHandler(pool))
	})
}

func workspaceHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		ctx := r.Context()
		var out workspaceSummary

		_ = pool.QueryRow(ctx, `
			select count(*) from public.so_sales_orders
			where tenant_id = $1 and deleted_at is null
			  and progress_status in ('unconfirmed', 'in_progress')`, tu.TenantID).Scan(&out.OpenSalesOrders)

		_ = pool.QueryRow(ctx, `
			select count(*) from public.quo_quotations
			where tenant_id = $1 and deleted_at is null
			  and voucher_status = 'none'`, tu.TenantID).Scan(&out.OpenQuotations)

		_ = pool.QueryRow(ctx, `
			select count(*) from public.quo_quotations
			where tenant_id = $1 and deleted_at is null
			  and valid_until is not null and valid_until < current_date`, tu.TenantID).Scan(&out.ExpiredQuotations)

		_ = pool.QueryRow(ctx, `
			select count(distinct ln.id)
			from public.so_sales_order_lines ln
			join public.so_sales_orders so on so.id = ln.sales_order_id
			where so.tenant_id = $1 and so.deleted_at is null
			  and so.progress_status in ('unconfirmed', 'in_progress')
			  and (ln.qty - ln.delivered_qty) > 0.0001`, tu.TenantID).Scan(&out.PendingDeliveryLines)

		_ = pool.QueryRow(ctx, `
			select count(distinct bal.item_id)
			from public.inv_item_location_balances bal
			join public.inv_items i on i.id = bal.item_id and i.tenant_id = bal.tenant_id
			where bal.tenant_id = $1
			  and coalesce(bal.reorder_level, i.reorder_level) is not null
			  and bal.qty_on_hand < coalesce(bal.reorder_level, i.reorder_level)`, tu.TenantID).Scan(&out.LowStockSkus)

		response.OK(w, out, "OK")
	}
}
