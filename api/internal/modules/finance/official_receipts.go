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
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type ReceiptApplication struct {
	ID             int64   `json:"id,omitempty"`
	SalesID        int64   `json:"sales_id"`
	SalesNo        string  `json:"sales_no,omitempty"`
	DateNoDisplay  string  `json:"date_no_display,omitempty"`
	GrandTotal     float64 `json:"grand_total,omitempty"`
	AppliedAmount  float64 `json:"applied_amount"`
	OutstandingAmt float64 `json:"outstanding_amount,omitempty"`
}

type OfficialReceipt struct {
	ID              int64                `json:"id"`
	ReceiptDate     string               `json:"receipt_date"`
	DateSeq         int                  `json:"date_seq"`
	DateNoDisplay   string               `json:"date_no_display"`
	ReceiptNo       string               `json:"receipt_no"`
	PartnerID       int64                `json:"partner_id"`
	CustomerName    string               `json:"customer_name"`
	CurrencyID      int64                `json:"currency_id"`
	CurrencyCode    string               `json:"currency_code,omitempty"`
	PaymentMethod   string               `json:"payment_method"`
	ReferenceNo     *string              `json:"reference_no,omitempty"`
	Notes           *string              `json:"notes,omitempty"`
	AmountTotal     float64              `json:"amount_total"`
	CreatedByUserID *int64               `json:"created_by_user_id,omitempty"`
	CreatedByName   string               `json:"created_by_name,omitempty"`
	Applications    []ReceiptApplication `json:"applications,omitempty"`
}

type applicationBody struct {
	SalesID       int64   `json:"sales_id"`
	AppliedAmount float64 `json:"applied_amount"`
}

type receiptBody struct {
	ReceiptDate   string            `json:"receipt_date"`
	PartnerID     int64             `json:"partner_id"`
	CurrencyID    int64             `json:"currency_id"`
	PaymentMethod string            `json:"payment_method"`
	ReferenceNo   *string           `json:"reference_no"`
	Notes         *string           `json:"notes"`
	Applications  []applicationBody `json:"applications"`
}

func registerOfficialReceiptRoutes(r chi.Router, pool *pgxpool.Pool) {
	registerBankAccountRoutes(r, pool)
	registerReceiptJournalRoutes(r, pool)
	registerORAttachmentRoutes(r, pool)
	r.Get("/official-receipts/preview-sequences", previewReceiptSequences(pool))
	r.Get("/official-receipts", listOfficialReceipts(pool))
	r.Post("/official-receipts", createOfficialReceipt(pool))
	r.Get("/official-receipts/{id}", getOfficialReceipt(pool))
	r.Patch("/official-receipts/{id}", updateOfficialReceipt(pool))
	r.Delete("/official-receipts/{id}", deleteOfficialReceipt(pool))
}

func previewReceiptSequences(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateStr := strings.TrimSpace(r.URL.Query().Get("receipt_date"))
		if dateStr == "" {
			dateStr = time.Now().Format("2006-01-02")
		}
		receiptDate, err := parseDate(dateStr)
		if err != nil {
			response.Validation(w, map[string]string{"receipt_date": "Invalid date. Use YYYY-MM-DD."})
			return
		}
		var dateSeq int
		var receiptNo string
		err = pool.QueryRow(r.Context(),
			`select date_seq, receipt_no from public.preview_fin_receipt_sequences($1, $2::date)`,
			tu.TenantID, receiptDate).Scan(&dateSeq, &receiptNo)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to preview sequences.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{
			"date_seq":        dateSeq,
			"receipt_no":      receiptNo,
			"date_no_display": formatDateNoDisplay(receiptDate, dateSeq),
		}, "OK")
	}
}

