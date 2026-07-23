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

type recurringExpense struct {
	ID          int64   `json:"id"`
	Name        string  `json:"name"`
	Category    string  `json:"category"`
	VendorName  string  `json:"vendor_name"`
	Amount      float64 `json:"amount"`
	Frequency   string  `json:"frequency"`
	NextDueDate *string `json:"next_due_date,omitempty"`
	IsActive    bool    `json:"is_active"`
	Notes       string  `json:"notes"`
	PartnerID   *int64  `json:"partner_id,omitempty"`
}

type recurringExpenseBody struct {
	Name        string  `json:"name"`
	Category    string  `json:"category"`
	VendorName  string  `json:"vendor_name"`
	Amount      float64 `json:"amount"`
	Frequency   string  `json:"frequency"`
	NextDueDate *string `json:"next_due_date"`
	IsActive    *bool   `json:"is_active"`
	Notes       string  `json:"notes"`
	PartnerID   *int64  `json:"partner_id"`
}

func registerRecurringExpenseRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.contract_read", auth.AccessRead)).Get("/recurring-expenses", listRecurringExpenses(pool))
	r.With(auth.RequirePermission("finance.contract_write", auth.AccessWrite)).Post("/recurring-expenses", createRecurringExpense(pool))
	r.With(auth.RequirePermission("finance.contract_write", auth.AccessWrite)).Patch("/recurring-expenses/{id}", updateRecurringExpense(pool))
	r.With(auth.RequirePermission("finance.contract_write", auth.AccessWrite)).Delete("/recurring-expenses/{id}", deleteRecurringExpense(pool))
}

func listRecurringExpenses(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		activeOnly := strings.TrimSpace(r.URL.Query().Get("active")) != "0"
		where := "tenant_id = $1 and deleted_at is null"
		if activeOnly {
			where += " and is_active = true"
		}
		rows, err := pool.Query(r.Context(), fmt.Sprintf(`
			select id, name, category, vendor_name, amount::float8, frequency,
			  next_due_date::text, is_active, coalesce(notes, ''), partner_id
			from public.fin_recurring_expenses
			where %s
			order by is_active desc, amount desc, name`, where), tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list recurring expenses.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []recurringExpense
		for rows.Next() {
			var row recurringExpense
			if err := rows.Scan(&row.ID, &row.Name, &row.Category, &row.VendorName, &row.Amount, &row.Frequency,
				&row.NextDueDate, &row.IsActive, &row.Notes, &row.PartnerID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read recurring expenses.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []recurringExpense{}
		}
		response.OK(w, out, "OK")
	}
}

func createRecurringExpense(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body recurringExpenseBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		name := strings.TrimSpace(body.Name)
		if name == "" || body.Amount < 0 {
			response.Validation(w, map[string]string{"name": "Name is required.", "amount": "Amount must be >= 0."})
			return
		}
		freq := strings.ToLower(strings.TrimSpace(body.Frequency))
		if freq == "" {
			freq = "monthly"
		}
		switch freq {
		case "weekly", "monthly", "quarterly", "yearly":
		default:
			response.Validation(w, map[string]string{"frequency": "Use weekly, monthly, quarterly, or yearly."})
			return
		}
		cat := strings.TrimSpace(body.Category)
		if cat == "" {
			cat = "other"
		}
		active := true
		if body.IsActive != nil {
			active = *body.IsActive
		}
		var nextDue *time.Time
		if body.NextDueDate != nil && strings.TrimSpace(*body.NextDueDate) != "" {
			t, err := time.Parse("2006-01-02", strings.TrimSpace(*body.NextDueDate))
			if err != nil {
				response.Validation(w, map[string]string{"next_due_date": "Use YYYY-MM-DD."})
				return
			}
			nextDue = &t
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.fin_recurring_expenses (
			  tenant_id, name, category, vendor_name, amount, frequency, next_due_date,
			  is_active, notes, partner_id, created_by_user_id
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
			returning id`,
			tu.TenantID, name, cat, strings.TrimSpace(body.VendorName), body.Amount, freq, nextDue,
			active, strings.TrimSpace(body.Notes), body.PartnerID, tu.AppUserID,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create recurring expense.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.recurring.create", "fin_recurring_expense", &id, nil, body)
		response.OK(w, map[string]any{"id": id}, "Created")
	}
}

func updateRecurringExpense(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body recurringExpenseBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		name := strings.TrimSpace(body.Name)
		if name == "" {
			response.Validation(w, map[string]string{"name": "Name is required."})
			return
		}
		freq := strings.ToLower(strings.TrimSpace(body.Frequency))
		if freq == "" {
			freq = "monthly"
		}
		active := true
		if body.IsActive != nil {
			active = *body.IsActive
		}
		var nextDue *time.Time
		if body.NextDueDate != nil && strings.TrimSpace(*body.NextDueDate) != "" {
			t, err := time.Parse("2006-01-02", strings.TrimSpace(*body.NextDueDate))
			if err != nil {
				response.Validation(w, map[string]string{"next_due_date": "Use YYYY-MM-DD."})
				return
			}
			nextDue = &t
		}
		tag, err := pool.Exec(r.Context(), `
			update public.fin_recurring_expenses set
			  name=$3, category=$4, vendor_name=$5, amount=$6, frequency=$7, next_due_date=$8,
			  is_active=$9, notes=$10, partner_id=$11, updated_at=now()
			where id=$1 and tenant_id=$2 and deleted_at is null`,
			id, tu.TenantID, name, strings.TrimSpace(body.Category), strings.TrimSpace(body.VendorName),
			body.Amount, freq, nextDue, active, strings.TrimSpace(body.Notes), body.PartnerID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update recurring expense.", "ERR_INTERNAL")
			return
		}
		if tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.recurring.update", "fin_recurring_expense", &id, nil, body)
		response.OK(w, map[string]any{"id": id}, "Updated")
	}
}

func deleteRecurringExpense(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.fin_recurring_expenses set deleted_at=now(), updated_at=now(), is_active=false
			where id=$1 and tenant_id=$2 and deleted_at is null`, id, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to delete recurring expense.", "ERR_INTERNAL")
			return
		}
		if tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.recurring.delete", "fin_recurring_expense", &id, nil, nil)
		response.OK(w, map[string]any{"id": id}, "Deleted")
	}
}
