package finance

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth/datascope"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type PaymentApplication struct {
	ID                int64   `json:"id,omitempty"`
	SupplierInvoiceID int64   `json:"supplier_invoice_id"`
	InvoiceNo         string  `json:"invoice_no,omitempty"`
	DateNoDisplay     string  `json:"date_no_display,omitempty"`
	GrandTotal        float64 `json:"grand_total,omitempty"`
	AppliedAmount     float64 `json:"applied_amount"`
	OutstandingAmt    float64 `json:"outstanding_amount,omitempty"`
}

type PaymentVoucher struct {
	ID              int64                `json:"id"`
	PaymentDate     string               `json:"payment_date"`
	DateSeq         int                  `json:"date_seq"`
	DateNoDisplay   string               `json:"date_no_display"`
	PaymentNo       string               `json:"payment_no"`
	PartnerID       int64                `json:"partner_id"`
	VendorName      string               `json:"vendor_name"`
	CurrencyID      int64                `json:"currency_id"`
	CurrencyCode    string               `json:"currency_code,omitempty"`
	PaymentMethod   string               `json:"payment_method"`
	ReferenceNo     *string              `json:"reference_no,omitempty"`
	Notes           *string              `json:"notes,omitempty"`
	AmountTotal     float64              `json:"amount_total"`
	CreatedByName   string               `json:"created_by_name,omitempty"`
	Applications    []PaymentApplication `json:"applications,omitempty"`
}

type paymentApplicationBody struct {
	SupplierInvoiceID int64   `json:"supplier_invoice_id"`
	AppliedAmount     float64 `json:"applied_amount"`
}

type paymentVoucherBody struct {
	PaymentDate   string                   `json:"payment_date"`
	PartnerID     int64                    `json:"partner_id"`
	CurrencyID    int64                    `json:"currency_id"`
	PaymentMethod string                   `json:"payment_method"`
	ReferenceNo   *string                  `json:"reference_no"`
	Notes         *string                  `json:"notes"`
	Applications  []paymentApplicationBody `json:"applications"`
}

func registerPaymentVoucherRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/payment-vouchers/preview-sequences", previewPaymentVoucherSequences(pool))
	r.Get("/payment-vouchers", listPaymentVouchers(pool))
	r.With(auth.RequirePermission("finance.payment_vouchers_new", auth.AccessWrite)).Post("/payment-vouchers", createPaymentVoucher(pool))
	r.Get("/payment-vouchers/{id}", getPaymentVoucher(pool))
	r.Delete("/payment-vouchers/{id}", deletePaymentVoucher(pool))
}

func previewPaymentVoucherSequences(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateStr := strings.TrimSpace(r.URL.Query().Get("payment_date"))
		if dateStr == "" {
			dateStr = time.Now().Format("2006-01-02")
		}
		paymentDate, err := parseDate(dateStr)
		if err != nil {
			response.Validation(w, map[string]string{"payment_date": "Invalid date. Use YYYY-MM-DD."})
			return
		}
		var dateSeq int
		var paymentNo string
		err = pool.QueryRow(r.Context(),
			`select date_seq, payment_no from public.preview_fin_payment_voucher_sequences($1, $2::date)`,
			tu.TenantID, paymentDate).Scan(&dateSeq, &paymentNo)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to preview sequences.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{
			"date_seq":        dateSeq,
			"payment_no":      paymentNo,
			"date_no_display": formatDateNoDisplay(paymentDate, dateSeq),
		}, "OK")
	}
}

