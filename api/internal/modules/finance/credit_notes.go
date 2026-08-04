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

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"

)



type creditNoteLine struct {

	ID        int64    `json:"id,omitempty"`

	LineNo    int      `json:"line_no"`

	ItemID    *int64   `json:"item_id,omitempty"`

	ItemCode  string   `json:"item_code"`

	ItemName  string   `json:"item_name"`

	Qty       float64  `json:"qty"`

	UnitPrice float64  `json:"unit_price"`

	TaxAmount float64  `json:"tax_amount"`

	Amount    float64  `json:"amount"`

}



type creditNoteRow struct {

	ID                      int64            `json:"id"`

	CreditDate              string           `json:"credit_date"`

	CreditNo                string           `json:"credit_no"`

	PartnerID               *int64           `json:"partner_id,omitempty"`

	CustomerName            string           `json:"customer_name"`

	SourceSalesID           *int64           `json:"source_sales_id,omitempty"`

	SourceSalesReturnID     *int64           `json:"source_sales_return_id,omitempty"`

	AmountTotal             float64          `json:"amount_total"`

	RemainingAmount         float64          `json:"remaining_amount"`

	Status                  string           `json:"status"`

	Reason                  string           `json:"reason"`

	Notes                   string           `json:"notes"`

	RefundedAt              *string          `json:"refunded_at,omitempty"`

	RefundMethod            *string          `json:"refund_method,omitempty"`

	RefundReference         *string          `json:"refund_reference,omitempty"`

	RefundPaymentVoucherID  *int64           `json:"refund_payment_voucher_id,omitempty"`

	Lines                   []creditNoteLine `json:"lines,omitempty"`

}



type creditNoteBody struct {

	CreditDate          string           `json:"credit_date"`

	PartnerID           *int64           `json:"partner_id"`

	CustomerName        string           `json:"customer_name"`

	SourceSalesID       *int64           `json:"source_sales_id"`

	SourceSalesReturnID *int64           `json:"source_sales_return_id"`

	AmountTotal         float64          `json:"amount_total"`

	Reason              string           `json:"reason"`

	Notes               string           `json:"notes"`

	Status              string           `json:"status"`

	Lines               []creditNoteLine `json:"lines"`

}



type creditApplyBody struct {

	SalesID       int64   `json:"sales_id"`

	AppliedAmount float64 `json:"applied_amount"`

}



type creditRefundBody struct {

	RefundMethod    string `json:"refund_method"`

	RefundReference string `json:"refund_reference"`

	BankAccountID   *int64 `json:"bank_account_id"`

}



func registerCreditNoteRoutes(r chi.Router, pool *pgxpool.Pool) {

	r.With(auth.RequirePermission("finance.credit_notes", auth.AccessRead)).Get("/credit-notes", listCreditNotes(pool))

	r.With(auth.RequirePermission("finance.credit_notes_write", auth.AccessWrite)).Post("/credit-notes", createCreditNote(pool))
	r.With(auth.RequirePermission("finance.credit_notes_write", auth.AccessWrite)).Post("/credit-notes/from-sales-return/{returnId}", createCreditNoteFromSalesReturn(pool))

	r.With(auth.RequirePermission("finance.credit_notes", auth.AccessRead)).Get("/credit-notes/{id}", getCreditNote(pool))

	r.With(auth.RequirePermission("finance.credit_notes", auth.AccessRead)).Get("/credit-notes/{id}/print", getCreditNotePrint(pool))

	r.With(auth.RequirePermission("finance.credit_notes_write", auth.AccessWrite)).Patch("/credit-notes/{id}", updateCreditNote(pool))

	r.With(auth.RequirePermission("finance.credit_notes_write", auth.AccessWrite)).Post("/credit-notes/{id}/post", postCreditNote(pool))

	r.With(auth.RequirePermission("finance.credit_notes_write", auth.AccessWrite)).Post("/credit-notes/{id}/apply", applyCreditNote(pool))

	r.With(auth.RequirePermission("finance.credit_notes_write", auth.AccessWrite)).Post("/credit-notes/{id}/convert-to-cash", convertCreditNoteToCash(pool))

	r.With(auth.RequirePermission("finance.credit_notes_write", auth.AccessWrite)).Post("/credit-notes/{id}/cancel", cancelCreditNote(pool))

	r.With(auth.RequirePermission("finance.credit_notes", auth.AccessRead)).Get("/credit-notes/{id}/applications", listCreditNoteApplications(pool))

	r.With(auth.RequirePermission("finance.credit_notes_write", auth.AccessWrite)).Delete("/credit-notes/{id}", softDeleteCreditNote(pool))

}



