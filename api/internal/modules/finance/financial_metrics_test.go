package finance

import (
	"math"
	"testing"
	"time"
)

func TestPnLTotalsReconcileToStatementConvention(t *testing.T) {
	// Income credit 1000 → raw debit-credit = -1000 → revenue 1000
	// Expense debit 400 → raw = 400 → expense 400
	// Net = 600 equals P&L totalAmount (inverted income + inverted expense = 1000 + (-400))
	revenue, expense, net := PnLTotalsFromSignedMoves(-1000, 400)
	if revenue != 1000 || expense != 400 || net != 600 {
		t.Fatalf("got revenue=%.2f expense=%.2f net=%.2f", revenue, expense, net)
	}
	pnlTotal := float64(-(-1000) + -400) // invertSign per row then sum
	if math.Abs(pnlTotal-net) > 1e-9 {
		t.Fatalf("P&L totalAmount %.2f != net %.2f", pnlTotal, net)
	}
}

func TestDeriveWindowTotalsGrossAndMargins(t *testing.T) {
	w := DeriveWindowTotals(1000, 300, 200, 50, 80, true)
	if w.GrossProfit != 700 || w.NetProfit != 500 {
		t.Fatalf("gp=%.2f net=%.2f", w.GrossProfit, w.NetProfit)
	}
	if math.Abs(w.GrossMarginPct-70) > 1e-9 || math.Abs(w.NetMarginPct-50) > 1e-9 {
		t.Fatalf("margins gp%%=%.2f net%%=%.2f", w.GrossMarginPct, w.NetMarginPct)
	}
	if w.ValueFor(MetricRevenue) != 1000 || w.ValueFor(MetricCash) != 50 {
		t.Fatalf("ValueFor mismatch")
	}
}

func TestPercentChangeZeroPrevious(t *testing.T) {
	pct, label := percentChange(0, 100)
	if pct != nil || label != "New" {
		t.Fatalf("want New, got pct=%v label=%s", pct, label)
	}
	pct, label = percentChange(0, 0)
	if pct != nil || label != "N/A" {
		t.Fatalf("want N/A, got pct=%v label=%s", pct, label)
	}
	pct, label = percentChange(200, 300)
	if pct == nil || math.Abs(*pct-50) > 1e-9 || label != "" {
		t.Fatalf("want 50%%, got %v %s", pct, label)
	}
}

func TestBuildMetricDeltaFavorable(t *testing.T) {
	rev := MetricDictionary()[0] // revenue UP
	d := BuildMetricDelta(rev, 110, 100, 500, 400)
	if d.Direction != "up" || d.Favorable == nil || !*d.Favorable {
		t.Fatalf("revenue up should be favorable: %+v", d)
	}
	opex := MetricDef{Key: MetricOperatingExpenses, PreferredDirection: PreferDown, Format: "money"}
	d2 := BuildMetricDelta(opex, 120, 100, 0, 0)
	if d2.Favorable == nil || *d2.Favorable {
		t.Fatalf("opex up should be unfavorable")
	}
	margin := MetricDef{Key: MetricNetMarginPct, PreferredDirection: PreferUp, Format: "percent"}
	d3 := BuildMetricDelta(margin, 18.4, 16.1, 0, 0)
	if d3.ChangePP == nil || math.Abs(*d3.ChangePP-2.3) > 1e-9 {
		t.Fatalf("want +2.3 pp, got %v", d3.ChangePP)
	}
	if d3.ChangePct != nil {
		t.Fatalf("ratios should not use change_pct")
	}
}

func TestResolveComparisonPreviousMonth(t *testing.T) {
	from := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 9, 30, 0, 0, 0, 0, time.UTC)
	fy := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	p, err := ResolveComparison(ComparePreviousMonth, from, to, fy, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if p.CompareFrom.Format("2006-01-02") != "2026-08-01" || p.CompareTo.Format("2006-01-02") != "2026-08-31" {
		t.Fatalf("compare %s..%s", p.CompareFrom.Format("2006-01-02"), p.CompareTo.Format("2006-01-02"))
	}
}

func TestResolveComparisonSameMonthLY(t *testing.T) {
	to := time.Date(2026, 9, 15, 0, 0, 0, 0, time.UTC)
	fy := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	p, err := ResolveComparison(CompareSameMonthLY, to, to, fy, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if p.CurrentFrom.Format("2006-01") != "2026-09" || p.CompareFrom.Format("2006-01") != "2025-09" {
		t.Fatalf("cur=%s cmp=%s", p.CurrentFrom, p.CompareFrom)
	}
}

func TestResolveComparisonYTDvsPrior(t *testing.T) {
	to := time.Date(2026, 9, 30, 0, 0, 0, 0, time.UTC)
	fy := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC) // fiscal starts April
	p, err := ResolveComparison(CompareYTDvsPriorYTD, fy, to, fy, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if p.CurrentFrom.Format("2006-01-02") != "2026-04-01" {
		t.Fatalf("YTD start %s", p.CurrentFrom)
	}
	if p.CompareFrom.Format("2006-01-02") != "2025-04-01" || p.CompareTo.Format("2006-01-02") != "2025-09-30" {
		t.Fatalf("prior YTD %s..%s", p.CompareFrom, p.CompareTo)
	}
}

func TestResolveComparisonCustom(t *testing.T) {
	curFrom := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	curTo := time.Date(2026, 3, 31, 0, 0, 0, 0, time.UTC)
	cf := time.Date(2025, 10, 1, 0, 0, 0, 0, time.UTC)
	ct := time.Date(2025, 12, 31, 0, 0, 0, 0, time.UTC)
	p, err := ResolveComparison(CompareCustom, curFrom, curTo, curFrom, &cf, &ct)
	if err != nil {
		t.Fatal(err)
	}
	if p.CompareFrom != cf || p.CompareTo != ct {
		t.Fatalf("custom mismatch")
	}
}

func TestMetricDictionaryHasSixPrimaryKPIs(t *testing.T) {
	n := 0
	for _, d := range MetricDictionary() {
		if d.PrimaryKPI {
			n++
		}
	}
	if n != 6 {
		t.Fatalf("want 6 primary KPIs, got %d", n)
	}
}
