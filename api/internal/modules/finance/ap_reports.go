package finance

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type apByVendorRow struct {
	PartnerID    int64   `json:"partner_id"`
	VendorName   string  `json:"vendor_name"`
	InvPurchases float64 `json:"inv_purchases"`
	AcctPurchases float64 `json:"acct_purchases"`
	TotalBilled  float64 `json:"total_billed"`
	TotalPaid    float64 `json:"total_paid"`
	Balance      float64 `json:"balance"`
}

type supplierPaymentStatusRow struct {
	SupplierInvoiceID int64   `json:"supplier_invoice_id"`
	DateNoDisplay     string  `json:"date_no_display"`
	InvoiceNo         string  `json:"invoice_no"`
	VendorName        string  `json:"vendor_name"`
	PartnerID         int64   `json:"partner_id"`
	GrandTotal        float64 `json:"grand_total"`
	PaidAmount        float64 `json:"paid_amount"`
	Balance           float64 `json:"balance"`
	PaymentStatus     string  `json:"payment_status"`
}

func registerAPReportRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/ap-by-vendor/export", exportApByVendor(pool))
	r.Get("/ap-by-vendor", listApByVendor(pool))
	r.Get("/supplier-payment-status/export", exportSupplierPaymentStatus(pool))
	r.Get("/supplier-payment-status", listSupplierPaymentStatus(pool))
}

func apByVendorBaseSQL(tenantID int64, dateFrom, dateTo *time.Time, partnerID, locationID, projectID, picUserID *int64) (string, []any) {
	args := []any{tenantID}
	argN := 2
	dateFilter := ""
	if dateFrom != nil && dateTo != nil {
		dateFilter = fmt.Sprintf(" and si.invoice_date >= $%d::date and si.invoice_date <= $%d::date", argN, argN+1)
		args = append(args, *dateFrom, *dateTo)
		argN += 2
	}
	invFilter := ""
	if partnerID != nil {
		invFilter = fmt.Sprintf(" and si.partner_id = $%d", argN)
		args = append(args, *partnerID)
		argN++
	}
	if locationID != nil {
		invFilter += fmt.Sprintf(" and si.location_id = $%d", argN)
		args = append(args, *locationID)
		argN++
	}
	if projectID != nil {
		invFilter += fmt.Sprintf(" and si.project_id = $%d", argN)
		args = append(args, *projectID)
		argN++
	}
	if picUserID != nil {
		invFilter += fmt.Sprintf(" and si.pic_user_id = $%d", argN)
		args = append(args, *picUserID)
		argN++
	}

	q := fmt.Sprintf(`
		with inv_purchases as (
		  select si.partner_id,
		    coalesce(sum(si.grand_total), 0)::float8 as inv_purchases,
		    coalesce(sum(paid.paid), 0)::float8 as total_paid
		  from public.fin_supplier_invoices si
		  left join lateral (
		    select coalesce(sum(a.applied_amount), 0)::float8 as paid
		    from public.fin_payment_applications a
		    join public.fin_payment_vouchers pv on pv.id = a.payment_voucher_id
		    where a.supplier_invoice_id = si.id and pv.deleted_at is null
		  ) paid on true
		  where si.tenant_id = $1 and si.deleted_at is null%s%s
		  group by si.partner_id
		),
		acct_purchases as (
		  select jel.party_id as partner_id,
		    coalesce(sum(jel.debit - jel.credit), 0)::float8 as acct_purchases
		  from public.fin_journal_entry_lines jel
		  join public.fin_journal_entries je on je.id = jel.journal_entry_id and je.status = 'posted'
		  join public.fin_accounts fa on fa.id = jel.account_id and fa.account_type = 'expense'
		  where je.tenant_id = $1 and jel.party_id is not null
		    and not exists (
		      select 1 from public.fin_posting_log pl
		      where pl.journal_entry_id = je.id and pl.source_type = 'fin_supplier_invoice'
		    )
		  group by jel.party_id
		),
		partners as (
		  select p.id as partner_id, p.company_name as vendor_name
		  from public.inv_partners p
		  where p.tenant_id = $1 and p.partner_kind in ('supplier', 'both')
		)
		select p.partner_id, p.vendor_name,
		  coalesce(i.inv_purchases, 0)::float8,
		  coalesce(a.acct_purchases, 0)::float8,
		  coalesce(i.inv_purchases, 0)::float8 + coalesce(a.acct_purchases, 0)::float8,
		  coalesce(i.total_paid, 0)::float8,
		  coalesce(i.inv_purchases, 0)::float8 + coalesce(a.acct_purchases, 0)::float8 - coalesce(i.total_paid, 0)::float8
		from partners p
		left join inv_purchases i on i.partner_id = p.partner_id
		left join acct_purchases a on a.partner_id = p.partner_id
		where coalesce(i.inv_purchases, 0) + coalesce(a.acct_purchases, 0) > 0`,
		dateFilter, invFilter)
	return q, args
}

