package finance

// Financial Insights metric engine (W0 locks + W1 dictionary).
//
// Source of truth: posted fin_journal_entries only (status = 'posted'), filtered by entry_date.
// Same sign convention as periodbi.loadPnL / P&L invertSign:
//   revenue (FLOW) = sum(-(debit-credit)) on account_type = income
//   expense (FLOW) = sum(+(debit-credit)) on account_type = expense
//   net_profit     = revenue - total_expense
// COGS vs OpEx: expense accounts under CoA group 5005 (Cost of Sales), account 5010,
// or the tenant RoleCOGS default → COGS; all other expense → operating_expenses.
// BALANCE metrics (cash, AR): ending balance as of date_to = sum(debit-credit) for
// classified asset accounts with entry_date <= date_to (not period sum).
// Branch filter: deferred — fin_journal_entries has no branch_id.
// Fiscal YTD: fin_fiscal_years.start_date containing date_to, else calendar Jan 1.

// MetricType distinguishes period activity vs ending balance.
type MetricType string

const (
	MetricFlow    MetricType = "FLOW"
	MetricBalance MetricType = "BALANCE"
	MetricRatio   MetricType = "RATIO"
)

// PreferredDirection for favorable/unfavorable coloring.
type PreferredDirection string

const (
	PreferUp   PreferredDirection = "UP"
	PreferDown PreferredDirection = "DOWN"
)

// MetricKey is a stable dictionary key.
type MetricKey string

const (
	MetricRevenue             MetricKey = "revenue"
	MetricCOGS                MetricKey = "cogs"
	MetricGrossProfit         MetricKey = "gross_profit"
	MetricOperatingExpenses   MetricKey = "operating_expenses"
	MetricNetProfit           MetricKey = "net_profit"
	MetricGrossMarginPct      MetricKey = "gross_margin_pct"
	MetricNetMarginPct        MetricKey = "net_margin_pct"
	MetricCash                MetricKey = "cash"
	MetricAccountsReceivable  MetricKey = "accounts_receivable"
)

// MetricDef is the reusable metric dictionary entry.
type MetricDef struct {
	Key                MetricKey
	Label              string
	Type               MetricType
	PreferredDirection PreferredDirection
	Format             string // money | percent
	PrimaryKPI         bool
}

// MetricDictionary returns V1 metric definitions (no CoA IDs hardcoded).
func MetricDictionary() []MetricDef {
	return []MetricDef{
		{Key: MetricRevenue, Label: "Revenue", Type: MetricFlow, PreferredDirection: PreferUp, Format: "money", PrimaryKPI: true},
		{Key: MetricGrossProfit, Label: "Gross Profit", Type: MetricFlow, PreferredDirection: PreferUp, Format: "money", PrimaryKPI: true},
		{Key: MetricOperatingExpenses, Label: "Operating Expenses", Type: MetricFlow, PreferredDirection: PreferDown, Format: "money", PrimaryKPI: true},
		{Key: MetricNetProfit, Label: "Net Profit", Type: MetricFlow, PreferredDirection: PreferUp, Format: "money", PrimaryKPI: true},
		{Key: MetricCash, Label: "Cash", Type: MetricBalance, PreferredDirection: PreferUp, Format: "money", PrimaryKPI: true},
		{Key: MetricAccountsReceivable, Label: "Accounts Receivable", Type: MetricBalance, PreferredDirection: PreferDown, Format: "money", PrimaryKPI: true},
		{Key: MetricCOGS, Label: "Cost of Goods Sold", Type: MetricFlow, PreferredDirection: PreferDown, Format: "money"},
		{Key: MetricGrossMarginPct, Label: "Gross Margin %", Type: MetricRatio, PreferredDirection: PreferUp, Format: "percent"},
		{Key: MetricNetMarginPct, Label: "Net Profit Margin %", Type: MetricRatio, PreferredDirection: PreferUp, Format: "percent"},
	}
}

// WindowTotals are raw engine outputs for one date window / as-of.
type WindowTotals struct {
	Revenue            float64
	COGS               float64
	OperatingExpenses  float64
	NetProfit          float64
	GrossProfit        float64
	GrossMarginPct     float64
	NetMarginPct       float64
	Cash               float64
	AccountsReceivable float64
	HasJournalData     bool
}

// DeriveWindowTotals fills computed fields from revenue/cogs/opex (+ optional balances).
func DeriveWindowTotals(revenue, cogs, opex, cash, ar float64, hasJE bool) WindowTotals {
	gp := revenue - cogs
	net := revenue - cogs - opex
	w := WindowTotals{
		Revenue:            revenue,
		COGS:               cogs,
		OperatingExpenses:  opex,
		GrossProfit:        gp,
		NetProfit:          net,
		Cash:               cash,
		AccountsReceivable: ar,
		HasJournalData:     hasJE,
	}
	if revenue != 0 {
		w.GrossMarginPct = (gp / revenue) * 100
		w.NetMarginPct = (net / revenue) * 100
	}
	return w
}

// ValueFor returns a dictionary metric value from window totals.
func (w WindowTotals) ValueFor(key MetricKey) float64 {
	switch key {
	case MetricRevenue:
		return w.Revenue
	case MetricCOGS:
		return w.COGS
	case MetricGrossProfit:
		return w.GrossProfit
	case MetricOperatingExpenses:
		return w.OperatingExpenses
	case MetricNetProfit:
		return w.NetProfit
	case MetricGrossMarginPct:
		return w.GrossMarginPct
	case MetricNetMarginPct:
		return w.NetMarginPct
	case MetricCash:
		return w.Cash
	case MetricAccountsReceivable:
		return w.AccountsReceivable
	default:
		return 0
	}
}

// PnLTotalsFromSignedMoves mirrors statementSQL + invertSign aggregation for tests.
// rawMove is sum(debit-credit) per account_type bucket.
func PnLTotalsFromSignedMoves(incomeRaw, expenseRaw float64) (revenue, totalExpense, net float64) {
	revenue = -incomeRaw
	totalExpense = expenseRaw
	net = revenue - totalExpense
	return revenue, totalExpense, net
}