func getCreditNote(pool *pgxpool.Pool) http.HandlerFunc {

	return func(w http.ResponseWriter, r *http.Request) {

		tu, _ := auth.FromContext(r.Context())

		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)

		if err != nil {

			response.Validation(w, map[string]string{"id": "Invalid id."})

			return

		}

		row, err := loadCreditNote(r.Context(), pool, tu.TenantID, id)

		if err != nil {

			response.Err(w, http.StatusNotFound, "Credit note not found.", "ERR_NOT_FOUND")

			return

		}

		response.OK(w, row, "OK")

	}

}



func loadCreditNote(ctx context.Context, q pgxQueryable, tenantID, id int64) (creditNoteRow, error) {

	var row creditNoteRow

	err := q.QueryRow(ctx, `

		select c.id, c.credit_date::text, c.credit_no, c.partner_id, c.customer_name, c.source_sales_id, c.source_sales_return_id,

		  c.amount_total::float8, c.remaining_amount::float8, c.status, c.reason, c.notes,

		  c.refunded_at::text, c.refund_method, c.refund_reference, c.refund_payment_voucher_id

		from public.fin_credit_notes c

		where c.id = $1 and c.tenant_id = $2 and c.deleted_at is null`, id, tenantID).Scan(

		&row.ID, &row.CreditDate, &row.CreditNo, &row.PartnerID, &row.CustomerName, &row.SourceSalesID, &row.SourceSalesReturnID,

		&row.AmountTotal, &row.RemainingAmount, &row.Status, &row.Reason, &row.Notes,

		&row.RefundedAt, &row.RefundMethod, &row.RefundReference, &row.RefundPaymentVoucherID,

	)

	if err != nil {

		return creditNoteRow{}, err

	}

	lines, err := loadCreditNoteLines(ctx, q, id)

	if err != nil {

		return creditNoteRow{}, err

	}

	row.Lines = lines

	return row, nil

}



func loadCreditNoteLines(ctx context.Context, q pgxQueryable, creditNoteID int64) ([]creditNoteLine, error) {

	rows, err := q.Query(ctx, `

		select id, line_no, item_id, item_code, item_name, qty::float8, unit_price::float8, tax_amount::float8, amount::float8

		from public.fin_credit_note_lines

		where credit_note_id = $1

		order by line_no, id`, creditNoteID)

	if err != nil {

		return nil, err

	}

	defer rows.Close()

	out := []creditNoteLine{}

	for rows.Next() {

		var line creditNoteLine

		if err := rows.Scan(&line.ID, &line.LineNo, &line.ItemID, &line.ItemCode, &line.ItemName,

			&line.Qty, &line.UnitPrice, &line.TaxAmount, &line.Amount); err != nil {

			return nil, err

		}

		out = append(out, line)

	}

	return out, rows.Err()

}



