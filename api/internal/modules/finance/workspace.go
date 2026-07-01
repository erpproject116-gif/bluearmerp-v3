package finance

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type financeWorkspaceSummary struct {
	ArCustomers            int64 `json:"ar_customers"`
	UnpaidSupplierInvoices int64 `json:"unpaid_supplier_invoices"`
	DraftJournalEntries    int64 `json:"draft_journal_entries"`
	UnmatchedBankLines     int64 `json:"unmatched_bank_lines"`
	ApOverApplication      int64 `json:"ap_over_application"`
}

func registerFinanceWorkspaceRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/workspace", financeWorkspaceHandler(pool))
}

func financeWorkspaceHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		ctx := r.Context()
		var out financeWorkspaceSummary

		_ = pool.QueryRow(ctx, `
			select count(*) from (
			  select s.partner_id
			  from public.sa_sales s
			  left join lateral (
			    select coalesce(sum(a.applied_amount), 0)::float8 as received
			    from public.fin_receipt_applications a
			    join public.fin_official_receipts r on r.id = a.official_receipt_id
			    where a.sales_id = s.id and r.deleted_at is null
			  ) recv on true
			  where s.tenant_id = $1 and s.deleted_at is null
			  group by s.partner_id
			  having coalesce(sum(s.grand_total), 0) - coalesce(sum(recv.received), 0) > 0
			) ar`, tu.TenantID).Scan(&out.ArCustomers)

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
			  and (si.grand_total - coalesce(paid.paid, 0)) > 0.0001`, tu.TenantID).Scan(&out.UnpaidSupplierInvoices)

		_ = pool.QueryRow(ctx, `
			select count(*)
			from public.fin_journal_entries
			where tenant_id = $1 and status = 'draft'`, tu.TenantID).Scan(&out.DraftJournalEntries)

		_ = pool.QueryRow(ctx, `
			select count(*)
			from public.fin_bank_statement_lines
			where tenant_id = $1 and matched_payment_id is null`, tu.TenantID).Scan(&out.UnmatchedBankLines)

		_ = pool.QueryRow(ctx, `
			select count(*)
			from public.fin_supplier_invoices si
			left join (
			  select supplier_invoice_id, sum(applied_amount) as applied
			  from public.fin_payment_applications
			  group by supplier_invoice_id
			) paid on paid.supplier_invoice_id = si.id
			where si.tenant_id = $1 and si.deleted_at is null
			  and coalesce(paid.applied, 0) > si.grand_total + 0.0001`, tu.TenantID).Scan(&out.ApOverApplication)

		response.OK(w, out, "OK")
	}
}
