package processpolicy

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// BudgetCheckResult holds optional budget control outcome.
type BudgetCheckResult struct {
	OverBudget bool
	Message    string
}

// ResolveDefaultExpenseAccount returns the first active expense account for budget checks.
func ResolveDefaultExpenseAccount(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (int64, error) {
	var accountID int64
	err := pool.QueryRow(ctx, `
		select id from public.fin_accounts
		where tenant_id = $1 and account_type = 'expense' and is_active = true and not is_group
		order by account_code asc limit 1`, tenantID).Scan(&accountID)
	return accountID, err
}

func periodMonthStart(t time.Time) string {
	y, m, _ := t.Date()
	return time.Date(y, m, 1, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
}

// CheckPurchaseBudget evaluates PR/PO spend against active company budget lines.
func CheckPurchaseBudget(ctx context.Context, pool *pgxpool.Pool, p Policy, tenantID int64, projectID *int64, docDate time.Time, amount float64) (BudgetCheckResult, error) {
	if p.BudgetControlMode == "off" || p.BudgetControlMode == "" || amount <= 0 {
		return BudgetCheckResult{}, nil
	}
	accountID, err := ResolveDefaultExpenseAccount(ctx, pool, tenantID)
	if err != nil || accountID <= 0 {
		return BudgetCheckResult{}, nil
	}
	return CheckBudget(ctx, pool, p, tenantID, accountID, nil, projectID, periodMonthStart(docDate), amount)
}

// CountBudgetOverruns counts active budget lines where posted actual exceeds budget (current month onward).
func CountBudgetOverruns(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (int64, error) {
	var count int64
	err := pool.QueryRow(ctx, `
		select count(*) from (
		  select bl.id
		  from public.fin_budget_lines bl
		  join public.fin_budget_headers bh on bh.id = bl.budget_id
		  where bh.tenant_id = $1 and bh.status = 'active'
		    and bl.period_month >= date_trunc('month', current_date)::date
		    and coalesce((
		      select sum(l.debit - l.credit)::float8
		      from public.fin_journal_entry_lines l
		      join public.fin_journal_entries je on je.id = l.journal_entry_id
		      where je.tenant_id = $1 and je.status = 'posted'
		        and l.account_id = bl.account_id
		        and date_trunc('month', je.entry_date)::date = bl.period_month
		    ), 0) > bl.amount + 0.0001
		) overruns`, tenantID).Scan(&count)
	return count, err
}

// CheckBudget evaluates spend against company budget when policy mode is warn or block.
func CheckBudget(ctx context.Context, pool *pgxpool.Pool, p Policy, tenantID, accountID int64, departmentID, projectID *int64, periodMonth string, amount float64) (BudgetCheckResult, error) {
	if p.BudgetControlMode == "off" || p.BudgetControlMode == "" {
		return BudgetCheckResult{}, nil
	}
	var budgetAmount, actualAmount float64
	err := pool.QueryRow(ctx, `
		select coalesce(bl.amount, 0)::float8,
		  coalesce((
		    select sum(jl.debit - jl.credit)
		    from public.fin_journal_entry_lines jl
		    join public.fin_journal_entries je on je.id = jl.journal_entry_id
		    where je.tenant_id = $1 and jl.account_id = $2
		      and date_trunc('month', je.entry_date)::date = $3::date
		      and je.status = 'posted'
		  ), 0)::float8
		from public.fin_budget_lines bl
		join public.fin_budget_headers bh on bh.id = bl.budget_id
		where bh.tenant_id = $1 and bh.status = 'active'
		  and bl.account_id = $2
		  and bl.period_month = $3::date
		limit 1`, tenantID, accountID, periodMonth).Scan(&budgetAmount, &actualAmount)
	if err != nil {
		return BudgetCheckResult{}, nil
	}
	if actualAmount+amount <= budgetAmount+0.0001 {
		return BudgetCheckResult{}, nil
	}
	msg := fmt.Sprintf("Over budget by %.2f for account %d (budget %.2f, actual+pending %.2f)", actualAmount+amount-budgetAmount, accountID, budgetAmount, actualAmount+amount)
	return BudgetCheckResult{OverBudget: true, Message: msg}, nil
}

// ValidateBudgetControl returns validation errors when mode is block and over budget.
func ValidateBudgetControl(p Policy, check BudgetCheckResult) map[string]string {
	if !check.OverBudget {
		return nil
	}
	if p.BudgetControlMode == "block" {
		return map[string]string{"budget": check.Message}
	}
	return nil
}
