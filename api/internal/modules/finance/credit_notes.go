package finance

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type creditNoteRow struct {
	ID               int64   `json:"id"`
	CreditDate       string  `json:"credit_date"`
	CreditNo         string  `json:"credit_no"`
	PartnerID        *int64  `json:"partner_id,omitempty"`
	CustomerName     string  `json:"customer_name"`
	SourceSalesID    *int64  `json:"source_sales_id,omitempty"`
	AmountTotal      float64 `json:"amount_total"`
	RemainingAmount  float64 `json:"remaining_amount"`
	Status           string  `json:"status"`
	Reason           string  `json:"reason"`
	Notes            string  `json:"notes"`
	RefundedAt       *string `json:"refunded_at,omitempty"`
	RefundMethod     *string `json:"refund_method,omitempty"`
	RefundReference  *string `json:"refund_reference,omitempty"`
}

type creditNoteBody struct {
	CreditDate    string  `json:"credit_date"`
	PartnerID     *int64  `json:"partner_id"`
	CustomerName  string  `json:"customer_name"`
	SourceSalesID *int64  `json:"source_sales_id"`
	AmountTotal   float64 `json:"amount_total"`
	Reason        string  `json:"reason"`
	Notes         string  `json:"notes"`
	Status        string  `json:"status"`
}

type creditApplyBody struct {
	SalesID       int64   `json:"sales_id"`
	AppliedAmount float64 `json:"applied_amount"`
}

type creditRefundBody struct {
	RefundMethod    string `json:"refund_method"`
	RefundReference string `json:"refund_reference"`
}

func registerCreditNoteRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.credit_notes", auth.AccessRead)).Get("/credit-notes", listCreditNotes(pool))
	r.With(auth.RequirePermission("finance.credit_notes_write", auth.AccessWrite)).Post("/credit-notes", createCreditNote(pool))
	r.With(auth.RequirePermission("finance.credit_notes_write", auth.AccessWrite)).Patch("/credit-notes/{id}", updateCreditNote(pool))
	r.With(auth.RequirePermission("finance.credit_notes_write", auth.AccessWrite)).Post("/credit-notes/{id}/post", postCreditNote(pool))
	r.With(auth.RequirePermission("finance.credit_notes_write", auth.AccessWrite)).Post("/credit-notes/{id}/apply", applyCreditNote(pool))
	r.With(auth.RequirePermission("finance.credit_notes_write", auth.AccessWrite)).Post("/credit-notes/{id}/convert-to-cash", convertCreditNoteToCash(pool))
	r.With(auth.RequirePermission("finance.credit_notes_write", auth.AccessWrite)).Delete("/credit-notes/{id}", softDeleteCreditNote(pool))
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
			select c.id, c.credit_date::text, c.credit_no, c.partner_id, c.customer_name, c.source_sales_id,
			  c.amount_total::float8, c.remaining_amount::float8, c.status, c.reason, c.notes,
			  c.refunded_at::text, c.refund_method, c.refund_reference
			from public.fin_credit_notes c
			where %s
			order by c.credit_date desc, c.id desc
			limit 200`, where), args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list credit notes. Apply migration 217 if needed.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []creditNoteRow{}
		for rows.Next() {
			var row creditNoteRow
			if err := rows.Scan(&row.ID, &row.CreditDate, &row.CreditNo, &row.PartnerID, &row.CustomerName, &row.SourceSalesID,
				&row.AmountTotal, &row.RemainingAmount, &row.Status, &row.Reason, &row.Notes,
				&row.RefundedAt, &row.RefundMethod, &row.RefundReference); err != nil {
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
		if body.AmountTotal < 0 {
			response.Validation(w, map[string]string{"amount_total": "Amount must be >= 0."})
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
		var seq int
		_ = pool.QueryRow(r.Context(), `
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
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.fin_credit_notes (
			  tenant_id, credit_date, date_seq, credit_no, partner_id, customer_name, source_sales_id,
			  amount_total, remaining_amount, status, reason, notes, created_by_user_id
			) values ($1, $2::date, $3, $4, $5, $6, $7, $8, $8, $9, $10, $11, $12)
			returning id`,
			tu.TenantID, creditDate.Format("2006-01-02"), seq, creditNo, body.PartnerID, customer, body.SourceSalesID,
			body.AmountTotal, status, strings.TrimSpace(body.Reason), strings.TrimSpace(body.Notes), tu.AppUserID,
		).Scan(&id)
		if err != nil {
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
		tag, err := pool.Exec(r.Context(), `
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
			strings.TrimSpace(body.Reason), strings.TrimSpace(body.Notes), body.AmountTotal)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Credit note not found or not editable.", "ERR_NOT_FOUND")
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
		tag, err := pool.Exec(r.Context(), `
			update public.fin_credit_notes
			set status = 'open', remaining_amount = amount_total, updated_at = now()
			where id = $1 and tenant_id = $2 and deleted_at is null and status = 'draft'`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusBadRequest, "Only draft credit notes can be posted.", "ERR_BAD_REQUEST")
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
		var salesOK bool
		_ = tx.QueryRow(r.Context(), `
			select exists(select 1 from public.sa_sales where id = $1 and tenant_id = $2 and deleted_at is null)`,
			body.SalesID, tu.TenantID).Scan(&salesOK)
		if !salesOK {
			response.Validation(w, map[string]string{"sales_id": "Sales invoice not found."})
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

		_, err = tx.Exec(r.Context(), `
			update public.fin_credit_notes set
			  status = 'refunded',
			  remaining_amount = 0,
			  refunded_at = now(),
			  refund_method = $3,
			  refund_reference = nullif($4, ''),
			  updated_at = now()
			where id = $1 and tenant_id = $2`,
			id, tu.TenantID, method, strings.TrimSpace(body.RefundReference))
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update credit note.", "ERR_INTERNAL")
			return
		}

		// Create a refund expense record as the real cash-out document
		var expenseID int64
		today := time.Now().Format("2006-01-02")
		expenseNo := fmt.Sprintf("REF-%s", creditNo)
		err = tx.QueryRow(r.Context(), `
			insert into public.fin_expenses (
			  tenant_id, expense_date, expense_no, partner_id, vendor_name,
			  category, description, amount, tax_amount,
			  payment_status, paid_at, reference, created_by_user_id
			) values ($1, $2::date, $3, $4, $5, 'refund', $6, $7, 0, 'paid', now(), $8, $9)
			returning id`,
			tu.TenantID, today, expenseNo, partnerID, customerName,
			fmt.Sprintf("Refund from credit note %s", creditNo),
			remaining, strings.TrimSpace(body.RefundReference), tu.AppUserID,
		).Scan(&expenseID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create refund expense record.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to commit.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "credit_note.convert_to_cash", "credit_note", &id, nil, nil)
		response.OK(w, map[string]any{
			"expense_id": expenseID,
			"expense_no": expenseNo,
			"amount":     remaining,
		}, "Credit note converted to cash refund. Expense record created.")
	}
}

func softDeleteCreditNote(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		softDelete(pool, w, r, "fin_credit_notes", "credit_note.delete", "credit_note")
	}
}
