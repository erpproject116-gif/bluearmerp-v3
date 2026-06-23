package quotation

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
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/taxcalc"
)

type QuotationLine struct {
	ID          int64   `json:"id,omitempty"`
	LineNo      int     `json:"line_no"`
	ItemID      *int64  `json:"item_id,omitempty"`
	ItemCode    string  `json:"item_code"`
	ItemName    string  `json:"item_name"`
	Description *string `json:"description,omitempty"`
	Qty         float64 `json:"qty"`
	UnitNonVat  float64 `json:"unit_non_vat"`
	NonVatTotal float64 `json:"non_vat_total"`
	TaxAmount   float64 `json:"tax_amount"`
	UnitVatInc  float64 `json:"unit_vat_inc"`
	LineTotal   float64 `json:"line_total"`
	Remark      *string `json:"remark,omitempty"`
}

type Quotation struct {
	ID                      int64           `json:"id"`
	OrderDate               string          `json:"order_date"`
	DateSeq                 int             `json:"date_seq"`
	DateNoDisplay           string          `json:"date_no_display"`
	ReferenceNo             string          `json:"reference_no"`
	TaxTypeID               int64           `json:"tax_type_id"`
	TaxTypeName             string          `json:"tax_type_name,omitempty"`
	CurrencyID              int64           `json:"currency_id"`
	CurrencyCode            string          `json:"currency_code,omitempty"`
	PartnerID               int64           `json:"partner_id"`
	CustomerName            string          `json:"customer_name"`
	PicUserID               *int64          `json:"pic_user_id,omitempty"`
	PicName                 string          `json:"pic_name"`
	LocationID              int64           `json:"location_id"`
	LocationName            string          `json:"location_name,omitempty"`
	ProjectID               *int64          `json:"project_id,omitempty"`
	ProjectName             *string         `json:"project_name,omitempty"`
	QuotationValidityText   *string         `json:"quotation_validity_text,omitempty"`
	ValidityDays            *int            `json:"validity_days,omitempty"`
	ValidUntil              *string         `json:"valid_until,omitempty"`
	PaymentTerms            *string         `json:"payment_terms,omitempty"`
	NoteForPicOnly          *string         `json:"note_for_pic_only,omitempty"`
	Notes                   *string         `json:"notes,omitempty"`
	ProgressStatus          string          `json:"progress_status"`
	VoucherStatus           string          `json:"voucher_status"`
	Subtotal                float64         `json:"subtotal"`
	TaxTotal                float64         `json:"tax_total"`
	GrandTotal              float64         `json:"grand_total"`
	CreatedByUserID         *int64          `json:"created_by_user_id,omitempty"`
	CreatedByName           string          `json:"created_by_name,omitempty"`
	ItemNameSummary         string          `json:"item_name_summary,omitempty"`
	Lines                   []QuotationLine `json:"lines,omitempty"`
}

type quotationLineBody struct {
	LineNo      int     `json:"line_no"`
	ItemID      *int64  `json:"item_id"`
	ItemCode    string  `json:"item_code"`
	ItemName    string  `json:"item_name"`
	Description *string `json:"description"`
	Qty         float64 `json:"qty"`
	UnitPrice   float64 `json:"unit_price"`
	InputBasis  string  `json:"input_basis"`
	Remark      *string `json:"remark"`
}

type quotationBody struct {
	OrderDate               string              `json:"order_date"`
	TaxTypeID               int64               `json:"tax_type_id"`
	CurrencyID              int64               `json:"currency_id"`
	PartnerID               int64               `json:"partner_id"`
	PicUserID               *int64              `json:"pic_user_id"`
	PicName                 string              `json:"pic_name"`
	LocationID              int64               `json:"location_id"`
	ProjectID               *int64              `json:"project_id"`
	ProjectName             *string             `json:"project_name"`
	QuotationValidityText   *string             `json:"quotation_validity_text"`
	ValidityDays            *int                `json:"validity_days"`
	PaymentTerms            *string             `json:"payment_terms"`
	NoteForPicOnly          *string             `json:"note_for_pic_only"`
	Notes                   *string             `json:"notes"`
	ProgressStatus          string              `json:"progress_status"`
	Lines                   []quotationLineBody `json:"lines"`
}

