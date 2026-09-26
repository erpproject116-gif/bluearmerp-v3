package finance

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// AccountContribution is one account's period-over-period delta.
type AccountContribution struct {
	AccountID   int64   `json:"account_id"`
	AccountCode string  `json:"account_code"`
	AccountName string  `json:"account_name"`
	AccountType string  `json:"account_type"`
	Current     float64 `json:"current"`
	Previous    float64 `json:"previous"`
	Change      float64 `json:"change"`
	Href        string  `json:"href"`
}

// KeyChange is a deterministic highlight for the Insights cockpit.
type KeyChange struct {
	Key         string  `json:"key"`
	Label       string  `json:"label"`
	Direction   string  `json:"direction"`
	Change      float64 `json:"change"`
	ChangePct   *float64 `json:"change_pct,omitempty"`
	ChangePP    *float64 `json:"change_pp,omitempty"`
	ChangeLabel string  `json:"change_label"`
	Favorable   *bool   `json:"favorable,omitempty"`
	Material    bool    `json:"material"`
}

const defaultMaterialAbs = 1000.0 // PHP
const defaultMaterialPct = 5.0

// IsMaterialChange requires meaningful absolute or percentage movement.
func IsMaterialChange(change, previous float64, absFloor, pctFloor float64) bool {
	if absFloor <= 0 {
		absFloor = defaultMaterialAbs
	}
	if pctFloor <= 0 {
		pctFloor = defaultMaterialPct
	}
	if math.Abs(change) >= absFloor {
		return true
	}
	if math.Abs(previous) < 1e-9 {
		return math.Abs(change) >= absFloor*0.1
	}
	return math.Abs(change/previous)*100 >= pctFloor
}

// BuildKeyChanges picks material movers from metric deltas (primary KPIs first).
func BuildKeyChanges(metrics []insightsMetricRow, limit int) []KeyChange {
	if limit <= 0 {
		limit = 6
	}
	var out []KeyChange
	for _, m := range metrics {
		if !m.PrimaryKPI && m.Format != "percent" {
			continue
		}
		mat := IsMaterialChange(m.Change, m.Previous, defaultMaterialAbs, defaultMaterialPct)
		if m.Format == "percent" {
			mat = m.ChangePP != nil && math.Abs(*m.ChangePP) >= 1.0
		}
		if !mat && math.Abs(m.Change) < 1e-9 {
			continue
		}
		label := fmtChangeLabel(m)
		out = append(out, KeyChange{
			Key:         m.Key,
			Label:       m.Label,
			Direction:   m.Direction,
			Change:      m.Change,
			ChangePct:   m.ChangePct,
			ChangePP:    m.ChangePP,
			ChangeLabel: label,
			Favorable:   m.Favorable,
			Material:    mat,
		})
	}
	// Prefer material first
	sortKeyChanges(out)
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}

func fmtChangeLabel(m insightsMetricRow) string {
	if m.Format == "percent" && m.ChangePP != nil {
		sign := ""
		if *m.ChangePP > 0 {
			sign = "+"
		}
		return fmt.Sprintf("%s%.1f pp", sign, *m.ChangePP)
	}
	if m.ChangePctLabel != "" {
		return m.ChangePctLabel
	}
	if m.ChangePct != nil {
		sign := ""
		if *m.ChangePct > 0 {
			sign = "+"
		}
		return fmt.Sprintf("%s%.1f%%", sign, *m.ChangePct)
	}
	return ""
}

func sortKeyChanges(rows []KeyChange) {
	for i := 0; i < len(rows); i++ {
		for j := i + 1; j < len(rows); j++ {
			si, sj := 0, 0
			if rows[i].Material {
				si = 1
			}
			if rows[j].Material {
				sj = 1
			}
			if sj > si || (sj == si && math.Abs(rows[j].Change) > math.Abs(rows[i].Change)) {
				rows[i], rows[j] = rows[j], rows[i]
			}
		}
	}
}

