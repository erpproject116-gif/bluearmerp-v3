package companybudget

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type BudgetHeader struct {
	ID              int64  `json:"id"`
	FiscalYear      int    `json:"fiscal_year"`
	Name            string `json:"name"`
	Status          string `json:"status"`
	CreatedByUserID *int64 `json:"created_by_user_id,omitempty"`
}

type budgetHeaderBody struct {
	FiscalYear int    `json:"fiscal_year"`
	Name       string `json:"name"`
	Status     string `json:"status"`
}

func listBudgets(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, fiscal_year, name, status, created_by_user_id
			from public.fin_budget_headers
			where tenant_id = $1
			order by fiscal_year desc, name`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list budgets.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []BudgetHeader
		for rows.Next() {
			var row BudgetHeader
			if err := rows.Scan(&row.ID, &row.FiscalYear, &row.Name, &row.Status, &row.CreatedByUserID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read budgets.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []BudgetHeader{}
		}
		response.OK(w, out, "OK")
	}
}

func createBudget(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body budgetHeaderBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		name := strings.TrimSpace(body.Name)
		if name == "" || body.FiscalYear <= 0 {
			response.Validation(w, map[string]string{"name": "Name and fiscal year are required."})
			return
		}
		status := strings.TrimSpace(body.Status)
		if status == "" {
			status = "draft"
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.fin_budget_headers (tenant_id, fiscal_year, name, status, created_by_user_id)
			values ($1, $2, $3, $4, $5)
			returning id`,
			tu.TenantID, body.FiscalYear, name, status, tu.AppUserID,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create budget.", "ERR_INTERNAL")
			return
		}
		row := BudgetHeader{ID: id, FiscalYear: body.FiscalYear, Name: name, Status: status, CreatedByUserID: &tu.AppUserID}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "company_budget.create", "fin_budget_header", &id, nil, body)
		response.OK(w, row, "Created.")
	}
}

func budgetBelongsToTenant(r *http.Request, pool *pgxpool.Pool, tenantID, budgetID int64) bool {
	var exists bool
	_ = pool.QueryRow(r.Context(), `
		select exists(select 1 from public.fin_budget_headers where id = $1 and tenant_id = $2)`,
		budgetID, tenantID).Scan(&exists)
	return exists
}

func parseBudgetID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		response.Validation(w, map[string]string{"id": "Invalid budget id."})
		return 0, false
	}
	return id, true
}