func listOfficialReceipts(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"receipt_date":   "r.receipt_date",
		"receipt_no":     "r.receipt_no",
		"customer_name":  "p.company_name",
		"payment_method": "r.payment_method",
		"amount_total":   "r.amount_total",
		"created_at":     "r.created_at",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "receipt_date", allowed)
		offset := httputil.Offset(p)

		where := "r.tenant_id = $1 and r.deleted_at is null"
		args := []any{tu.TenantID}
		argN := 2

		if p.Q != "" {
			where += fmt.Sprintf(` and (
				r.receipt_no ilike $%d or p.company_name ilike $%d or
				coalesce(r.reference_no, '') ilike $%d)`, argN, argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}
		if pm := strings.TrimSpace(r.URL.Query().Get("payment_method")); pm == "cash" || pm == "check" || pm == "bank_transfer" {
			where += fmt.Sprintf(" and r.payment_method = $%d", argN)
			args = append(args, pm)
			argN++
		}
		if pid, ok := optionalInt64Query(r, "partner_id"); ok {
			where += fmt.Sprintf(" and r.partner_id = $%d", argN)
			args = append(args, *pid)
			argN++
		}

		q := fmt.Sprintf(`
			select r.id, r.receipt_date, r.date_seq, r.receipt_no,
			  r.partner_id, p.company_name, r.currency_id, c.currency_code,
			  r.payment_method, r.reference_no, r.amount_total::float8,
			  coalesce(u.full_name, ''), count(*) over()
			from public.fin_official_receipts r
			join public.inv_partners p on p.id = r.partner_id
			join public.quo_currencies c on c.id = r.currency_id
			left join public.users u on u.id = r.created_by_user_id
			where %s
			order by %s %s
			limit $%d offset $%d`,
			where, p.Sort, orderSQL(p.Order), argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list official receipts.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []OfficialReceipt
		var total int64
		for rows.Next() {
			var row OfficialReceipt
			var receiptDate time.Time
			var refNo *string
			if err := rows.Scan(
				&row.ID, &receiptDate, &row.DateSeq, &row.ReceiptNo,
				&row.PartnerID, &row.CustomerName, &row.CurrencyID, &row.CurrencyCode,
				&row.PaymentMethod, &refNo, &row.AmountTotal,
				&row.CreatedByName, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read official receipts.", "ERR_INTERNAL")
				return
			}
			row.ReceiptDate = dateToStr(receiptDate)
			row.DateNoDisplay = formatDateNoDisplay(receiptDate, row.DateSeq)
			row.ReferenceNo = refNo
			out = append(out, row)
		}
		if out == nil {
			out = []OfficialReceipt{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getOfficialReceipt(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		rec, err := loadReceiptJournal(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Official receipt not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, rec, "OK")
	}
}

func loadOfficialReceipt(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (OfficialReceipt, error) {
	var rec OfficialReceipt
	var receiptDate time.Time
	var createdByName *string

	err := pool.QueryRow(ctx, `
		select r.id, r.receipt_date, r.date_seq, r.receipt_no,
		  r.partner_id, p.company_name, r.currency_id, c.currency_code,
		  r.payment_method, r.reference_no, r.notes, r.amount_total::float8,
		  r.created_by_user_id, u.full_name
		from public.fin_official_receipts r
		join public.inv_partners p on p.id = r.partner_id
		join public.quo_currencies c on c.id = r.currency_id
		left join public.users u on u.id = r.created_by_user_id
		where r.id = $1 and r.tenant_id = $2 and r.deleted_at is null`,
		id, tenantID).Scan(
		&rec.ID, &receiptDate, &rec.DateSeq, &rec.ReceiptNo,
		&rec.PartnerID, &rec.CustomerName, &rec.CurrencyID, &rec.CurrencyCode,
		&rec.PaymentMethod, &rec.ReferenceNo, &rec.Notes, &rec.AmountTotal,
		&rec.CreatedByUserID, &createdByName,
	)
	if err != nil {
		return OfficialReceipt{}, err
	}
	rec.ReceiptDate = dateToStr(receiptDate)
	rec.DateNoDisplay = formatDateNoDisplay(receiptDate, rec.DateSeq)
	if createdByName != nil {
		rec.CreatedByName = *createdByName
	}

	apps, err := loadReceiptApplications(ctx, pool, tenantID, id)
	if err != nil {
		return OfficialReceipt{}, err
	}
	rec.Applications = apps
	return rec, nil
}

func loadReceiptApplications(ctx context.Context, pool *pgxpool.Pool, tenantID, receiptID int64) ([]ReceiptApplication, error) {
	rows, err := pool.Query(ctx, `
		select a.id, a.sales_id, s.sales_no, s.order_date, s.date_seq, s.grand_total::float8, a.applied_amount::float8
		from public.fin_receipt_applications a
		join public.sa_sales s on s.id = a.sales_id and s.tenant_id = $1 and s.deleted_at is null
		where a.official_receipt_id = $2
		order by a.id`, tenantID, receiptID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var apps []ReceiptApplication
	for rows.Next() {
		var app ReceiptApplication
		var orderDate time.Time
		var dateSeq int
		if err := rows.Scan(&app.ID, &app.SalesID, &app.SalesNo, &orderDate, &dateSeq, &app.GrandTotal, &app.AppliedAmount); err != nil {
			return nil, err
		}
		app.DateNoDisplay = formatDateNoDisplay(orderDate, dateSeq)
		outstanding, err := saleOutstandingAmount(ctx, pool, tenantID, app.SalesID, &receiptID)
		if err != nil {
			return nil, err
		}
		app.OutstandingAmt = outstanding + app.AppliedAmount
		apps = append(apps, app)
	}
	if apps == nil {
		apps = []ReceiptApplication{}
	}
	return apps, nil
}

func saleOutstandingAmount(ctx context.Context, pool *pgxpool.Pool, tenantID, salesID int64, excludeReceiptID *int64) (float64, error) {
	var grandTotal float64
	err := pool.QueryRow(ctx, `
		select grand_total::float8 from public.sa_sales
		where id = $1 and tenant_id = $2 and deleted_at is null`, salesID, tenantID).Scan(&grandTotal)
	if err != nil {
		return 0, err
	}

	q := `
		select coalesce(sum(a.applied_amount), 0)::float8
		from public.fin_receipt_applications a
		join public.fin_official_receipts r on r.id = a.official_receipt_id
		where a.sales_id = $1 and r.tenant_id = $2 and r.deleted_at is null`
	args := []any{salesID, tenantID}
	if excludeReceiptID != nil {
		q += ` and r.id <> $3`
		args = append(args, *excludeReceiptID)
	}
	var applied float64
	if err := pool.QueryRow(ctx, q, args...).Scan(&applied); err != nil {
		return 0, err
	}
	return grandTotal - applied, nil
}

func validateReceiptBody(body receiptBody) map[string]string {
	errs := map[string]string{}
	if strings.TrimSpace(body.ReceiptDate) == "" {
		errs["receipt_date"] = "Receipt date is required."
	}
	if body.PartnerID <= 0 {
		errs["partner_id"] = "Customer is required."
	}
	if body.CurrencyID <= 0 {
		errs["currency_id"] = "Currency is required."
	}
	pm := strings.TrimSpace(body.PaymentMethod)
	if pm != "cash" && pm != "check" && pm != "bank_transfer" {
		errs["payment_method"] = "Payment method must be cash, check, or bank_transfer."
	}
	if len(body.Applications) == 0 {
		errs["applications"] = "At least one sales application is required."
	}
	seenSales := map[int64]bool{}
	for i, app := range body.Applications {
		key := fmt.Sprintf("applications[%d]", i)
		if app.SalesID <= 0 {
			errs[key+".sales_id"] = "Sales is required."
		} else if seenSales[app.SalesID] {
			errs[key+".sales_id"] = "Duplicate sales in applications."
		} else {
			seenSales[app.SalesID] = true
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

func validateApplications(ctx context.Context, pool *pgxpool.Pool, tenantID, partnerID int64, apps []applicationBody, excludeReceiptID *int64) map[string]string {
	errs := map[string]string{}
	for i, app := range apps {
		key := fmt.Sprintf("applications[%d]", i)
		var salePartnerID int64
		var grandTotal float64
		err := pool.QueryRow(ctx, `
			select partner_id, grand_total::float8 from public.sa_sales
			where id = $1 and tenant_id = $2 and deleted_at is null`,
			app.SalesID, tenantID).Scan(&salePartnerID, &grandTotal)
		if err != nil {
			errs[key+".sales_id"] = "Sales not found."
			continue
		}
		if salePartnerID != partnerID {
			errs[key+".sales_id"] = "Sales customer does not match receipt customer."
		}
		outstanding, err := saleOutstandingAmount(ctx, pool, tenantID, app.SalesID, excludeReceiptID)
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

func sumApplicationAmounts(apps []applicationBody) float64 {
	var total float64
	for _, a := range apps {
		total += a.AppliedAmount
	}
	return total
}

func createOfficialReceipt(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body receiptBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateReceiptBody(body); errs != nil {
			response.Validation(w, errs)
			return
		}
		receiptDate, err := parseDate(body.ReceiptDate)
		if err != nil {
			response.Validation(w, map[string]string{"receipt_date": "Invalid date. Use YYYY-MM-DD."})
			return
		}
		if errs := validateApplications(r.Context(), pool, tu.TenantID, body.PartnerID, body.Applications, nil); errs != nil {
			response.Validation(w, errs)
			return
		}
		amountTotal := sumApplicationAmounts(body.Applications)

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var dateSeq int
		var receiptNo string
		if err := tx.QueryRow(r.Context(),
			`select date_seq, receipt_no from public.allocate_fin_receipt_sequences($1, $2::date)`,
			tu.TenantID, receiptDate).Scan(&dateSeq, &receiptNo); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to allocate sequences.", "ERR_INTERNAL")
			return
		}

		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.fin_official_receipts (
			  tenant_id, receipt_date, date_seq, receipt_no,
			  partner_id, currency_id, payment_method, reference_no, notes,
			  amount_total, created_by_user_id, accounting_slip_no
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
			returning id`,
			tu.TenantID, receiptDate, dateSeq, receiptNo,
			body.PartnerID, body.CurrencyID, strings.TrimSpace(body.PaymentMethod),
			body.ReferenceNo, body.Notes, amountTotal, tu.AppUserID, "CR "+receiptNo).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to insert official receipt.", "ERR_INTERNAL")
			return
		}

		if err := insertReceiptApplications(r.Context(), tx, id, body.Applications); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save applications.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.receipt.create", "fin_official_receipt", &id, nil, body)
		rec, _ := loadOfficialReceipt(r.Context(), pool, tu.TenantID, id)
		response.OK(w, rec, "Created.")
	}
}

func updateOfficialReceipt(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body receiptBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateReceiptBody(body); errs != nil {
			response.Validation(w, errs)
			return
		}
		receiptDate, err := parseDate(body.ReceiptDate)
		if err != nil {
			response.Validation(w, map[string]string{"receipt_date": "Invalid date. Use YYYY-MM-DD."})
			return
		}
		if errs := validateApplications(r.Context(), pool, tu.TenantID, body.PartnerID, body.Applications, &id); errs != nil {
			response.Validation(w, errs)
			return
		}
		amountTotal := sumApplicationAmounts(body.Applications)
		before, _ := loadOfficialReceipt(r.Context(), pool, tu.TenantID, id)

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		tag, err := tx.Exec(r.Context(), `
			update public.fin_official_receipts set
			  receipt_date = $1, partner_id = $2, currency_id = $3,
			  payment_method = $4, reference_no = $5, notes = $6,
			  amount_total = $7, updated_by_user_id = $8, updated_at = now()
			where id = $9 and tenant_id = $10 and deleted_at is null`,
			receiptDate, body.PartnerID, body.CurrencyID,
			strings.TrimSpace(body.PaymentMethod), body.ReferenceNo, body.Notes,
			amountTotal, tu.AppUserID, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Official receipt not found.", "ERR_NOT_FOUND")
			return
		}

		if _, err := tx.Exec(r.Context(), `delete from public.fin_receipt_applications where official_receipt_id = $1`, id); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update applications.", "ERR_INTERNAL")
			return
		}
		if err := insertReceiptApplications(r.Context(), tx, id, body.Applications); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save applications.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}

		rec, _ := loadOfficialReceipt(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.receipt.update", "fin_official_receipt", &id, before, rec)
		response.OK(w, rec, "Updated.")
	}
}

func deleteOfficialReceipt(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		softDelete(pool, w, r, "fin_official_receipts", "finance.receipt.delete", "fin_official_receipt")
	}
}

func insertReceiptApplications(ctx context.Context, tx pgx.Tx, receiptID int64, apps []applicationBody) error {
	for _, app := range apps {
		if _, err := tx.Exec(ctx, `
			insert into public.fin_receipt_applications (official_receipt_id, sales_id, applied_amount)
			values ($1, $2, $3)`,
			receiptID, app.SalesID, app.AppliedAmount); err != nil {
			return err
		}
	}
	return nil
}

func optionalInt64Query(r *http.Request, key string) (*int64, bool) {
	s := strings.TrimSpace(r.URL.Query().Get(key))
	if s == "" {
		return nil, false
	}
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil || n <= 0 {
		return nil, false
	}
	return &n, true
}
