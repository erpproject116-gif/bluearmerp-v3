package finance

import (
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

type expenseRow struct {
	ID               int64   `json:"id"`
	ExpenseDate      string  `json:"expense_date"`
	ExpenseNo        string  `json:"expense_no"`
	PartnerID        *int64  `json:"partner_id,omitempty"`
	VendorName       string  `json:"vendor_name"`
	Category         string  `json:"category"`
	Description      string  `json:"description"`
	Amount           float64 `json:"amount"`
	TaxAmount        float64 `json:"tax_amount"`
	PaymentStatus    string  `json:"payment_status"`
	PaidAt           *string `json:"paid_at,omitempty"`
	PaymentVoucherID *int64  `json:"payment_voucher_id,omitempty"`
	Reference        *string `json:"reference,omitempty"`
	Notes            *string `json:"notes,omitempty"`
}

type expenseBody struct {
	ExpenseDate   string  `json:"expense_date"`
	PartnerID     *int64  `json:"partner_id"`
	VendorName    string  `json:"vendor_name"`
	Category      string  `json:"category"`
	Description   string  `json:"description"`
	Amount        float64 `json:"amount"`
	TaxAmount     float64 `json:"tax_amount"`
	Reference     *string `json:"reference"`
	Notes         *string `json:"notes"`
	PayNow        *bool   `json:"pay_now"`
	PaymentMethod string  `json:"payment_method"`
	BankAccountID *int64  `json:"bank_account_id"`
}

type markExpensePaidBody struct {
	PaymentMethod string  `json:"payment_method"`
	BankAccountID *int64  `json:"bank_account_id"`
	ReferenceNo   *string `json:"reference_no"`
}

func registerExpenseRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.expenses", auth.AccessRead)).Get("/expenses", listExpenses(pool))
	r.With(auth.RequirePermission("finance.expenses_write", auth.AccessWrite)).Post("/expenses", createExpense(pool))
	r.With(auth.RequirePermission("finance.expenses_write", auth.AccessWrite)).Patch("/expenses/{id}", updateExpense(pool))
	r.With(auth.RequirePermission("finance.expenses_write", auth.AccessWrite)).Post("/expenses/{id}/mark-paid", markExpensePaid(pool))
	r.With(auth.RequirePermission("finance.expenses_write", auth.AccessWrite)).Delete("/expenses/{id}", softDeleteExpense(pool))
}

func listExpenses(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		status := strings.TrimSpace(r.URL.Query().Get("payment_status"))
		where := "e.tenant_id = $1 and e.deleted_at is null"
		args := []any{tu.TenantID}
		n := 2
		if status == "paid" || status == "unpaid" {
			where += fmt.Sprintf(" and e.payment_status = $%d", n)
			args = append(args, status)
			n++
		}
		if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
			where += fmt.Sprintf(" and (e.expense_no ilike $%d or e.vendor_name ilike $%d or e.description ilike $%d)", n, n, n)
			args = append(args, "%"+q+"%")
		}
		rows, err := pool.Query(r.Context(), fmt.Sprintf(`
			select e.id, e.expense_date::text, e.expense_no, e.partner_id, e.vendor_name, e.category,
			  e.description, e.amount::float8, e.tax_amount::float8, e.payment_status,
			  e.paid_at::text, e.payment_voucher_id, e.reference, e.notes
			from public.fin_expenses e
			where %s
			order by e.expense_date desc, e.id desc
			limit 200`, where), args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list expenses. Apply migration 214 if needed.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []expenseRow
		for rows.Next() {
			var row expenseRow
			if err := rows.Scan(&row.ID, &row.ExpenseDate, &row.ExpenseNo, &row.PartnerID, &row.VendorName, &row.Category,
				&row.Description, &row.Amount, &row.TaxAmount, &row.PaymentStatus,
				&row.PaidAt, &row.PaymentVoucherID, &row.Reference, &row.Notes); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read expenses.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []expenseRow{}
		}
		response.OK(w, out, "OK")
	}
}

