package finance

import (
	"math"
	"testing"
	"time"
)

func TestBuildTrendBucketsMonth(t *testing.T) {
	from := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 3, 10, 0, 0, 0, 0, time.UTC)
	b := BuildTrendBuckets(from, to, TrendMonth)
	if len(b) != 3 {
		t.Fatalf("want 3 months, got %d", len(b))
	}
	if b[0].From.Format("2006-01-02") != "2026-01-15" || b[0].To.Format("2006-01-02") != "2026-01-31" {
		t.Fatalf("jan clipped wrong: %s..%s", b[0].FromS, b[0].ToS)
	}
}

func TestIsMaterialChange(t *testing.T) {
	if !IsMaterialChange(2000, 100, 1000, 5) {
		t.Fatal("abs floor should material")
	}
	if IsMaterialChange(50, 10000, 1000, 5) {
		t.Fatal("tiny abs and pct should not material")
	}
	if !IsMaterialChange(600, 10000, 1000, 5) {
		t.Fatal("6% should material")
	}
}

func TestBuildKeyChangesOrdersMaterial(t *testing.T) {
	up := true
	metrics := []insightsMetricRow{
		{Key: "revenue", Label: "Revenue", PrimaryKPI: true, Format: "money", MetricDelta: MetricDelta{Change: 50, Previous: 10000, Direction: "up", Favorable: &up}},
		{Key: "operating_expenses", Label: "Operating Expenses", PrimaryKPI: true, Format: "money", MetricDelta: MetricDelta{Change: 5000, Previous: 10000, Direction: "up"}},
	}
	kc := BuildKeyChanges(metrics, 6)
	if len(kc) < 1 || kc[0].Key != "operating_expenses" {
		t.Fatalf("material opex should rank first: %+v", kc)
	}
}

func TestTrendBucketEmbedsBalanceSeries(t *testing.T) {
	// LoadTrendSeries copies WindowTotals into each bucket; JSON must expose
	// gross_profit / cash / AR / AP for the shared month chart.
	w := DeriveWindowTotals(100, 20, 10, 5, 6, 7, true)
	b := TrendBucket{Label: "Jan 2026", WindowTotals: w}
	if b.GrossProfit != 80 || b.Cash != 5 || b.AccountsReceivable != 6 || b.AccountsPayable != 7 {
		t.Fatalf("bucket missing series fields: %+v", b)
	}
	if b.ValueFor(MetricAccountsPayable) != 7 {
		t.Fatal("embedded ValueFor AP failed")
	}
}

func TestPnLTotalsStillReconcile(t *testing.T) {
	revenue, expense, net := PnLTotalsFromSignedMoves(-500, 200)
	if math.Abs(revenue-500) > 1e-9 || math.Abs(net-300) > 1e-9 || expense != 200 {
		t.Fatalf("got r=%.2f e=%.2f n=%.2f", revenue, expense, net)
	}
}