func listPaymentVouchers(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"payment_date":   "pv.payment_date",
		"payment_no":     "pv.payment_no",
		"vendor_name":    "p.company_name",
		"payment_method": "pv.payment_method",
		"amount_total":   "pv.amount_total",
		"created_at":     "pv.created_at",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "payment_date", allowed)
		offset := httputil.Offset(p)

		where := "pv.tenant_id = $1 and pv.deleted_at is null"
		args := []any{tu.TenantID}
		argN := 2
		if p.Q != "" {
			where += fmt.Sprintf(` and (pv.payment_no ilike $%d or p.company_name ilike $%d or coalesce(pv.reference_no, '') ilike $%d)`, argN, argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}
		if pm := strings.TrimSpace(r.URL.Query().Get("payment_method")); pm == "cash" || pm == "check" || pm == "bank_transfer" {
			where += fmt.Sprintf(" and pv.payment_method = $%d", argN)
			args = append(args, pm)
			argN++
		}

		dsScope, argN, err := datascope.ApplyUserScopesSQL(r.Context(), pool, tu, datascope.ListFilter{
			CustomerColumn: "pv.partner_id",
		}, argN, &args)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to apply data scopes.", "ERR_INTERNAL")
			return
		}
		where += dsScope

		q := fmt.Sprintf(`
			select pv.id, pv.payment_date, pv.date_seq, pv.payment_no,
			  pv.partner_id, p.company_name, pv.currency_id, c.currency_code,
			  pv.payment_method, pv.reference_no, pv.amount_total::float8, count(*) over()
			from public.fin_payment_vouchers pv
			join public.inv_partners p on p.id = pv.partner_id
			join public.quo_currencies c on c.id = pv.currency_id
			where %s
			order by %s %s
			limit $%d offset $%d`, where, p.Sort, orderSQL(p.Order), argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list payment vouchers.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []PaymentVoucher
		var total int64
		for rows.Next() {
			var row PaymentVoucher
			var paymentDate time.Time
			var refNo *string
			if err := rows.Scan(
				&row.ID, &paymentDate, &row.DateSeq, &row.PaymentNo,
				&row.PartnerID, &row.VendorName, &row.CurrencyID, &row.CurrencyCode,
				&row.PaymentMethod, &refNo, &row.AmountTotal, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read payment vouchers.", "ERR_INTERNAL")
				return
			}
			row.PaymentDate = dateToStr(paymentDate)
			row.DateNoDisplay = formatDateNoDisplay(paymentDate, row.DateSeq)
			row.ReferenceNo = refNo
			out = append(out, row)
		}
		if out == nil {
			out = []PaymentVoucher{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getPaymentVoucher(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		pv, err := loadPaymentVoucher(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Payment voucher not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, pv, "OK")
	}
}

func loadPaymentVoucher(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (PaymentVoucher, error) {
	var pv PaymentVoucher
	var paymentDate time.Time
	var createdByName *string
	err := pool.QueryRow(ctx, `
		select pv.id, pv.payment_date, pv.date_seq, pv.payment_no,
		  pv.partner_id, p.company_name, pv.currency_id, c.currency_code,
		  pv.payment_method, pv.reference_no, pv.notes, pv.amount_total::float8,
		  u.full_name
		from public.fin_payment_vouchers pv
		join public.inv_partners p on p.id = pv.partner_id
		join public.quo_currencies c on c.id = pv.currency_id
		left join public.users u on u.id = pv.created_by_user_id
		where pv.id = $1 and pv.tenant_id = $2 and pv.deleted_at is null`,
		id, tenantID).Scan(
		&pv.ID, &paymentDate, &pv.DateSeq, &pv.PaymentNo,
		&pv.PartnerID, &pv.VendorName, &pv.CurrencyID, &pv.CurrencyCode,
		&pv.PaymentMethod, &pv.ReferenceNo, &pv.Notes, &pv.AmountTotal, &createdByName,
	)
	if err != nil {
		return PaymentVoucher{}, err
	}
	pv.PaymentDate = dateToStr(paymentDate)
	pv.DateNoDisplay = formatDateNoDisplay(paymentDate, pv.DateSeq)
	if createdByName != nil {
		pv.CreatedByName = *createdByName
	}
	apps, err := loadPaymentApplications(ctx, pool, tenantID, id)
	if err != nil {
		return PaymentVoucher{}, err
	}
	pv.Applications = apps
	return pv, nil
}

func loadPaymentApplications(ctx context.Context, pool *pgxpool.Pool, tenantID, paymentID int64) ([]PaymentApplication, error) {
	rows, err := pool.Query(ctx, `
		select a.id, a.supplier_invoice_id, si.invoice_no, si.invoice_date, si.date_seq,
		  si.grand_total::float8, a.applied_amount::float8
		from public.fin_payment_applications a
		join public.fin_supplier_invoices si on si.id = a.supplier_invoice_id and si.tenant_id = $1 and si.deleted_at is null
		where a.payment_voucher_id = $2
		order by a.id`, tenantID, paymentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var apps []PaymentApplication
	for rows.Next() {
		var app PaymentApplication
		var invoiceDate time.Time
		var dateSeq int
		if err := rows.Scan(&app.ID, &app.SupplierInvoiceID, &app.InvoiceNo, &invoiceDate, &dateSeq, &app.GrandTotal, &app.AppliedAmount); err != nil {
			return nil, err
		}
		app.DateNoDisplay = formatDateNoDisplay(invoiceDate, dateSeq)
		outstanding, err := supplierInvoiceOutstanding(ctx, pool, tenantID, app.SupplierInvoiceID, &paymentID)
		if err != nil {
			return nil, err
		}
		app.OutstandingAmt = outstanding + app.AppliedAmount
		apps = append(apps, app)
	}
	if apps == nil {
		apps = []PaymentApplication{}
	}
	return apps, nil
}

func validatePaymentVoucherBody(body paymentVoucherBody) map[string]string {
	errs := map[string]string{}
	if strings.TrimSpace(body.PaymentDate) == "" {
		errs["payment_date"] = "Payment date is required."
	}
	if body.PartnerID <= 0 {
		errs["partner_id"] = "Vendor is required."
	}
	if body.CurrencyID <= 0 {
		errs["currency_id"] = "Currency is required."
	}
	pm := strings.TrimSpace(body.PaymentMethod)
	if pm != "cash" && pm != "check" && pm != "bank_transfer" {
		errs["payment_method"] = "Payment method must be cash, check, or bank_transfer."
	}
	if len(body.Applications) == 0 {
		errs["applications"] = "At least one supplier invoice application is required."
	}
	seen := map[int64]bool{}
	for i, app := range body.Applications {
		key := fmt.Sprintf("applications[%d]", i)
		if app.SupplierInvoiceID <= 0 {
			errs[key+".supplier_invoice_id"] = "Supplier invoice is required."
		} else if seen[app.SupplierInvoiceID] {
			errs[key+".supplier_invoice_id"] = "Duplicate supplier invoice."
		} else {
			seen[app.SupplierInvoiceID] = true
		}
		if app.AppliedAmount <= 0 {
			errs[key+".applied_amount"] = "Applied amount must be greater than zero."
		}
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func validatePaymentApplications(ctx context.Context, pool *pgxpool.Pool, tenantID, partnerID int64, apps []paymentApplicationBody, excludePaymentID *int64) map[string]string {
	errs := map[string]string{}
	for i, app := range apps {
		key := fmt.Sprintf("applications[%d]", i)
		var invPartnerID int64
		err := pool.QueryRow(ctx, `
			select partner_id from public.fin_supplier_invoices
			where id = $1 and tenant_id = $2 and deleted_at is null`,
			app.SupplierInvoiceID, tenantID).Scan(&invPartnerID)
		if err != nil {
			errs[key+".supplier_invoice_id"] = "Supplier invoice not found."
			continue
		}
		if invPartnerID != partnerID {
			errs[key+".supplier_invoice_id"] = "Invoice vendor does not match payment vendor."
		}
		outstanding, err := supplierInvoiceOutstanding(ctx, pool, tenantID, app.SupplierInvoiceID, excludePaymentID)
		if err != nil {
			errs[key+".applied_amount"] = "Failed to validate balance."
			continue
		}
		if app.AppliedAmount > outstanding+0.0001 {
			errs[key+".applied_amount"] = fmt.Sprintf("Applied amount exceeds outstanding balance (%.4f).", outstanding)
		}
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func sumPaymentApplicationAmounts(apps []paymentApplicationBody) float64 {
	var total float64
	for _, a := range apps {
		total += a.AppliedAmount
	}
	return total
}

func insertPaymentApplications(ctx context.Context, tx pgx.Tx, paymentID int64, apps []paymentApplicationBody) error {
	for _, app := range apps {
		_, err := tx.Exec(ctx, `
			insert into public.fin_payment_applications (payment_voucher_id, supplier_invoice_id, applied_amount)
			values ($1, $2, $3)`,
			paymentID, app.SupplierInvoiceID, app.AppliedAmount)
		if err != nil {
			return err
		}
	}
	return nil
}

func createPaymentVoucher(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body paymentVoucherBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validatePaymentVoucherBody(body); errs != nil {
			response.Validation(w, errs)
			return
		}
		paymentDate, err := parseDate(body.PaymentDate)
		if err != nil {
			response.Validation(w, map[string]string{"payment_date": "Invalid date. Use YYYY-MM-DD."})
			return
		}
		if errs := validatePaymentApplications(r.Context(), pool, tu.TenantID, body.PartnerID, body.Applications, nil); errs != nil {
			response.Validation(w, errs)
			return
		}
		amountTotal := sumPaymentApplicationAmounts(body.Applications)

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var dateSeq int
		var paymentNo string
		if err := tx.QueryRow(r.Context(),
			`select date_seq, payment_no from public.allocate_fin_payment_voucher_sequences($1, $2::date)`,
			tu.TenantID, paymentDate).Scan(&dateSeq, &paymentNo); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to allocate sequences.", "ERR_INTERNAL")
			return
		}

		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.fin_payment_vouchers (
			  tenant_id, payment_date, date_seq, payment_no,
			  partner_id, currency_id, payment_method, reference_no, notes,
			  amount_total, created_by_user_id
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
			returning id`,
			tu.TenantID, paymentDate, dateSeq, paymentNo,
			body.PartnerID, body.CurrencyID, strings.TrimSpace(body.PaymentMethod),
			body.ReferenceNo, body.Notes, amountTotal, tu.AppUserID).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to insert payment voucher.", "ERR_INTERNAL")
			return
		}

		if err := insertPaymentApplications(r.Context(), tx, id, body.Applications); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save applications.", "ERR_INTERNAL")
			return
		}

		ev := buildPVPostingEvent(tu.TenantID, id, body.PartnerID, amountTotal, body.PaymentMethod)
		if err := postWithJournalPoster(r.Context(), tx, tu.TenantID, ev); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to post journal entry.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.payment_voucher.create", "fin_payment_voucher", &id, nil, body)
		pv, _ := loadPaymentVoucher(r.Context(), pool, tu.TenantID, id)
		response.OK(w, pv, "Created.")
	}
}

func deletePaymentVoucher(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		softDelete(pool, w, r, "fin_payment_vouchers", "finance.payment_voucher.delete", "fin_payment_voucher")
	}
}
