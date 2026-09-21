package finance

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/financedefaults"
)

type querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// LoadWindowTotals computes FLOW + BALANCE metrics for [from, to] (balances as-of to).
func LoadWindowTotals(ctx context.Context, pool *pgxpool.Pool, tenantID int64, from, to time.Time) (WindowTotals, error) {
	return loadWindowTotals(ctx, pool, tenantID, from, to)
}

func loadWindowTotals(ctx context.Context, q querier, tenantID int64, from, to time.Time) (WindowTotals, error) {
	var hasJE bool
	if err := q.QueryRow(ctx, `
		select exists(
		  select 1 from public.fin_journal_entries
		  where tenant_id = $1 and status = 'posted'
		    and entry_date >= $2::date and entry_date <= $3::date
		)`, tenantID, from, to).Scan(&hasJE); err != nil {
		return WindowTotals{}, err
	}

	var incomeRaw, cogsRaw, opexRaw float64
	err := q.QueryRow(ctx, `
		with recursive cogs_roots as (
		  select a.id
		  from public.fin_accounts a
		  where a.tenant_id = $1 and a.deleted_at is null
		    and (
		      a.account_code in ('5005', '5010')
		      or a.id = (
		        select coalesce(cogs_account_id, 0) from public.tenant_finance_defaults where tenant_id = $1 limit 1
		      )
		    )
		  union
		  select child.id
		  from public.fin_accounts child
		  join cogs_roots r on child.parent_id = r.id
		  where child.tenant_id = $1 and child.deleted_at is null
		),
		moves as (
		  select a.account_type,
		    case when a.account_type = 'expense' and a.id in (select id from cogs_roots) then true else false end as is_cogs,
		    coalesce(sum(l.debit - l.credit), 0)::float8 as raw
		  from public.fin_journal_entry_lines l
		  join public.fin_journal_entries je on je.id = l.journal_entry_id
		  join public.fin_accounts a on a.id = l.account_id
		  where je.tenant_id = $1 and je.status = 'posted'
		    and je.entry_date >= $2::date and je.entry_date <= $3::date
		    and a.account_type in ('income', 'expense')
		    and coalesce(a.is_group, false) = false
		  group by a.account_type,
		    case when a.account_type = 'expense' and a.id in (select id from cogs_roots) then true else false end
		)
		select
		  coalesce(sum(case when account_type = 'income' then raw else 0 end), 0)::float8,
		  coalesce(sum(case when account_type = 'expense' and is_cogs then raw else 0 end), 0)::float8,
		  coalesce(sum(case when account_type = 'expense' and not is_cogs then raw else 0 end), 0)::float8
		from moves`, tenantID, from, to).Scan(&incomeRaw, &cogsRaw, &opexRaw)
	if err != nil {
		return WindowTotals{}, err
	}

	revenue := -incomeRaw
	cogs := cogsRaw
	opex := opexRaw

	cash, err := loadBalanceClass(ctx, q, tenantID, to, "cash")
	if err != nil {
		return WindowTotals{}, err
	}
	ar, err := loadBalanceClass(ctx, q, tenantID, to, "ar")
	if err != nil {
		return WindowTotals{}, err
	}
	ap, err := loadBalanceClass(ctx, q, tenantID, to, "ap")
	if err != nil {
		return WindowTotals{}, err
	}

	return DeriveWindowTotals(revenue, cogs, opex, cash, ar, ap, hasJE), nil
}

func loadBalanceClass(ctx context.Context, q querier, tenantID int64, asOf time.Time, class string) (float64, error) {
	var role financedefaults.Role
	var groupCode, leafFallback, accountType, defaultsCol string
	liability := false
	switch class {
	case "cash":
		role = financedefaults.RoleCash
		groupCode = "1005"
		leafFallback = "1010"
		accountType = "asset"
		defaultsCol = "cash_account_id"
	case "ar":
		role = financedefaults.RoleReceivable
		groupCode = "1095"
		leafFallback = "1100"
		accountType = "asset"
		defaultsCol = "receivable_account_id"
	case "ap":
		role = financedefaults.RolePayable
		groupCode = "2005"
		leafFallback = "2010"
		accountType = "liability"
		defaultsCol = "payable_account_id"
		liability = true
	default:
		return 0, nil
	}

	var roleID int64
	_ = q.QueryRow(ctx, `
		select coalesce(`+defaultsCol+`, 0)
		from public.tenant_finance_defaults where tenant_id = $1 limit 1`, tenantID).Scan(&roleID)
	_ = role

	sumExpr := "coalesce(sum(l.debit - l.credit), 0)::float8"
	if liability {
		// Normal credit balance → positive AP owed.
		sumExpr = "coalesce(sum(l.credit - l.debit), 0)::float8"
	}

	var bal float64
	err := q.QueryRow(ctx, `
		with recursive roots as (
		  select a.id
		  from public.fin_accounts a
		  where a.tenant_id = $1 and a.deleted_at is null
		    and (
		      a.account_code = $2
		      or a.account_code = $3
		      or a.id = $4
		    )
		  union
		  select child.id
		  from public.fin_accounts child
		  join roots r on child.parent_id = r.id
		  where child.tenant_id = $1 and child.deleted_at is null
		)
		select `+sumExpr+`
		from public.fin_journal_entry_lines l
		join public.fin_journal_entries je on je.id = l.journal_entry_id
		join public.fin_accounts a on a.id = l.account_id
		where je.tenant_id = $1 and je.status = 'posted'
		  and je.entry_date <= $5::date
		  and coalesce(a.is_group, false) = false
		  and a.account_type = $6
		  and a.id in (select id from roots)`, tenantID, groupCode, leafFallback, roleID, asOf, accountType).Scan(&bal)
	return bal, err
}

// FiscalYearStartContaining returns fiscal year start for asOf, or calendar Jan 1.
func FiscalYearStartContaining(ctx context.Context, pool *pgxpool.Pool, tenantID int64, asOf time.Time) (time.Time, error) {
	var start time.Time
	err := pool.QueryRow(ctx, `
		select start_date
		from public.fin_fiscal_years
		where tenant_id = $1
		  and start_date <= $2::date and end_date >= $2::date
		order by start_date desc
		limit 1`, tenantID, asOf).Scan(&start)
	if err != nil {
		return time.Date(asOf.Year(), 1, 1, 0, 0, 0, 0, time.UTC), nil
	}
	return startOfDay(start), nil
}
