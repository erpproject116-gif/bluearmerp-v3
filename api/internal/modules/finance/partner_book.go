package finance

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
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type partnerBookRow struct {
	TxnDate      string  `json:"txn_date"`
	SlipType     string  `json:"slip_type"`
	SlipNo       string  `json:"slip_no"`
	DateNoDisplay string `json:"date_no_display"`
	PartnerID    int64   `json:"partner_id"`
	PartnerName  string  `json:"partner_name"`
	Description  string  `json:"description"`
	Debit        float64 `json:"debit"`
	Credit       float64 `json:"credit"`
}

type partnerBookFilters struct {
	BookType  string
	DateFrom  time.Time
	DateTo    time.Time
	PartnerID *int64
}

func parsePartnerBookFilters(r *http.Request) (partnerBookFilters, map[string]string) {
	bookType := strings.TrimSpace(r.URL.Query().Get("book_type"))
	switch bookType {
	case "ar", "ap":
	default:
		return partnerBookFilters{}, map[string]string{"book_type": "Must be ar or ap."}
	}
	fromStr := strings.TrimSpace(r.URL.Query().Get("date_from"))
	toStr := strings.TrimSpace(r.URL.Query().Get("date_to"))
	errs := map[string]string{}
	if fromStr == "" {
		errs["date_from"] = "Start date is required."
	}
	if toStr == "" {
		errs["date_to"] = "End date is required."
	}
	if len(errs) > 0 {
		return partnerBookFilters{}, errs
	}
	from, err := parseDate(fromStr)
	if err != nil {
		errs["date_from"] = "Invalid date. Use YYYY-MM-DD."
	}
	to, err := parseDate(toStr)
	if err != nil {
		errs["date_to"] = "Invalid date. Use YYYY-MM-DD."
	}
	if len(errs) > 0 {
		return partnerBookFilters{}, errs
	}
	if from.After(to) {
		errs["date_to"] = "End date must be on or after start date."
		return partnerBookFilters{}, errs
	}
	var partnerID *int64
	if v := strings.TrimSpace(r.URL.Query().Get("partner_id")); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			partnerID = &n
		}
	}
	return partnerBookFilters{BookType: bookType, DateFrom: from, DateTo: to, PartnerID: partnerID}, nil
}

func partnerBookARSQL(tenantID int64, f partnerBookFilters) (string, []any) {
	args := []any{tenantID, f.DateFrom.Format("2006-01-02"), f.DateTo.Format("2006-01-02")}
	partnerFilter := ""
	if f.PartnerID != nil {
		partnerFilter = " and partner_id = $4"
		args = append(args, *f.PartnerID)
	}
	q := fmt.Sprintf(`
		select txn_date, slip_type, slip_no, date_no_display, partner_id, partner_name, description, debit, credit
		from (
		  select s.order_date as txn_date, 'Sales Invoice' as slip_type, s.sales_no as slip_no,
		    to_char(s.order_date, 'MM/DD/YYYY') || '-' || s.date_seq as date_no_display,
		    s.partner_id, p.company_name as partner_name,
		    coalesce(s.si_dr_no, s.sales_no) as description,
		    s.grand_total::float8 as debit, 0::float8 as credit
		  from public.sa_sales s
		  join public.inv_partners p on p.id = s.partner_id
		  where s.tenant_id = $1 and s.deleted_at is null
		    and s.order_date >= $2::date and s.order_date <= $3::date
		  union all
		  select r.receipt_date, 'Official Receipt', r.receipt_no,
		    to_char(r.receipt_date, 'MM/DD/YYYY') || '-' || r.date_seq,
		    r.partner_id, p.company_name,
		    coalesce(r.reference, r.receipt_no),
		    0::float8, a.applied_amount::float8
		  from public.fin_receipt_applications a
		  join public.fin_official_receipts r on r.id = a.official_receipt_id
		  join public.inv_partners p on p.id = r.partner_id
		  where r.tenant_id = $1 and r.deleted_at is null
		    and r.receipt_date >= $2::date and r.receipt_date <= $3::date
		) sub
		where 1=1%s
		order by txn_date asc, slip_type asc, slip_no asc`, partnerFilter)
	return q, args
}

