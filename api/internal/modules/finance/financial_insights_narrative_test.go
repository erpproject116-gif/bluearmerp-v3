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
