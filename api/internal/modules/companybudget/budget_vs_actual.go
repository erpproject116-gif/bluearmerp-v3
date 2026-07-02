package companybudget

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type BudgetVsActualRow struct {
	AccountID   int64   `json:"account_id"`
	AccountCode string  `json:"account_code"`
	AccountName string  `json:"account_name"`
	PeriodMonth string  `json:"period_month"`
	Budget      float64 `json:"budget"`
	Actual      float64 `json:"actual"`
	Variance    float64 `json:"variance"`
}

type BudgetVsActualSummary struct {
	BudgetID    int64               `json:"budget_id"`
	FiscalYear  int                 `json:"fiscal_year"`
	Name        string              `json:"name"`
	TotalBudget float64             `json:"total_budget"`
	TotalActual float64             `json:"total_actual"`
	Variance    float64             `json:"variance"`
	Lines       []BudgetVsActualRow `json:"lines"`
}

func budgetVsActual(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		budgetID, ok := parseBudgetID(w, r)
		if !ok {
			return
		}
		var summary BudgetVsActualSummary
		err := pool.QueryRow(r.Context(), `
			select id, fiscal_year, name from public.fin_budget_headers
			where id = $1 and tenant_id = $2`, budgetID, tu.TenantID,
		).Scan(&summary.BudgetID, &summary.FiscalYear, &summary.Name)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Budget not found.", "ERR_NOT_FOUND")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select bl.account_id, coalesce(a.account_code, ''), coalesce(a.account_name, ''),
			  bl.period_month::text, bl.amount::float8,
			  coalesce((
			    select sum(l.debit - l.credit)::float8
			    from public.fin_journal_entry_lines l
			    join public.fin_journal_entries je on je.id = l.journal_entry_id
			    where je.tenant_id = $1 and je.status = 'posted'
			      and l.account_id = bl.account_id
			      and date_trunc('month', je.entry_date) = date_trunc('month', bl.period_month)
			  ), 0)::float8
			from public.fin_budget_lines bl
			join public.fin_budget_headers bh on bh.id = bl.budget_id
			left join public.fin_accounts a on a.id = bl.account_id
			where bl.budget_id = $2 and bh.tenant_id = $1
			order by bl.period_month, a.account_code`, tu.TenantID, budgetID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load budget vs actual.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var lines []BudgetVsActualRow
		for rows.Next() {
			var row BudgetVsActualRow
			if err := rows.Scan(&row.AccountID, &row.AccountCode, &row.AccountName, &row.PeriodMonth, &row.Budget, &row.Actual); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read budget vs actual.", "ERR_INTERNAL")
				return
			}
			row.Variance = row.Budget - row.Actual
			summary.TotalBudget += row.Budget
			summary.TotalActual += row.Actual
			lines = append(lines, row)
		}
		if lines == nil {
			lines = []BudgetVsActualRow{}
		}
		summary.Variance = summary.TotalBudget - summary.TotalActual
		summary.Lines = lines
		response.OK(w, summary, "OK")
	}
}