func partnerBookAPSQL(tenantID int64, f partnerBookFilters) (string, []any) {
	args := []any{tenantID, f.DateFrom.Format("2006-01-02"), f.DateTo.Format("2006-01-02")}
	partnerFilter := ""
	if f.PartnerID != nil {
		partnerFilter = " and partner_id = $4"
		args = append(args, *f.PartnerID)
	}
	q := fmt.Sprintf(`
		select txn_date, slip_type, slip_no, date_no_display, partner_id, partner_name, description, debit, credit
		from (
		  select si.invoice_date as txn_date, 'Supplier Invoice' as slip_type, si.invoice_no as slip_no,
		    to_char(si.invoice_date, 'MM/DD/YYYY') || '-' || si.date_seq as date_no_display,
		    si.partner_id, p.company_name as partner_name,
		    coalesce(si.vendor_invoice_no, si.invoice_no) as description,
		    0::float8 as debit, si.grand_total::float8 as credit
		  from public.fin_supplier_invoices si
		  join public.inv_partners p on p.id = si.partner_id
		  where si.tenant_id = $1 and si.deleted_at is null
		    and si.invoice_date >= $2::date and si.invoice_date <= $3::date
		  union all
		  select pv.payment_date, 'Payment Voucher', pv.payment_no,
		    to_char(pv.payment_date, 'MM/DD/YYYY') || '-' || pv.date_seq,
		    pv.partner_id, p.company_name,
		    coalesce(pv.reference, pv.payment_no),
		    a.applied_amount::float8, 0::float8
		  from public.fin_payment_applications a
		  join public.fin_payment_vouchers pv on pv.id = a.payment_voucher_id
		  join public.inv_partners p on p.id = pv.partner_id
		  where pv.tenant_id = $1 and pv.deleted_at is null
		    and pv.payment_date >= $2::date and pv.payment_date <= $3::date
		) sub
		where 1=1%s
		order by txn_date asc, slip_type asc, slip_no asc`, partnerFilter)
	return q, args
}

func listCustomerVendorBook(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parsePartnerBookFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		p := httputil.ParseListParams(r, "txn_date", map[string]string{
			"txn_date":     "txn_date",
			"partner_name": "partner_name",
			"slip_no":      "slip_no",
		})
		offset := httputil.Offset(p)

		var base string
		var args []any
		if f.BookType == "ar" {
			base, args = partnerBookARSQL(tu.TenantID, f)
		} else {
			base, args = partnerBookAPSQL(tu.TenantID, f)
		}

		countQ := fmt.Sprintf("select count(*) from (%s) sub", base)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count partner book.", "ERR_INTERNAL")
			return
		}

		args = append(args, p.PageSize, offset)
		q := fmt.Sprintf("select txn_date::text, slip_type, slip_no, date_no_display, partner_id, partner_name, description, debit, credit from (%s) sub limit $%d offset $%d",
			base, len(args)-1, len(args))

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load partner book.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []partnerBookRow
		for rows.Next() {
			var row partnerBookRow
			if err := rows.Scan(&row.TxnDate, &row.SlipType, &row.SlipNo, &row.DateNoDisplay, &row.PartnerID, &row.PartnerName, &row.Description, &row.Debit, &row.Credit); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read partner book.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []partnerBookRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func exportCustomerVendorBook(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parsePartnerBookFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		var base string
		var args []any
		if f.BookType == "ar" {
			base, args = partnerBookARSQL(tu.TenantID, f)
		} else {
			base, args = partnerBookAPSQL(tu.TenantID, f)
		}
		q := fmt.Sprintf("select txn_date::text, slip_type, slip_no, date_no_display, partner_name, description, debit, credit from (%s) sub limit %d", base, reportExportMaxRows)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export partner book.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="customer-vendor-book-%s.csv"`, f.BookType))
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Date", "Slip Type", "Slip No", "Date No", "Partner", "Description", "Debit", "Credit"})
		for rows.Next() {
			var row partnerBookRow
			if err := rows.Scan(&row.TxnDate, &row.SlipType, &row.SlipNo, &row.DateNoDisplay, &row.PartnerName, &row.Description, &row.Debit, &row.Credit); err != nil {
				return
			}
			_ = cw.Write([]string{
				row.TxnDate, row.SlipType, row.SlipNo, row.DateNoDisplay, row.PartnerName, row.Description,
				strconv.FormatFloat(row.Debit, 'f', -1, 64),
				strconv.FormatFloat(row.Credit, 'f', -1, 64),
			})
		}
		cw.Flush()
	}
}