func listApByVendor(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		from, to, dateErrs := parseOptionalDateRange(r)
		if dateErrs != nil {
			response.Validation(w, dateErrs)
			return
		}
		partnerID, _ := optionalInt64Query(r, "partner_id")
		locationID, _ := optionalInt64Query(r, "location_id")
		projectID, _ := optionalInt64Query(r, "project_id")
		picUserID, _ := optionalInt64Query(r, "pic_user_id")
		p := httputil.ParseListParams(r, "vendor_name", map[string]string{
			"vendor_name":  "p.company_name",
			"total_billed": "total_billed",
			"total_paid":   "total_paid",
			"balance":      "balance",
		})
		offset := httputil.Offset(p)

		base, args := apByVendorBaseSQL(tu.TenantID, from, to, partnerID, locationID, projectID, picUserID)
		q := fmt.Sprintf(`
			select partner_id, vendor_name, inv_purchases, acct_purchases, total_billed, total_paid, balance, count(*) over()
			from (%s) sub
			order by %s %s
			limit $%d offset $%d`, base, p.Sort, orderSQL(p.Order), len(args)+1, len(args)+2)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load A/P by vendor.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []apByVendorRow
		var total int64
		for rows.Next() {
			var row apByVendorRow
			if err := rows.Scan(&row.PartnerID, &row.VendorName, &row.InvPurchases, &row.AcctPurchases, &row.TotalBilled, &row.TotalPaid, &row.Balance, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read A/P report.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []apByVendorRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func exportApByVendor(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		from, to, dateErrs := parseOptionalDateRange(r)
		if dateErrs != nil {
			response.Validation(w, dateErrs)
			return
		}
		partnerID, _ := optionalInt64Query(r, "partner_id")
		locationID, _ := optionalInt64Query(r, "location_id")
		projectID, _ := optionalInt64Query(r, "project_id")
		picUserID, _ := optionalInt64Query(r, "pic_user_id")
		base, args := apByVendorBaseSQL(tu.TenantID, from, to, partnerID, locationID, projectID, picUserID)
		q := fmt.Sprintf(`select partner_id, vendor_name, inv_purchases, acct_purchases, total_billed, total_paid, balance from (%s) sub order by vendor_name asc limit %d`, base, reportExportMaxRows)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export A/P.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="ap-by-vendor.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Vendor", "Inv. Purchases", "Acct. Purchases", "Total Billed", "Total Paid", "Balance"})
		for rows.Next() {
			var row apByVendorRow
			if err := rows.Scan(&row.PartnerID, &row.VendorName, &row.InvPurchases, &row.AcctPurchases, &row.TotalBilled, &row.TotalPaid, &row.Balance); err != nil {
				return
			}
			_ = cw.Write([]string{
				row.VendorName,
				fmt.Sprintf("%.4f", row.InvPurchases),
				fmt.Sprintf("%.4f", row.AcctPurchases),
				fmt.Sprintf("%.4f", row.TotalBilled),
				fmt.Sprintf("%.4f", row.TotalPaid),
				fmt.Sprintf("%.4f", row.Balance),
			})
		}
		cw.Flush()
	}
}

