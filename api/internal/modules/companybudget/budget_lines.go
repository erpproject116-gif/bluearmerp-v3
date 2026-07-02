package companybudget

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type BudgetLine struct {
	ID           int64   `json:"id"`
	BudgetID     int64   `json:"budget_id"`
	AccountID    int64   `json:"account_id"`
	DepartmentID *int64  `json:"department_id,omitempty"`
	ProjectID    *int64  `json:"project_id,omitempty"`
	PeriodMonth  string  `json:"period_month"`
	Amount       float64 `json:"amount"`
}

type budgetLineBody struct {
	AccountID    int64   `json:"account_id"`
	DepartmentID *int64  `json:"department_id"`
	ProjectID    *int64  `json:"project_id"`
	PeriodMonth  string  `json:"period_month"`
	Amount       float64 `json:"amount"`
}

func listBudgetLines(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		budgetID, ok := parseBudgetID(w, r)
		if !ok {
			return
		}
		if !budgetBelongsToTenant(r, pool, tu.TenantID, budgetID) {
			response.Err(w, http.StatusNotFound, "Budget not found.", "ERR_NOT_FOUND")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select id, budget_id, account_id, department_id, project_id, period_month::text, amount::float8
			from public.fin_budget_lines
			where budget_id = $1
			order by period_month, account_id`, budgetID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list budget lines.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []BudgetLine
		for rows.Next() {
			var row BudgetLine
			if err := rows.Scan(&row.ID, &row.BudgetID, &row.AccountID, &row.DepartmentID, &row.ProjectID, &row.PeriodMonth, &row.Amount); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read budget lines.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []BudgetLine{}
		}
		response.OK(w, out, "OK")
	}
}

func createBudgetLine(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		budgetID, ok := parseBudgetID(w, r)
		if !ok {
			return
		}
		if !budgetBelongsToTenant(r, pool, tu.TenantID, budgetID) {
			response.Err(w, http.StatusNotFound, "Budget not found.", "ERR_NOT_FOUND")
			return
		}
		var body budgetLineBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.AccountID <= 0 || body.PeriodMonth == "" {
			response.Validation(w, map[string]string{"account_id": "Account and period month are required."})
			return
		}
		periodMonth, err := time.Parse("2006-01-02", body.PeriodMonth)
		if err != nil {
			if periodMonth, err = time.Parse("2006-01", body.PeriodMonth); err != nil {
				response.Validation(w, map[string]string{"period_month": "Invalid period month."})
				return
			}
			periodMonth = time.Date(periodMonth.Year(), periodMonth.Month(), 1, 0, 0, 0, 0, time.UTC)
		}
		var id int64
		err = pool.QueryRow(r.Context(), `
			insert into public.fin_budget_lines (budget_id, account_id, department_id, project_id, period_month, amount)
			values ($1, $2, $3, $4, $5, $6)
			returning id`,
			budgetID, body.AccountID, body.DepartmentID, body.ProjectID, periodMonth.Format("2006-01-02"), body.Amount,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create budget line.", "ERR_INTERNAL")
			return
		}
		line := BudgetLine{
			ID: id, BudgetID: budgetID, AccountID: body.AccountID,
			DepartmentID: body.DepartmentID, ProjectID: body.ProjectID,
			PeriodMonth: periodMonth.Format("2006-01-02"), Amount: body.Amount,
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "company_budget.line.create", "fin_budget_line", &id, nil, body)
		response.OK(w, line, "Created.")
	}
}