type computedLine struct {
	LineNo      int
	ItemID      *int64
	ItemCode    string
	ItemName    string
	Description *string
	Qty         float64
	Amounts     taxcalc.LineAmounts
	Remark      *string
}

type createdSlipRow struct {
	ID         int64   `json:"id"`
	SlipType   string  `json:"slip_type"`
	SlipRef    *string `json:"slip_ref,omitempty"`
	SlipDateNo *string `json:"slip_date_no,omitempty"`
	Qty        float64 `json:"qty"`
}

type createdSlipLine struct {
	LineID     int64            `json:"line_id"`
	LineNo     int              `json:"line_no"`
	ItemCode   string           `json:"item_code"`
	ItemName   string           `json:"item_name"`
	Qty        float64          `json:"qty"`
	BalanceQty float64          `json:"balance_qty"`
	Slips      []createdSlipRow `json:"slips"`
}

func registerQuotationRoutes(r chi.Router, pool *pgxpool.Pool) {
	registerAttachmentRoutes(r, pool)
	r.Get("/quotations/preview-sequences", previewQuotationSequences(pool))
	r.Get("/quotations/status-report/export", exportQuotationStatusReport(pool))
	r.Get("/quotations/status-report", listQuotationStatusReport(pool))
	r.Get("/quotations/outstanding-report/export", exportOutstandingReport(pool))
	r.Get("/quotations/outstanding-report", listOutstandingReport(pool))
	r.Get("/quotations", listQuotations(pool))
	r.Post("/quotations", createQuotation(pool))
	r.Get("/quotations/{id}/print", getQuotationPrint(pool))
	r.Get("/quotations/{id}/created-slips", getCreatedSlips(pool))
	r.Patch("/quotations/{id}/progress-status", patchQuotationProgressStatus(pool))
	r.Get("/quotations/{id}", getQuotation(pool))
	r.Patch("/quotations/{id}", updateQuotation(pool))
	r.Delete("/quotations/{id}", deleteQuotation(pool))
}

func previewQuotationSequences(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateStr := strings.TrimSpace(r.URL.Query().Get("order_date"))
		if dateStr == "" {
			dateStr = time.Now().Format("2006-01-02")
		}
		orderDate, err := parseDate(dateStr)
		if err != nil {
			response.Validation(w, map[string]string{"order_date": "Invalid date. Use YYYY-MM-DD."})
			return
		}
		var dateSeq int
		var referenceNo string
		err = pool.QueryRow(r.Context(),
			`select date_seq, reference_no from public.preview_quotation_sequences($1, $2::date)`,
			tu.TenantID, orderDate).Scan(&dateSeq, &referenceNo)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to preview sequences.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{
			"date_seq":        dateSeq,
			"reference_no":    referenceNo,
			"date_no_display": formatDateNoDisplay(orderDate, dateSeq),
		}, "OK")
	}
}