func supplierPaymentStatusSQL(tenantID int64, dateFrom, dateTo *time.Time, partnerID *int64) (string, []any) {
	args := []any{tenantID}
	argN := 2
	filters := ""
	if dateFrom != nil && dateTo != nil {
		filters += fmt.Sprintf(" and si.invoice_date >= $%d::date and si.invoice_date <= $%d::date", argN, argN+1)
		args = append(args, *dateFrom, *dateTo)
		argN += 2
	}
	if partnerID != nil {
		filters += fmt.Sprintf(" and si.partner_id = $%d", argN)
		args = append(args, *partnerID)
	}

	q := fmt.Sprintf(`
		select si.id, si.invoice_date, si.date_seq, si.invoice_no,
		  si.partner_id, p.company_name, si.grand_total::float8,
		  coalesce(paid.paid, 0)::float8,
		  (si.grand_total - coalesce(paid.paid, 0))::float8,
		  case
		    when coalesce(paid.paid, 0) <= 0.0001 then 'none'
		    when coalesce(paid.paid, 0) + 0.0001 >= si.grand_total then 'full'
		    else 'partial'
		  end as payment_status
		from public.fin_supplier_invoices si
		join public.inv_partners p on p.id = si.partner_id
		left join lateral (
		  select coalesce(sum(a.applied_amount), 0)::float8 as paid
		  from public.fin_payment_applications a
		  join public.fin_payment_vouchers pv on pv.id = a.payment_voucher_id
		  where a.supplier_invoice_id = si.id and pv.deleted_at is null
		) paid on true
		where si.tenant_id = $1 and si.deleted_at is null%s`,
		filters)
	return q, args
}

func listSupplierPaymentStatus(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		from, to, dateErrs := parseOptionalDateRange(r)
		if dateErrs != nil {
			response.Validation(w, dateErrs)
			return
		}
		partnerID, _ := optionalInt64Query(r, "partner_id")
		statusFilter := strings.TrimSpace(r.URL.Query().Get("payment_status"))
		p := httputil.ParseListParams(r, "invoice_date", map[string]string{
			"invoice_date":  "si.invoice_date",
			"invoice_no":    "si.invoice_no",
			"vendor_name":   "p.company_name",
			"grand_total":   "si.grand_total",
			"payment_status": "payment_status",
		})
		offset := httputil.Offset(p)

		base, args := supplierPaymentStatusSQL(tu.TenantID, from, to, partnerID)
		whereStatus := ""
		if statusFilter == "none" || statusFilter == "partial" || statusFilter == "full" {
			whereStatus = fmt.Sprintf(" where payment_status = $%d", len(args)+1)
			args = append(args, statusFilter)
		}

		q := fmt.Sprintf(`
			select supplier_invoice_id, date_no_display, invoice_no, partner_id, vendor_name,
			  grand_total, paid_amount, balance, payment_status, count(*) over()
			from (
			  select id as supplier_invoice_id,
			    to_char(invoice_date, 'MM/DD/YYYY') || '-' || date_seq::text as date_no_display,
			    invoice_no, partner_id, company_name as vendor_name,
			    grand_total, paid as paid_amount, balance, payment_status
			  from (%s) raw
			) sub%s
			order by %s %s
			limit $%d offset $%d`,
			base, whereStatus, p.Sort, orderSQL(p.Order), len(args)+1, len(args)+2)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load supplier payment status.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []supplierPaymentStatusRow
		var total int64
		for rows.Next() {
			var row supplierPaymentStatusRow
			if err := rows.Scan(
				&row.SupplierInvoiceID, &row.DateNoDisplay, &row.InvoiceNo, &row.PartnerID, &row.VendorName,
				&row.GrandTotal, &row.PaidAmount, &row.Balance, &row.PaymentStatus, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read supplier payment status.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []supplierPaymentStatusRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func exportSupplierPaymentStatus(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		from, to, dateErrs := parseOptionalDateRange(r)
		if dateErrs != nil {
			response.Validation(w, dateErrs)
			return
		}
		partnerID, _ := optionalInt64Query(r, "partner_id")
		base, args := supplierPaymentStatusSQL(tu.TenantID, from, to, partnerID)
		q := fmt.Sprintf(`
			select to_char(invoice_date, 'MM/DD/YYYY') || '-' || date_seq::text, invoice_no, company_name,
			  grand_total, paid, balance, payment_status
			from (%s) sub order by invoice_date desc limit %d`, base, reportExportMaxRows)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="supplier-payment-status.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Date-No", "Invoice No", "Vendor", "Grand Total", "Paid", "Balance", "Status"})
		for rows.Next() {
			var dateNo, invNo, vendor, status string
			var grand, paid, balance float64
			if err := rows.Scan(&dateNo, &invNo, &vendor, &grand, &paid, &balance, &status); err != nil {
				return
			}
			_ = cw.Write([]string{dateNo, invNo, vendor, fmt.Sprintf("%.4f", grand), fmt.Sprintf("%.4f", paid), fmt.Sprintf("%.4f", balance), status})
		}
		cw.Flush()
	}
}
