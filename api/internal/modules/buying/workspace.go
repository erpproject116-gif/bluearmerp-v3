package buying

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type workspaceSummary struct {
	OpenPurchaseOrders int64 `json:"open_purchase_orders"`
	OpenRfq            int64 `json:"open_rfq"`
	PendingReceiptRows int64 `json:"pending_receipt_rows"`
	UnpaidInvoices     int64 `json:"unpaid_invoices"`
}

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/buying", func(br chi.Router) {
		br.Get("/workspace", workspaceHandler(pool))
		br.Route("/reports", func(rr chi.Router) {
			rr.With(auth.RequirePermission("buying.purchase_status", auth.AccessRead)).Get("/purchase-status/export", exportPurchaseStatusReport(pool))
			rr.With(auth.RequirePermission("buying.purchase_status", auth.AccessRead)).Get("/purchase-status", listPurchaseStatusReport(pool))
		})
	})
}

func workspaceHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		ctx := r.Context()
		var out workspaceSummary

		_ = pool.QueryRow(ctx, `
			select count(*)
			from public.po_purchase_orders
			where tenant_id = $1
			  and deleted_at is null
			  and status in ('confirmed', 'partially_received')`, tu.TenantID).Scan(&out.OpenPurchaseOrders)

		_ = pool.QueryRow(ctx, `
			select count(*)
			from public.rfq_requests
			where tenant_id = $1
			  and coalesce(status, 'draft') in ('draft', 'open', 'submitted')`, tu.TenantID).Scan(&out.OpenRfq)

		_ = pool.QueryRow(ctx, `
			select count(*)
			from public.po_purchase_order_lines ln
			join public.po_purchase_orders po on po.id = ln.purchase_order_id
			where po.tenant_id = $1
			  and po.deleted_at is null
			  and po.status in ('confirmed', 'partially_received')
			  and (ln.qty - ln.received_qty) > 0.0001`, tu.TenantID).Scan(&out.PendingReceiptRows)

		_ = pool.QueryRow(ctx, `
			select count(*)
			from public.fin_supplier_invoices si
			left join lateral (
			  select coalesce(sum(a.applied_amount), 0)::float8 as paid
			  from public.fin_payment_applications a
			  join public.fin_payment_vouchers pv on pv.id = a.payment_voucher_id
			  where a.supplier_invoice_id = si.id and pv.deleted_at is null
			) paid on true
			where si.tenant_id = $1
			  and si.deleted_at is null
			  and (si.grand_total - coalesce(paid.paid, 0)) > 0.0001`, tu.TenantID).Scan(&out.UnpaidInvoices)

		response.OK(w, out, "OK")
	}
}