func listQuotations(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"order_date":      "q.order_date",
		"reference_no":    "q.reference_no",
		"customer_name":   "p.company_name",
		"grand_total":     "q.grand_total",
		"progress_status": "q.progress_status",
		"valid_until":     "q.valid_until",
		"created_at":      "q.created_at",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "order_date", allowed)
		offset := httputil.Offset(p)

		where := "q.tenant_id = $1 and q.deleted_at is null"
		args := []any{tu.TenantID}
		argN := 2

		if p.Q != "" {
			where += fmt.Sprintf(` and (
				q.reference_no ilike $%d or p.company_name ilike $%d or
				exists (
					select 1 from public.quo_quotation_lines ln
					where ln.quotation_id = q.id and ln.item_name ilike $%d
				))`, argN, argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}
		progress := strings.TrimSpace(r.URL.Query().Get("progress_status"))
		if progress == "unconfirmed" || progress == "in_progress" || progress == "completed" {
			where += fmt.Sprintf(" and q.progress_status = $%d", argN)
			args = append(args, progress)
			argN++
		} else if p.Status == "unconfirmed" || p.Status == "in_progress" || p.Status == "completed" {
			where += fmt.Sprintf(" and q.progress_status = $%d", argN)
			args = append(args, p.Status)
			argN++
		}

		scope, argN := tu.PicOrCreatedScopeSQL("q", argN, &args)
		where += scope

		q := fmt.Sprintf(`
			select q.id, q.order_date, q.date_seq, q.reference_no,
			  q.tax_type_id, tt.name, q.currency_id, c.currency_code,
			  q.partner_id, p.company_name, q.pic_user_id, q.pic_name,
			  q.location_id, q.progress_status, q.valid_until, q.grand_total::float8,
			  coalesce(u.full_name, ''),
			  (select ln.item_name from public.quo_quotation_lines ln
			   where ln.quotation_id = q.id order by ln.line_no limit 1),
			  (select count(*)::int from public.quo_quotation_lines ln where ln.quotation_id = q.id),
			  count(*) over()
			from public.quo_quotations q
			join public.inv_partners p on p.id = q.partner_id
			join public.quo_tax_types tt on tt.id = q.tax_type_id
			join public.quo_currencies c on c.id = q.currency_id
			left join public.users u on u.id = q.created_by_user_id
			where %s
			order by %s %s
			limit $%d offset $%d`,
			where, p.Sort, orderSQL(p.Order), argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list quotations.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []Quotation
		var total int64
		for rows.Next() {
			var row Quotation
			var orderDate time.Time
			var validUntil *time.Time
			var firstItemName *string
			var lineCount int
			if err := rows.Scan(
				&row.ID, &orderDate, &row.DateSeq, &row.ReferenceNo,
				&row.TaxTypeID, &row.TaxTypeName, &row.CurrencyID, &row.CurrencyCode,
				&row.PartnerID, &row.CustomerName, &row.PicUserID, &row.PicName,
				&row.LocationID, &row.ProgressStatus, &validUntil, &row.GrandTotal,
				&row.CreatedByName, &firstItemName, &lineCount, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read quotations.", "ERR_INTERNAL")
				return
			}
			row.OrderDate = dateToStr(orderDate)
			row.DateNoDisplay = formatDateNoDisplay(orderDate, row.DateSeq)
			row.ValidUntil = datePtrToStr(validUntil)
			row.ItemNameSummary = formatItemNameSummary(firstItemName, lineCount)
			out = append(out, row)
		}
		if out == nil {
			out = []Quotation{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func formatItemNameSummary(first *string, lineCount int) string {
	if first == nil || strings.TrimSpace(*first) == "" {
		return ""
	}
	name := strings.TrimSpace(*first)
	if lineCount <= 1 {
		return name
	}
	return fmt.Sprintf("%s+%d", name, lineCount-1)
}

func getQuotation(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		q, err := loadQuotation(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Quotation not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, q, "OK")
	}
}

func loadQuotation(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (Quotation, error) {
	var q Quotation
	var orderDate time.Time
	var validUntil *time.Time
	var createdByName *string

	err := pool.QueryRow(ctx, `
		select q.id, q.order_date, q.date_seq, q.reference_no,
		  q.tax_type_id, tt.name, q.currency_id, c.currency_code,
		  q.partner_id, p.company_name, q.pic_user_id, q.pic_name,
		  q.location_id, l.location_name, q.project_id, q.project_name,
		  q.quotation_validity_text, q.validity_days, q.valid_until,
		  q.payment_terms, q.note_for_pic_only, q.notes,
		  q.progress_status, q.voucher_status,
		  q.subtotal::float8, q.tax_total::float8, q.grand_total::float8,
		  q.created_by_user_id, u.full_name
		from public.quo_quotations q
		join public.inv_partners p on p.id = q.partner_id
		join public.quo_tax_types tt on tt.id = q.tax_type_id
		join public.quo_currencies c on c.id = q.currency_id
		join public.inv_locations l on l.id = q.location_id
		left join public.users u on u.id = q.created_by_user_id
		where q.id = $1 and q.tenant_id = $2 and q.deleted_at is null`,
		id, tenantID).Scan(
		&q.ID, &orderDate, &q.DateSeq, &q.ReferenceNo,
		&q.TaxTypeID, &q.TaxTypeName, &q.CurrencyID, &q.CurrencyCode,
		&q.PartnerID, &q.CustomerName, &q.PicUserID, &q.PicName,
		&q.LocationID, &q.LocationName, &q.ProjectID, &q.ProjectName,
		&q.QuotationValidityText, &q.ValidityDays, &validUntil,
		&q.PaymentTerms, &q.NoteForPicOnly, &q.Notes,
		&q.ProgressStatus, &q.VoucherStatus,
		&q.Subtotal, &q.TaxTotal, &q.GrandTotal,
		&q.CreatedByUserID, &createdByName,
	)
	if err != nil {
		return Quotation{}, err
	}
	q.OrderDate = dateToStr(orderDate)
	q.DateNoDisplay = formatDateNoDisplay(orderDate, q.DateSeq)
	q.ValidUntil = datePtrToStr(validUntil)
	if createdByName != nil {
		q.CreatedByName = *createdByName
	}

	lines, err := loadQuotationLines(ctx, pool, id)
	if err != nil {
		return Quotation{}, err
	}
	q.Lines = lines
	return q, nil
}

func loadQuotationLines(ctx context.Context, pool *pgxpool.Pool, quotationID int64) ([]QuotationLine, error) {
	rows, err := pool.Query(ctx, `
		select id, line_no, item_id, item_code, item_name, description,
		  qty::float8, unit_non_vat::float8, non_vat_total::float8, tax_amount::float8,
		  unit_vat_inc::float8, line_total::float8, remark
		from public.quo_quotation_lines
		where quotation_id = $1
		order by line_no`, quotationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var lines []QuotationLine
	for rows.Next() {
		var ln QuotationLine
		if err := rows.Scan(&ln.ID, &ln.LineNo, &ln.ItemID, &ln.ItemCode, &ln.ItemName, &ln.Description,
			&ln.Qty, &ln.UnitNonVat, &ln.NonVatTotal, &ln.TaxAmount,
			&ln.UnitVatInc, &ln.LineTotal, &ln.Remark); err != nil {
			return nil, err
		}
		lines = append(lines, ln)
	}
	if lines == nil {
		lines = []QuotationLine{}
	}
	return lines, nil
}

func createQuotation(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body quotationBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateQuotationBody(body, true); errs != nil {
			response.Validation(w, errs)
			return
		}

		orderDate, err := parseDate(body.OrderDate)
		if err != nil {
			response.Validation(w, map[string]string{"order_date": "Invalid date. Use YYYY-MM-DD."})
			return
		}

		tt, err := loadTaxCalcType(r.Context(), pool, tu.TenantID, body.TaxTypeID)
		if err != nil {
			response.Validation(w, map[string]string{"tax_type_id": "Tax type not found."})
			return
		}

		computed, errs := computeQuotationLines(tt, body.Lines)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		subtotal, taxTotal, grandTotal := sumQuotationTotals(computed)
		validityDays := resolveValidityDays(body)
		validUntil := computeValidUntil(orderDate, validityDays)

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var dateSeq int
		var referenceNo string
		if err := tx.QueryRow(r.Context(),
			`select date_seq, reference_no from public.allocate_quotation_sequences($1, $2::date)`,
			tu.TenantID, orderDate).Scan(&dateSeq, &referenceNo); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to allocate sequences.", "ERR_INTERNAL")
			return
		}

		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.quo_quotations (
			  tenant_id, order_date, date_seq, reference_no,
			  tax_type_id, currency_id, partner_id, pic_user_id, pic_name,
			  location_id, project_id, project_name,
			  quotation_validity_text, validity_days, valid_until,
			  payment_terms, note_for_pic_only, notes,
			  progress_status, subtotal, tax_total, grand_total, created_by_user_id
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
			returning id`,
			tu.TenantID, orderDate, dateSeq, referenceNo,
			body.TaxTypeID, body.CurrencyID, body.PartnerID, body.PicUserID, strings.TrimSpace(body.PicName),
			body.LocationID, body.ProjectID, body.ProjectName,
			body.QuotationValidityText, validityDays, validUntil,
			body.PaymentTerms, body.NoteForPicOnly, body.Notes,
			defaultProgress(body.ProgressStatus), subtotal, taxTotal, grandTotal, tu.AppUserID).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to insert quotation.", "ERR_INTERNAL")
			return
		}

		if err := replaceQuotationLines(r.Context(), tx, id, computed); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save lines.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "quotation.create", "quo_quotation", &id, nil, body)
		q, _ := loadQuotation(r.Context(), pool, tu.TenantID, id)
		response.OK(w, q, "Created.")
	}
}

func updateQuotation(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body quotationBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateQuotationBody(body, false); errs != nil {
			response.Validation(w, errs)
			return
		}

		orderDate, err := parseDate(body.OrderDate)
		if err != nil {
			response.Validation(w, map[string]string{"order_date": "Invalid date."})
			return
		}

		tt, err := loadTaxCalcType(r.Context(), pool, tu.TenantID, body.TaxTypeID)
		if err != nil {
			response.Validation(w, map[string]string{"tax_type_id": "Tax type not found."})
			return
		}

		computed, errs := computeQuotationLines(tt, body.Lines)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		subtotal, taxTotal, grandTotal := sumQuotationTotals(computed)
		validityDays := resolveValidityDays(body)
		validUntil := computeValidUntil(orderDate, validityDays)

		before, _ := loadQuotation(r.Context(), pool, tu.TenantID, id)

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		tag, err := tx.Exec(r.Context(), `
			update public.quo_quotations set
			  order_date = $1, tax_type_id = $2, currency_id = $3, partner_id = $4,
			  pic_user_id = $5, pic_name = $6, location_id = $7,
			  project_id = $8, project_name = $9,
			  quotation_validity_text = $10, validity_days = $11, valid_until = $12,
			  payment_terms = $13, note_for_pic_only = $14, notes = $15,
			  progress_status = $16, subtotal = $17, tax_total = $18, grand_total = $19,
			  updated_at = now()
			where id = $20 and tenant_id = $21 and deleted_at is null`,
			orderDate, body.TaxTypeID, body.CurrencyID, body.PartnerID,
			body.PicUserID, strings.TrimSpace(body.PicName), body.LocationID,
			body.ProjectID, body.ProjectName,
			body.QuotationValidityText, validityDays, validUntil,
			body.PaymentTerms, body.NoteForPicOnly, body.Notes,
			defaultProgress(body.ProgressStatus), subtotal, taxTotal, grandTotal,
			id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Quotation not found.", "ERR_NOT_FOUND")
			return
		}

		if err := replaceQuotationLines(r.Context(), tx, id, computed); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save lines.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "quotation.update", "quo_quotation", &id, before, body)
		q, _ := loadQuotation(r.Context(), pool, tu.TenantID, id)
		response.OK(w, q, "Updated.")
	}
}

func deleteQuotation(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		softDelete(pool, w, r, "quo_quotations", "quotation.delete", "quo_quotation")
	}
}

func replaceQuotationLines(ctx context.Context, tx pgx.Tx, quotationID int64, lines []computedLine) error {
	if _, err := tx.Exec(ctx, `delete from public.quo_quotation_lines where quotation_id = $1`, quotationID); err != nil {
		return err
	}
	for i, ln := range lines {
		lineNo := ln.LineNo
		if lineNo <= 0 {
			lineNo = i + 1
		}
		_, err := tx.Exec(ctx, `
			insert into public.quo_quotation_lines (
			  quotation_id, line_no, item_id, item_code, item_name, description,
			  qty, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total, remark
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
			quotationID, lineNo, ln.ItemID, strings.TrimSpace(ln.ItemCode), strings.TrimSpace(ln.ItemName), ln.Description,
			ln.Qty, ln.Amounts.UnitNonVat, ln.Amounts.NonVatTotal, ln.Amounts.TaxAmount,
			ln.Amounts.UnitVatInc, ln.Amounts.LineTotal, ln.Remark)
		if err != nil {
			return err
		}
	}
	return nil
}

func computeQuotationLines(tt taxcalc.TaxType, lines []quotationLineBody) ([]computedLine, map[string]string) {
	errs := map[string]string{}
	var out []computedLine
	for i, ln := range lines {
		if ln.Qty <= 0 {
			errs[fmt.Sprintf("lines[%d].qty", i)] = "Quantity must be greater than zero."
			continue
		}
		inputBasis := ln.InputBasis
		if inputBasis == "" {
			inputBasis = taxcalc.InputVatIncUnit
		}
		if inputBasis != taxcalc.InputVatIncUnit && inputBasis != taxcalc.InputNonVatUnit {
			errs[fmt.Sprintf("lines[%d].input_basis", i)] = "Must be vat_inc_unit or non_vat_unit."
			continue
		}
		amounts := taxcalc.ComputeLine(tt, ln.UnitPrice, ln.Qty, inputBasis)
		out = append(out, computedLine{
			LineNo:      ln.LineNo,
			ItemID:      ln.ItemID,
			ItemCode:    ln.ItemCode,
			ItemName:    ln.ItemName,
			Description: ln.Description,
			Qty:         ln.Qty,
			Amounts:     amounts,
			Remark:      ln.Remark,
		})
	}
	if len(errs) > 0 {
		return nil, errs
	}
	if out == nil {
		out = []computedLine{}
	}
	return out, nil
}

func sumQuotationTotals(lines []computedLine) (subtotal, taxTotal, grandTotal float64) {
	for _, ln := range lines {
		subtotal += ln.Amounts.NonVatTotal
		taxTotal += ln.Amounts.TaxAmount
		grandTotal += ln.Amounts.LineTotal
	}
	return subtotal, taxTotal, grandTotal
}

func resolveValidityDays(body quotationBody) *int {
	if body.ValidityDays != nil {
		return body.ValidityDays
	}
	if body.QuotationValidityText != nil {
		return parseValidityDays(*body.QuotationValidityText)
	}
	return nil
}

func validateQuotationBody(b quotationBody, create bool) map[string]string {
	errs := map[string]string{}
	if create && strings.TrimSpace(b.OrderDate) == "" {
		errs["order_date"] = "Order date is required."
	}
	if b.TaxTypeID <= 0 {
		errs["tax_type_id"] = "Transaction type is required."
	}
	if b.CurrencyID <= 0 {
		errs["currency_id"] = "Currency is required."
	}
	if b.PartnerID <= 0 {
		errs["partner_id"] = "Customer is required."
	}
	if b.LocationID <= 0 {
		errs["location_id"] = "Location is required."
	}
	if b.ProgressStatus != "" && b.ProgressStatus != "unconfirmed" &&
		b.ProgressStatus != "in_progress" && b.ProgressStatus != "completed" {
		errs["progress_status"] = "Must be unconfirmed, in_progress, or completed."
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func getCreatedSlips(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}

		var exists bool
		if err := pool.QueryRow(r.Context(),
			`select exists(select 1 from public.quo_quotations where id = $1 and tenant_id = $2 and deleted_at is null)`,
			id, tu.TenantID).Scan(&exists); err != nil || !exists {
			response.Err(w, http.StatusNotFound, "Quotation not found.", "ERR_NOT_FOUND")
			return
		}

		rows, err := pool.Query(r.Context(), `
			select ln.id, ln.line_no, ln.item_code, ln.item_name, ln.qty::float8,
			  coalesce(slip.fulfilled, 0)::float8
			from public.quo_quotation_lines ln
			left join (
			  select quotation_line_id, sum(qty) as fulfilled
			  from public.quo_quotation_slip_lines
			  group by quotation_line_id
			) slip on slip.quotation_line_id = ln.id
			where ln.quotation_id = $1
			order by ln.line_no`, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load slips.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []createdSlipLine
		for rows.Next() {
			var line createdSlipLine
			var fulfilled float64
			if err := rows.Scan(&line.LineID, &line.LineNo, &line.ItemCode, &line.ItemName, &line.Qty, &fulfilled); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read slips.", "ERR_INTERNAL")
				return
			}
			line.BalanceQty = line.Qty - fulfilled
			if line.BalanceQty < 0 {
				line.BalanceQty = 0
			}
			line.Slips = []createdSlipRow{}
			out = append(out, line)
		}

		if len(out) > 0 {
			lineIDs := make([]int64, len(out))
			for i, ln := range out {
				lineIDs[i] = ln.LineID
			}
			slipRows, err := pool.Query(r.Context(), `
				select id, quotation_line_id, slip_type, slip_ref, slip_date_no, qty::float8
				from public.quo_quotation_slip_lines
				where quotation_line_id = any($1)
				order by quotation_line_id, created_at`, lineIDs)
			if err == nil {
				defer slipRows.Close()
				byLine := map[int64][]createdSlipRow{}
				for slipRows.Next() {
					var s createdSlipRow
					var lineID int64
					if err := slipRows.Scan(&s.ID, &lineID, &s.SlipType, &s.SlipRef, &s.SlipDateNo, &s.Qty); err == nil {
						byLine[lineID] = append(byLine[lineID], s)
					}
				}
				for i := range out {
					if slips, ok := byLine[out[i].LineID]; ok {
						out[i].Slips = slips
					}
				}
			}
		}
		if out == nil {
			out = []createdSlipLine{}
		}
		response.OK(w, out, "OK")
	}
}
