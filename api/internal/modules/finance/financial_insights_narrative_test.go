package finance

import (
	"strings"
	"testing"
)

func TestInsightsReadingSalesStartedLeadsWithPesos(t *testing.T) {
	metrics := []insightsMetricRow{
		moneyMetric(MetricRevenue, "Revenue", PreferUp, 5000, 0),
	}
	note := BuildInsightsReading(metrics, insightsDataQuality{})
	if !strings.Contains(note, "Sales started at ₱5,000.00") {
		t.Fatalf("note = %q", note)
	}
	if strings.Contains(note, "%") {
		t.Fatalf("percent leaked into a from-zero sales note: %q", note)
	}
	focus := InsightsReadingFocus(metrics)
	if len(focus) != 1 || focus[0] != string(MetricRevenue) {
		t.Fatalf("focus = %v", focus)
	}
}

func TestInsightsReadingMatchingProfitPercents(t *testing.T) {
	metrics := []insightsMetricRow{
		moneyMetric(MetricGrossProfit, "Gross Profit", PreferUp, 2266, 1000),
		moneyMetric(MetricNetProfit, "Net Profit", PreferUp, 2266, 1000),
	}
	note := BuildInsightsReading(metrics, insightsDataQuality{})
	if !strings.Contains(note, "Shop costs may be missing") {
		t.Fatalf("note = %q", note)
	}
	focus := InsightsReadingFocus(metrics)
	if len(focus) != 1 || focus[0] != string(MetricOperatingExpenses) {
		t.Fatalf("focus = %v", focus)
	}
}

func TestInsightsReadingUncollectedAndPayable(t *testing.T) {
	metrics := []insightsMetricRow{
		moneyMetric(MetricAccountsReceivable, "Accounts Receivable", PreferDown, 1239.5, 100),
		moneyMetric(MetricCash, "Cash", PreferUp, 1595, 1000),
		moneyMetric(MetricAccountsPayable, "Accounts Payable", PreferDown, 215.2, 100),
	}
	note := BuildInsightsReading(metrics, insightsDataQuality{})
	if !strings.Contains(note, "uncollected") || !strings.Contains(note, "Collect the largest balances") {
		t.Fatalf("collect action missing: %q", note)
	}
	if !strings.Contains(note, "Check what is due this week") {
		t.Fatalf("payable action missing: %q", note)
	}
	focus := InsightsReadingFocus(metrics)
	if len(focus) != 2 || focus[0] != string(MetricAccountsReceivable) || focus[1] != string(MetricAccountsPayable) {
		t.Fatalf("focus = %v", focus)
	}
}

func TestContributorFilterDoesNotQueryBalancesAsExpenses(t *testing.T) {
	for _, key := range []MetricKey{MetricCash, MetricAccountsReceivable, MetricAccountsPayable} {
		types, _, _, ok := contributorFilter(key)
		if ok || len(types) > 0 {
			t.Fatalf("%s must not query accounts, got %v ok=%v", key, types, ok)
		}
		stem, label, balance := balanceChangeNote(key)
		if !balance || stem == "" || label == "" {
			t.Fatalf("%s missing balance note", key)
		}
	}
	types, _, _, ok := contributorFilter(MetricRevenue)
	if !ok || len(types) != 1 || types[0] != "income" {
		t.Fatalf("sales filter = %v ok=%v", types, ok)
	}
}

func TestInsightsReadingDataQualityFirst(t *testing.T) {
	dq := insightsDataQuality{Incomplete: true, Message: "Financial data may be incomplete: 2 draft journal(s)."}
	metrics := []insightsMetricRow{
		moneyMetric(MetricAccountsPayable, "Accounts Payable", PreferDown, 200, 100),
	}
	note := BuildInsightsReading(metrics, dq)
	if !strings.HasPrefix(note, dq.Message) {
		t.Fatalf("warning was not first: %q", note)
	}
	focus := InsightsReadingFocus(metrics)
	if len(focus) != 1 || focus[0] != string(MetricAccountsPayable) {
		t.Fatalf("warning must not be a focus key: %v", focus)
	}
}

func moneyMetric(key MetricKey, label string, pref PreferredDirection, current, previous float64) insightsMetricRow {
	def := MetricDef{Key: key, Label: label, Format: "money", PreferredDirection: pref, PrimaryKPI: true}
	return insightsMetricRow{
		Key:         string(key),
		Label:       label,
		Format:      "money",
		PrimaryKPI:  true,
		MetricDelta: BuildMetricDelta(def, current, previous, 0, 0),
	}
}