func saveCreditNoteLines(ctx context.Context, tx pgx.Tx, creditNoteID int64, lines []creditNoteLine) error {

	if _, err := tx.Exec(ctx, `delete from public.fin_credit_note_lines where credit_note_id = $1`, creditNoteID); err != nil {

		return err

	}

	for i, line := range lines {

		lineNo := line.LineNo

		if lineNo <= 0 {

			lineNo = i + 1

		}

		qty := line.Qty

		if qty <= 0 {

			qty = 1

		}

		amount := lineAmount(line)

		_, err := tx.Exec(ctx, `

			insert into public.fin_credit_note_lines (

			  credit_note_id, line_no, item_id, item_code, item_name, qty, unit_price, tax_amount, amount

			) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,

			creditNoteID, lineNo, line.ItemID,

			strings.TrimSpace(line.ItemCode), strings.TrimSpace(line.ItemName),

			qty, line.UnitPrice, line.TaxAmount, amount)

		if err != nil {

			return err

		}

	}

	return nil

}



func lineAmount(line creditNoteLine) float64 {

	if line.Amount > 0 {

		return line.Amount

	}

	qty := line.Qty

	if qty <= 0 {

		qty = 1

	}

	return qty*line.UnitPrice + line.TaxAmount

}



func sumCreditNoteLineAmount(lines []creditNoteLine) float64 {

	var total float64

	for _, line := range lines {

		total += lineAmount(line)

	}

	return total

}



func resolveCreditNoteAmount(body creditNoteBody) (float64, error) {

	if len(body.Lines) > 0 {

		total := sumCreditNoteLineAmount(body.Lines)

		if total < 0 {

			return 0, fmt.Errorf("line amounts must be >= 0")

		}

		return total, nil

	}

	if body.AmountTotal < 0 {

		return 0, fmt.Errorf("amount must be >= 0")

	}

	return body.AmountTotal, nil

}



func listCreditNotes(pool *pgxpool.Pool) http.HandlerFunc {

	return func(w http.ResponseWriter, r *http.Request) {

		tu, _ := auth.FromContext(r.Context())

		status := strings.TrimSpace(r.URL.Query().Get("status"))

		where := "c.tenant_id = $1 and c.deleted_at is null"

		args := []any{tu.TenantID}

		n := 2

		if status != "" {

			where += fmt.Sprintf(" and c.status = $%d", n)

			args = append(args, status)

			n++

		}

		if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {

			where += fmt.Sprintf(" and (c.credit_no ilike $%d or c.customer_name ilike $%d or c.reason ilike $%d)", n, n, n)

			args = append(args, "%"+q+"%")

		}

		rows, err := pool.Query(r.Context(), fmt.Sprintf(`

			select c.id, c.credit_date::text, c.credit_no, c.partner_id, c.customer_name, c.source_sales_id, c.source_sales_return_id,

			  c.amount_total::float8, c.remaining_amount::float8, c.status, c.reason, c.notes,

			  c.refunded_at::text, c.refund_method, c.refund_reference, c.refund_payment_voucher_id

			from public.fin_credit_notes c

			where %s

			order by c.credit_date desc, c.id desc

			limit 200`, where), args...)

		if err != nil {

			response.Err(w, http.StatusInternalServerError, "Failed to list credit notes. Apply migration 223 if needed.", "ERR_INTERNAL")

			return

		}

		defer rows.Close()

		out := []creditNoteRow{}

		for rows.Next() {

			var row creditNoteRow

			if err := rows.Scan(&row.ID, &row.CreditDate, &row.CreditNo, &row.PartnerID, &row.CustomerName, &row.SourceSalesID, &row.SourceSalesReturnID,

				&row.AmountTotal, &row.RemainingAmount, &row.Status, &row.Reason, &row.Notes,

				&row.RefundedAt, &row.RefundMethod, &row.RefundReference, &row.RefundPaymentVoucherID); err != nil {

				response.Err(w, http.StatusInternalServerError, "Failed to read credit notes.", "ERR_INTERNAL")

				return

			}

			out = append(out, row)

		}

		response.OK(w, out, "OK")

	}

}



func createCreditNote(pool *pgxpool.Pool) http.HandlerFunc {

	return func(w http.ResponseWriter, r *http.Request) {

		tu, _ := auth.FromContext(r.Context())

		var body creditNoteBody

		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {

			response.Validation(w, map[string]string{"body": "Invalid JSON."})

			return

		}

		amountTotal, err := resolveCreditNoteAmount(body)

		if err != nil {

			response.Validation(w, map[string]string{"amount_total": err.Error()})

			return

		}

		creditDate := time.Now()

		if strings.TrimSpace(body.CreditDate) != "" {

			d, err := time.Parse("2006-01-02", strings.TrimSpace(body.CreditDate))

			if err != nil {

				response.Validation(w, map[string]string{"credit_date": "Invalid date. Use YYYY-MM-DD."})

				return

			}

			creditDate = d

		}

		customer := strings.TrimSpace(body.CustomerName)

		if customer == "" && body.PartnerID != nil {

			_ = pool.QueryRow(r.Context(), `select coalesce(company_name, '') from public.inv_partners where id = $1 and tenant_id = $2`,

				*body.PartnerID, tu.TenantID).Scan(&customer)

		}



		tx, err := pool.Begin(r.Context())

		if err != nil {

			response.Err(w, http.StatusInternalServerError, "Failed to create credit note.", "ERR_INTERNAL")

			return

		}

		defer tx.Rollback(r.Context())



		var seq int

		_ = tx.QueryRow(r.Context(), `

			select coalesce(max(date_seq), 0) + 1 from public.fin_credit_notes

			where tenant_id = $1 and credit_date = $2::date`, tu.TenantID, creditDate.Format("2006-01-02")).Scan(&seq)

		if seq <= 0 {

			seq = 1

		}

		creditNo := fmt.Sprintf("CN-%s-%d", creditDate.Format("20060102"), seq)

		status := "draft"

		if body.Status == "open" {

			status = "open"

		}

		remaining := amountTotal

		if status != "open" {

			remaining = amountTotal

		}

		var id int64

		err = tx.QueryRow(r.Context(), `

			insert into public.fin_credit_notes (

			  tenant_id, credit_date, date_seq, credit_no, partner_id, customer_name,

			  source_sales_id, source_sales_return_id,

			  amount_total, remaining_amount, status, reason, notes, created_by_user_id

			) values ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)

			returning id`,

			tu.TenantID, creditDate.Format("2006-01-02"), seq, creditNo, body.PartnerID, customer,

			body.SourceSalesID, body.SourceSalesReturnID,

			amountTotal, remaining, status, strings.TrimSpace(body.Reason), strings.TrimSpace(body.Notes), tu.AppUserID,

		).Scan(&id)

		if err != nil {

			response.Err(w, http.StatusInternalServerError, "Failed to create credit note.", "ERR_INTERNAL")

			return

		}

		if len(body.Lines) > 0 {

			if err := saveCreditNoteLines(r.Context(), tx, id, body.Lines); err != nil {

				response.Err(w, http.StatusInternalServerError, "Failed to save lines.", "ERR_INTERNAL")

				return

			}

		}

		if err := tx.Commit(r.Context()); err != nil {

			response.Err(w, http.StatusInternalServerError, "Failed to create credit note.", "ERR_INTERNAL")

			return

		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "credit_note.create", "credit_note", &id, nil, nil)

		response.OK(w, map[string]any{"id": id, "credit_no": creditNo}, "Credit note created.")

	}

}



func updateCreditNote(pool *pgxpool.Pool) http.HandlerFunc {

	return func(w http.ResponseWriter, r *http.Request) {

		tu, _ := auth.FromContext(r.Context())

		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)

		if err != nil {

			response.Validation(w, map[string]string{"id": "Invalid id."})

			return

		}

		var body creditNoteBody

		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {

			response.Validation(w, map[string]string{"body": "Invalid JSON."})

			return

		}

		amountTotal, err := resolveCreditNoteAmount(body)

		if err != nil {

			response.Validation(w, map[string]string{"amount_total": err.Error()})

			return

		}



		tx, err := pool.Begin(r.Context())

		if err != nil {

			response.Err(w, http.StatusInternalServerError, "Failed to update.", "ERR_INTERNAL")

			return

		}

		defer tx.Rollback(r.Context())



		tag, err := tx.Exec(r.Context(), `

			update public.fin_credit_notes set

			  customer_name = coalesce(nullif($3, ''), customer_name),

			  partner_id = coalesce($4, partner_id),

			  reason = coalesce(nullif($5, ''), reason),

			  notes = coalesce(nullif($6, ''), notes),

			  amount_total = case when status = 'draft' and $7::numeric >= 0 then $7 else amount_total end,

			  remaining_amount = case when status = 'draft' and $7::numeric >= 0 then $7 else remaining_amount end,

			  updated_at = now()

			where id = $1 and tenant_id = $2 and deleted_at is null and status in ('draft', 'open')`,

			id, tu.TenantID, strings.TrimSpace(body.CustomerName), body.PartnerID,

			strings.TrimSpace(body.Reason), strings.TrimSpace(body.Notes), amountTotal)

		if err != nil || tag.RowsAffected() == 0 {

			response.Err(w, http.StatusNotFound, "Credit note not found or not editable.", "ERR_NOT_FOUND")

			return

		}

		if len(body.Lines) > 0 {

			var curStatus string

			_ = tx.QueryRow(r.Context(), `select status from public.fin_credit_notes where id = $1`, id).Scan(&curStatus)

			if curStatus == "draft" {

				if err := saveCreditNoteLines(r.Context(), tx, id, body.Lines); err != nil {

					response.Err(w, http.StatusInternalServerError, "Failed to save lines.", "ERR_INTERNAL")

					return

				}

			}

		}

		if err := tx.Commit(r.Context()); err != nil {

			response.Err(w, http.StatusInternalServerError, "Failed to update.", "ERR_INTERNAL")

			return

		}

		response.OK(w, nil, "Updated.")

	}

}



func postCreditNote(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to post credit note.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		tag, err := tx.Exec(r.Context(), `
			update public.fin_credit_notes
			set status = 'open', remaining_amount = amount_total, updated_at = now()
			where id = $1 and tenant_id = $2 and deleted_at is null and status = 'draft'`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusBadRequest, "Only draft credit notes can be posted.", "ERR_BAD_REQUEST")
			return
		}
		if err := postCustomerCreditNoteJournal(r.Context(), tx, tu.TenantID, tu.AppUserID, id); err != nil {
			response.Err(w, http.StatusInternalServerError, "Credit note opened but journal failed: "+err.Error(), "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}
		response.OK(w, nil, "Credit note opened.")
	}
}

func applyCreditNote(pool *pgxpool.Pool) http.HandlerFunc {

	return func(w http.ResponseWriter, r *http.Request) {

		tu, _ := auth.FromContext(r.Context())

		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)

		if err != nil {

			response.Validation(w, map[string]string{"id": "Invalid id."})

			return

		}

		var body creditApplyBody

		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {

			response.Validation(w, map[string]string{"body": "Invalid JSON."})

			return

		}

		if body.SalesID <= 0 || body.AppliedAmount <= 0 {

			response.Validation(w, map[string]string{"sales_id": "Sales and amount are required."})

			return

		}

		tx, err := pool.Begin(r.Context())

		if err != nil {

			response.Err(w, http.StatusInternalServerError, "Failed to start transaction.", "ERR_INTERNAL")

			return

		}

		defer tx.Rollback(r.Context())



		var remaining float64

		var status string

		err = tx.QueryRow(r.Context(), `

			select remaining_amount::float8, status from public.fin_credit_notes

			where id = $1 and tenant_id = $2 and deleted_at is null for update`, id, tu.TenantID).Scan(&remaining, &status)

		if err != nil {

			response.Err(w, http.StatusNotFound, "Credit note not found.", "ERR_NOT_FOUND")

			return

		}

		if status != "open" && status != "applied" {

			response.Err(w, http.StatusBadRequest, "Credit note must be open to apply.", "ERR_BAD_REQUEST")

			return

		}

		if body.AppliedAmount > remaining+0.0001 {

			response.Validation(w, map[string]string{"applied_amount": "Amount exceeds remaining credit."})

			return

		}

		var locked float64

		err = tx.QueryRow(r.Context(), `

			select grand_total::float8 from public.sa_sales

			where id = $1 and tenant_id = $2 and deleted_at is null

			for update`, body.SalesID, tu.TenantID).Scan(&locked)

		if err != nil {

			response.Validation(w, map[string]string{"sales_id": "Sales invoice not found."})

			return

		}

		_ = locked

		outstanding, err := saleOutstandingAmountQ(r.Context(), tx, tu.TenantID, body.SalesID, nil)

		if err != nil {

			response.Err(w, http.StatusInternalServerError, "Failed to compute outstanding.", "ERR_INTERNAL")

			return

		}

		if body.AppliedAmount > outstanding+0.0001 {

			response.Validation(w, map[string]string{

				"applied_amount": fmt.Sprintf("Amount exceeds invoice outstanding (%.4f).", outstanding),

			})

			return

		}

		_, err = tx.Exec(r.Context(), `

			insert into public.fin_credit_note_applications (credit_note_id, sales_id, applied_amount)

			values ($1, $2, $3)

			on conflict (credit_note_id, sales_id) do update

			  set applied_amount = fin_credit_note_applications.applied_amount + excluded.applied_amount`,

			id, body.SalesID, body.AppliedAmount)

		if err != nil {

			response.Err(w, http.StatusInternalServerError, "Failed to apply credit.", "ERR_INTERNAL")

			return

		}

		newRem := remaining - body.AppliedAmount

		newStatus := "open"

		if newRem <= 0.0001 {

			newRem = 0

			newStatus = "applied"

		}

		_, err = tx.Exec(r.Context(), `

			update public.fin_credit_notes set remaining_amount = $3, status = $4, updated_at = now()

			where id = $1 and tenant_id = $2`, id, tu.TenantID, newRem, newStatus)

		if err != nil {

			response.Err(w, http.StatusInternalServerError, "Failed to update credit note.", "ERR_INTERNAL")

			return

		}

		if err := tx.Commit(r.Context()); err != nil {

			response.Err(w, http.StatusInternalServerError, "Failed to commit.", "ERR_INTERNAL")

			return

		}

		response.OK(w, map[string]any{"remaining_amount": newRem, "status": newStatus}, "Credit applied to sales invoice.")

	}

}



func convertCreditNoteToCash(pool *pgxpool.Pool) http.HandlerFunc {

	return func(w http.ResponseWriter, r *http.Request) {

		tu, _ := auth.FromContext(r.Context())

		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)

		if err != nil {

			response.Validation(w, map[string]string{"id": "Invalid id."})

			return

		}

		var body creditRefundBody

		_ = json.NewDecoder(r.Body).Decode(&body)

		method := strings.TrimSpace(body.RefundMethod)

		if method == "" {

			method = "cash"

		}

		refStr := strings.TrimSpace(body.RefundReference)

		var refPtr *string

		if refStr != "" {

			refPtr = &refStr

		}



		tx, err := pool.Begin(r.Context())

		if err != nil {

			response.Err(w, http.StatusInternalServerError, "Failed to start transaction.", "ERR_INTERNAL")

			return

		}

		defer tx.Rollback(r.Context())



		var remaining float64

		var customerName string

		var partnerID *int64

		var creditNo string

		err = tx.QueryRow(r.Context(), `

			select remaining_amount::float8, customer_name, partner_id, credit_no

			from public.fin_credit_notes

			where id = $1 and tenant_id = $2 and deleted_at is null

			  and status in ('open', 'applied') and remaining_amount > 0

			for update`, id, tu.TenantID).Scan(&remaining, &customerName, &partnerID, &creditNo)

		if err != nil {

			response.Err(w, http.StatusBadRequest, "Only open credit with remaining balance can convert to cash.", "ERR_BAD_REQUEST")

			return

		}



		var pvID *int64

		var pvNo string

		var expenseID *int64

		var expenseNo string

		usedPV := false



		if partnerID != nil && *partnerID > 0 {

			newPVID, paymentNo, pvErr := createCustomerRefundPVInTx(r.Context(), tx, tu.TenantID, tu.AppUserID, *partnerID, remaining, customerRefundPVOpts{

				PaymentMethod: method,

				ReferenceNo:   refPtr,

				BankAccountID: body.BankAccountID,

				Notes:         fmt.Sprintf("Customer refund for credit note %s", creditNo),

			})

			if pvErr == nil {

				pvID = &newPVID

				pvNo = paymentNo

				usedPV = true

			}

		}



		if !usedPV {

			expID, expNo, expErr := createCreditNoteRefundExpenseInTx(r.Context(), tx, tu.TenantID, tu.AppUserID, partnerID, customerName, creditNo, remaining, refStr)

			if expErr != nil {

				response.Err(w, http.StatusInternalServerError, "Failed to create refund record.", "ERR_INTERNAL")

				return

			}

			expenseID = &expID

			expenseNo = expNo

		}



		_, err = tx.Exec(r.Context(), `

			update public.fin_credit_notes set

			  status = 'refunded',

			  remaining_amount = 0,

			  refunded_at = now(),

			  refund_method = $3,

			  refund_reference = nullif($4, ''),

			  refund_payment_voucher_id = $5,

			  updated_at = now()

			where id = $1 and tenant_id = $2`,

			id, tu.TenantID, method, refStr, pvID)

		if err != nil {

			response.Err(w, http.StatusInternalServerError, "Failed to update credit note.", "ERR_INTERNAL")

			return

		}



		if err := tx.Commit(r.Context()); err != nil {

			response.Err(w, http.StatusInternalServerError, "Failed to commit.", "ERR_INTERNAL")

			return

		}



		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "credit_note.convert_to_cash", "credit_note", &id, nil, nil)

		out := map[string]any{"amount": remaining}

		msg := "Credit note converted to cash refund."

		if usedPV {

			out["payment_voucher_id"] = *pvID

			out["payment_no"] = pvNo

			msg = "Credit note converted to cash refund. Payment voucher created."

		} else {

			out["expense_id"] = *expenseID

			out["expense_no"] = expenseNo

			msg = "Credit note converted to cash refund. Expense record created."

		}

		response.OK(w, out, msg)

	}

}



func softDeleteCreditNote(pool *pgxpool.Pool) http.HandlerFunc {

	return func(w http.ResponseWriter, r *http.Request) {

		softDelete(pool, w, r, "fin_credit_notes", "credit_note.delete", "credit_note")

	}

}



func cancelCreditNote(pool *pgxpool.Pool) http.HandlerFunc {

	return func(w http.ResponseWriter, r *http.Request) {

		tu, _ := auth.FromContext(r.Context())

		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)

		if err != nil {

			response.Validation(w, map[string]string{"id": "Invalid id."})

			return

		}

		tag, err := pool.Exec(r.Context(), `

			update public.fin_credit_notes

			set status = 'cancelled', updated_at = now()

			where id = $1 and tenant_id = $2 and deleted_at is null

			  and status in ('draft', 'open')

			  and remaining_amount = amount_total`, id, tu.TenantID)

		if err != nil || tag.RowsAffected() == 0 {

			response.Err(w, http.StatusBadRequest, "Only unapplied draft/open credit notes can be cancelled.", "ERR_BAD_REQUEST")

			return

		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "credit_note.cancel", "credit_note", &id, nil, nil)

		response.OK(w, nil, "Credit note cancelled.")

	}

}



func listCreditNoteApplications(pool *pgxpool.Pool) http.HandlerFunc {

	return func(w http.ResponseWriter, r *http.Request) {

		tu, _ := auth.FromContext(r.Context())

		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)

		if err != nil {

			response.Validation(w, map[string]string{"id": "Invalid id."})

			return

		}

		var ok bool

		_ = pool.QueryRow(r.Context(), `

			select exists(select 1 from public.fin_credit_notes where id = $1 and tenant_id = $2 and deleted_at is null)`,

			id, tu.TenantID).Scan(&ok)

		if !ok {

			response.Err(w, http.StatusNotFound, "Credit note not found.", "ERR_NOT_FOUND")

			return

		}

		rows, err := pool.Query(r.Context(), `

			select a.id, a.sales_id, s.sales_no, a.applied_amount::float8, a.created_at::text

			from public.fin_credit_note_applications a

			join public.sa_sales s on s.id = a.sales_id

			where a.credit_note_id = $1

			order by a.created_at desc, a.id desc`, id)

		if err != nil {

			response.Err(w, http.StatusInternalServerError, "Failed to list applications.", "ERR_INTERNAL")

			return

		}

		defer rows.Close()

		type appRow struct {

			ID            int64   `json:"id"`

			SalesID       int64   `json:"sales_id"`

			SalesNo       string  `json:"sales_no"`

			AppliedAmount float64 `json:"applied_amount"`

			CreatedAt     string  `json:"created_at"`

		}

		out := []appRow{}

		for rows.Next() {

			var row appRow

			if err := rows.Scan(&row.ID, &row.SalesID, &row.SalesNo, &row.AppliedAmount, &row.CreatedAt); err != nil {

				response.Err(w, http.StatusInternalServerError, "Failed to read applications.", "ERR_INTERNAL")

				return

			}

			out = append(out, row)

		}

		response.OK(w, out, "OK")

	}

}



func createCreditNoteFromSalesReturn(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		returnID, err := strconv.ParseInt(chi.URLParam(r, "returnId"), 10, 64)
		if err != nil || returnID <= 0 {
			response.Validation(w, map[string]string{"return_id": "Invalid sales return id."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create credit note.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		creditNoteID, creditNo, err := createCreditNoteFromSalesReturnTx(r.Context(), tx, tu.TenantID, tu.AppUserID, returnID)
		if err != nil {
			response.Err(w, http.StatusBadRequest, err.Error(), "ERR_BAD_REQUEST")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create credit note.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "credit_note.create_from_return", "credit_note", &creditNoteID, nil, map[string]any{"sales_return_id": returnID})
		response.OK(w, map[string]any{"id": creditNoteID, "credit_no": creditNo}, "Draft credit note created from sales return.")
	}
}

func createCreditNoteFromSalesReturnTx(ctx context.Context, tx pgx.Tx, tenantID, userID, returnID int64) (int64, string, error) {

	var (

		status      string

		salesID     int64

		partnerID   int64

		returnNo    string

		returnDate  time.Time

		customerName string

	)

	err := tx.QueryRow(ctx, `

		select sr.status, sr.sales_id, sr.partner_id, sr.return_no, sr.return_date,

		  coalesce(p.company_name, '')

		from public.sr_sales_returns sr

		left join public.inv_partners p on p.id = sr.partner_id

		where sr.id = $1 and sr.tenant_id = $2`, returnID, tenantID).Scan(

		&status, &salesID, &partnerID, &returnNo, &returnDate, &customerName)

	if err != nil {

		return 0, "", fmt.Errorf("sales return not found")

	}

	if status != "submitted" {

		return 0, "", fmt.Errorf("only submitted returns can create a credit note")

	}



	var existing int64

	err = tx.QueryRow(ctx, `

		select id from public.fin_credit_notes

		where tenant_id = $1 and source_sales_return_id = $2 and deleted_at is null

		limit 1`, tenantID, returnID).Scan(&existing)

	if err == nil {

		return 0, "", fmt.Errorf("credit note already exists for this return")

	}



	rows, err := tx.Query(ctx, `

		select line_no, item_id, item_code, item_name, qty::float8, unit_vat_inc::float8, line_total::float8

		from public.sr_sales_return_lines

		where sales_return_id = $1

		order by line_no`, returnID)

	if err != nil {

		return 0, "", err

	}

	defer rows.Close()

	var lines []creditNoteLine

	var amountTotal float64

	for rows.Next() {

		var line creditNoteLine

		var unitVatInc, lineTotal float64

		if err := rows.Scan(&line.LineNo, &line.ItemID, &line.ItemCode, &line.ItemName, &line.Qty, &unitVatInc, &lineTotal); err != nil {

			return 0, "", err

		}

		line.UnitPrice = unitVatInc

		line.Amount = lineTotal

		line.TaxAmount = 0

		amountTotal += lineTotal

		lines = append(lines, line)

	}

	if err := rows.Err(); err != nil {

		return 0, "", err

	}

	if len(lines) == 0 {

		return 0, "", fmt.Errorf("return has no lines")

	}



	var seq int

	_ = tx.QueryRow(ctx, `

		select coalesce(max(date_seq), 0) + 1 from public.fin_credit_notes

		where tenant_id = $1 and credit_date = $2::date`, tenantID, returnDate.Format("2006-01-02")).Scan(&seq)

	if seq <= 0 {

		seq = 1

	}

	creditNo := fmt.Sprintf("CN-%s-%d", returnDate.Format("20060102"), seq)

	pid := partnerID

	reason := fmt.Sprintf("Sales return %s", returnNo)



	var creditNoteID int64

	err = tx.QueryRow(ctx, `

		insert into public.fin_credit_notes (

		  tenant_id, credit_date, date_seq, credit_no, partner_id, customer_name,

		  source_sales_id, source_sales_return_id,

		  amount_total, remaining_amount, status, reason, created_by_user_id

		) values ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $9, 'draft', $10, $11)

		returning id`,

		tenantID, returnDate.Format("2006-01-02"), seq, creditNo, &pid, customerName,

		salesID, returnID, amountTotal, reason, userID,

	).Scan(&creditNoteID)

	if err != nil {

		return 0, "", err

	}

	if err := saveCreditNoteLines(ctx, tx, creditNoteID, lines); err != nil {

		return 0, "", err

	}

	return creditNoteID, creditNo, nil

}


