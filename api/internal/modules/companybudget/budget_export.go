package companybudget

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func patchBudget(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, ok := parseBudgetID(w, r)
		if !ok {
			return
		}
		var body struct {
			Status *string `json:"status"`
			Name   *string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		status := body.Status
		if status != nil {
			s := strings.TrimSpace(*status)
			switch s {
			case "draft", "active", "closed":
				status = &s
			default:
				response.Validation(w, map[string]string{"status": "Invalid status."})
				return
			}
		}
		tag, err := pool.Exec(r.Context(), `
			update public.fin_budget_headers set
			  status = coalesce($3, status),
			  name = coalesce(nullif($4, ''), name),
			  updated_at = now()
			where id = $1 and tenant_id = $2`, id, tu.TenantID, status, body.Name)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Budget not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "company_budget.patch", "fin_budget_header", &id, nil, body)
		var row BudgetHeader
		_ = pool.QueryRow(r.Context(), `
			select id, fiscal_year, name, status, created_by_user_id
			from public.fin_budget_headers where id = $1`, id).Scan(&row.ID, &row.FiscalYear, &row.Name, &row.Status, &row.CreatedByUserID)
		response.OK(w, row, "Updated.")
	}
}

func exportBudgetVsActual(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		budgetID, ok := parseBudgetID(w, r)
		if !ok {
			return
		}
		rows, err := pool.Query(r.Context(), `
			select coalesce(a.account_code, ''), coalesce(a.account_name, ''), bl.period_month::text,
			  bl.amount::float8,
			  coalesce((
			    select sum(l.debit - l.credit)::float8
			    from public.fin_journal_entry_lines l
			    join public.fin_journal_entries je on je.id = l.journal_entry_id
			    where je.tenant_id = $1 and je.status = 'posted'
			      and l.account_id = bl.account_id
			      and date_trunc('month', je.entry_date)::date = bl.period_month
			  ), 0)::float8
			from public.fin_budget_lines bl
			join public.fin_budget_headers bh on bh.id = bl.budget_id
			left join public.fin_accounts a on a.id = bl.account_id
			where bl.budget_id = $2 and bh.tenant_id = $1
			order by bl.period_month, a.account_code`, tu.TenantID, budgetID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="budget-vs-actual.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Account Code", "Account Name", "Period", "Budget", "Actual", "Variance"})
		for rows.Next() {
			var code, name, period string
			var budget, actual float64
			if err := rows.Scan(&code, &name, &period, &budget, &actual); err != nil {
				break
			}
			_ = cw.Write([]string{code, name, period, formatFloat(budget), formatFloat(actual), formatFloat(budget - actual)})
		}
		cw.Flush()
	}
}

func formatFloat(v float64) string {
	return fmt.Sprintf("%.2f", v)
}