func createExpense(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body expenseBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.Amount < 0 || body.TaxAmount < 0 {
			response.Validation(w, map[string]string{"amount": "Amount must be >= 0."})
			return
		}
		expenseDate := time.Now()
		if strings.TrimSpace(body.ExpenseDate) != "" {
			d, err := time.Parse("2006-01-02", strings.TrimSpace(body.ExpenseDate))
			if err != nil {
				response.Validation(w, map[string]string{"expense_date": "Invalid date. Use YYYY-MM-DD."})
				return
			}
			expenseDate = d
		}
		vendor := strings.TrimSpace(body.VendorName)
		if vendor == "" && body.PartnerID != nil {
			_ = pool.QueryRow(r.Context(), `
				select coalesce(company_name, '') from public.inv_partners
				where id = $1 and tenant_id = $2`, *body.PartnerID, tu.TenantID).Scan(&vendor)
		}
		category := strings.TrimSpace(body.Category)
		if category == "" {
			category = "general"
		}
		payNow := body.PayNow != nil && *body.PayNow
		if payNow && (body.PartnerID == nil || *body.PartnerID <= 0) {
			response.Validation(w, map[string]string{"partner_id": "Select a vendor partner to pay immediately."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create expense.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var seq int
		_ = tx.QueryRow(r.Context(), `
			select coalesce(max(date_seq), 0) + 1 from public.fin_expenses
			where tenant_id = $1 and expense_date = $2::date`, tu.TenantID, expenseDate.Format("2006-01-02")).Scan(&seq)
		if seq <= 0 {
			seq = 1
		}
		expenseNo := fmt.Sprintf("EXP-%s-%d", expenseDate.Format("20060102"), seq)
		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.fin_expenses (
			  tenant_id, expense_date, date_seq, expense_no, partner_id, vendor_name,
			  category, description, amount, tax_amount, reference, notes, created_by_user_id
			) values ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
			returning id`,
			tu.TenantID, expenseDate.Format("2006-01-02"), seq, expenseNo, body.PartnerID, vendor,
			category, strings.TrimSpace(body.Description), body.Amount, body.TaxAmount,
			body.Reference, body.Notes, tu.AppUserID,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create expense.", "ERR_INTERNAL")
			return
		}

		var paymentVoucherID *int64
		if payNow {
			pvID, payErr := payExpenseInTx(r.Context(), tx, tu.TenantID, tu.AppUserID, id, expensePayOpts{
				PaymentMethod: body.PaymentMethod,
				BankAccountID: body.BankAccountID,
				ReferenceNo:   body.Reference,
			})
			if payErr != nil {
				response.Validation(w, map[string]string{"pay_now": payErr.Error()})
				return
			}
			paymentVoucherID = &pvID
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save expense.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.expense_create", "fin_expense", &id, nil, nil)
		out := map[string]any{"id": id, "expense_no": expenseNo, "payment_status": "unpaid"}
		if paymentVoucherID != nil {
			out["payment_status"] = "paid"
			out["payment_voucher_id"] = *paymentVoucherID
		}
		response.OK(w, out, "Expense created.")
	}
}

func updateExpense(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var status string
		err = pool.QueryRow(r.Context(), `
			select payment_status from public.fin_expenses
			where id = $1 and tenant_id = $2 and deleted_at is null`, id, tu.TenantID).Scan(&status)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Expense not found.", "ERR_NOT_FOUND")
			return
		}
		if status == "paid" {
			response.Validation(w, map[string]string{"payment_status": "Paid expenses cannot be edited."})
			return
		}
		var body expenseBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		category := strings.TrimSpace(body.Category)
		if category == "" {
			category = "general"
		}
		tag, err := pool.Exec(r.Context(), `
			update public.fin_expenses set
			  partner_id = $1, vendor_name = $2, category = $3, description = $4,
			  amount = $5, tax_amount = $6, reference = $7, notes = $8, updated_at = now()
			where id = $9 and tenant_id = $10 and deleted_at is null and payment_status = 'unpaid'`,
			body.PartnerID, strings.TrimSpace(body.VendorName), category, strings.TrimSpace(body.Description),
			body.Amount, body.TaxAmount, body.Reference, body.Notes, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusInternalServerError, "Failed to update expense.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.expense_update", "fin_expense", &id, nil, nil)
		response.OK(w, map[string]any{"id": id}, "Expense updated.")
	}
}

func markExpensePaid(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body markExpensePaidBody
		if r.ContentLength > 0 {
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				response.Validation(w, map[string]string{"body": "Invalid JSON."})
				return
			}
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to mark paid.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		pvID, err := payExpenseInTx(r.Context(), tx, tu.TenantID, tu.AppUserID, id, expensePayOpts{
			PaymentMethod: body.PaymentMethod,
			BankAccountID: body.BankAccountID,
			ReferenceNo:   body.ReferenceNo,
		})
		if err != nil {
			if err == pgx.ErrNoRows {
				response.Err(w, http.StatusNotFound, "Expense not found.", "ERR_NOT_FOUND")
				return
			}
			if strings.Contains(err.Error(), "already paid") {
				response.Err(w, http.StatusConflict, "Expense already paid.", "ERR_CONFLICT")
				return
			}
			response.Validation(w, map[string]string{"payment": err.Error()})
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to mark paid.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.expense_mark_paid", "fin_expense", &id, nil, map[string]any{
			"payment_voucher_id": pvID,
		})
		response.OK(w, map[string]any{
			"id":                 id,
			"payment_status":     "paid",
			"payment_voucher_id": pvID,
		}, "Expense paid and payment voucher recorded.")
	}
}

func softDeleteExpense(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		softDelete(pool, w, r, "fin_expenses", "finance.expense_delete", "fin_expense")
	}
}