// LoadAccountContributors ranks accounts by |current-previous| for a metric class.
// metricKey: revenue | operating_expenses | cogs | net_profit (expense+income combined for net).
func LoadAccountContributors(
	ctx context.Context,
	pool *pgxpool.Pool,
	tenantID int64,
	curFrom, curTo, prevFrom, prevTo time.Time,
	metricKey MetricKey,
	limit int,
) ([]AccountContribution, error) {
	if limit <= 0 {
		limit = 8
	}
	accountTypes, cogsOnly, invert, supported := contributorFilter(metricKey)
	if !supported {
		return []AccountContribution{}, nil
	}
	curMap, err := loadAccountAmounts(ctx, pool, tenantID, curFrom, curTo, accountTypes, cogsOnly, invert)
	if err != nil {
		return nil, err
	}
	prevMap, err := loadAccountAmounts(ctx, pool, tenantID, prevFrom, prevTo, accountTypes, cogsOnly, invert)
	if err != nil {
		return nil, err
	}
	ids := map[int64]struct{}{}
	for id := range curMap {
		ids[id] = struct{}{}
	}
	for id := range prevMap {
		ids[id] = struct{}{}
	}
	out := make([]AccountContribution, 0, len(ids))
	qs := "date_from=" + curFrom.Format("2006-01-02") + "&date_to=" + curTo.Format("2006-01-02")
	for id := range ids {
		c := curMap[id]
		p := prevMap[id]
		chg := c.Amount - p.Amount
		if math.Abs(chg) < 1e-9 {
			continue
		}
		out = append(out, AccountContribution{
			AccountID:   id,
			AccountCode: c.Code,
			AccountName: coalesceName(c.Name, p.Name),
			AccountType: coalesceName(c.Type, p.Type),
			Current:     c.Amount,
			Previous:    p.Amount,
			Change:      chg,
			Href:        "/app/finance/acct-i/reports/general-ledger?" + qs + "&q=" + c.Code,
		})
	}
	// sort by abs change desc
	for i := 0; i < len(out); i++ {
		for j := i + 1; j < len(out); j++ {
			if math.Abs(out[j].Change) > math.Abs(out[i].Change) {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

type acctAmt struct {
	Code   string
	Name   string
	Type   string
	Amount float64
}

func coalesceName(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

func contributorFilter(key MetricKey) (types []string, cogsOnly *bool, invert bool, supported bool) {
	switch key {
	case MetricRevenue:
		return []string{"income"}, nil, true, true
	case MetricCOGS:
		t := true
		return []string{"expense"}, &t, false, true
	case MetricOperatingExpenses:
		t := false
		return []string{"expense"}, &t, false, true
	case MetricGrossProfit, MetricNetProfit:
		return []string{"income", "expense"}, nil, true, true
	default:
		// Cash, money customers owe, and money you owe are ending balances.
		// They must not fall through to expense accounts.
		return nil, nil, false, false
	}
}

// balanceChangeNote is the plain sentence stem for an ending balance.
// The handler fills the pesos. Account queries are not used.
func balanceChangeNote(key MetricKey) (stem string, hrefLabel string, ok bool) {
	switch key {
	case MetricCash:
		return "Cash", "Open cash on the balance sheet", true
	case MetricAccountsReceivable:
		return "Money customers owe", "Open who owes you", true
	case MetricAccountsPayable:
		return "Money you owe", "Open who you owe", true
	default:
		return "", "", false
	}
}

func loadAccountAmounts(
	ctx context.Context,
	pool *pgxpool.Pool,
	tenantID int64,
	from, to time.Time,
	accountTypes []string,
	cogsOnly *bool,
	invertSign bool,
) (map[int64]acctAmt, error) {
	typeList := "'" + accountTypes[0] + "'"
	for i := 1; i < len(accountTypes); i++ {
		typeList += ",'" + accountTypes[i] + "'"
	}
	cogsClause := ""
	if cogsOnly != nil {
		if *cogsOnly {
			cogsClause = ` and a.id in (
			  with recursive cogs_roots as (
			    select id from public.fin_accounts
			    where tenant_id = $1 and deleted_at is null
			      and (account_code in ('5005','5010')
			        or id = (select coalesce(cogs_account_id,0) from public.tenant_finance_defaults where tenant_id = $1 limit 1))
			    union
			    select child.id from public.fin_accounts child
			    join cogs_roots r on child.parent_id = r.id
			    where child.tenant_id = $1 and child.deleted_at is null
			  ) select id from cogs_roots)`
		} else {
			cogsClause = ` and a.id not in (
			  with recursive cogs_roots as (
			    select id from public.fin_accounts
			    where tenant_id = $1 and deleted_at is null
			      and (account_code in ('5005','5010')
			        or id = (select coalesce(cogs_account_id,0) from public.tenant_finance_defaults where tenant_id = $1 limit 1))
			    union
			    select child.id from public.fin_accounts child
			    join cogs_roots r on child.parent_id = r.id
			    where child.tenant_id = $1 and child.deleted_at is null
			  ) select id from cogs_roots)`
		}
	}
	q := `
		select a.id, a.account_code, a.account_name, a.account_type,
		  coalesce(sum(l.debit - l.credit), 0)::float8
		from public.fin_journal_entry_lines l
		join public.fin_journal_entries je on je.id = l.journal_entry_id
		join public.fin_accounts a on a.id = l.account_id
		where je.tenant_id = $1 and je.status = 'posted'
		  and je.entry_date >= $2::date and je.entry_date <= $3::date
		  and a.account_type in (` + typeList + `)
		  and coalesce(a.is_group, false) = false` + cogsClause + `
		group by a.id, a.account_code, a.account_name, a.account_type
		having coalesce(sum(l.debit - l.credit), 0) <> 0`
	rows, err := pool.Query(ctx, q, tenantID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64]acctAmt{}
	for rows.Next() {
		var id int64
		var code, name, typ string
		var raw float64
		if err := rows.Scan(&id, &code, &name, &typ, &raw); err != nil {
			return nil, err
		}
		amt := raw
		if invertSign {
			amt = -raw
		} else if typ == "expense" {
			amt = raw // positive expense
		}
		out[id] = acctAmt{Code: code, Name: name, Type: typ, Amount: amt}
	}
	return out, rows.Err()
}
