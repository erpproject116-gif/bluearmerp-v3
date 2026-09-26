package finance

import (
	"math"
	"strings"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/money"
)

// BuildInsightsReading writes a short owner note from overview metrics.
// Amounts come only from those metrics. Percents are not used as the headline
// when sales started from about zero.
func BuildInsightsReading(metrics []insightsMetricRow, dq insightsDataQuality) string {
	var parts []string
	if dq.Incomplete && strings.TrimSpace(dq.Message) != "" {
		parts = append(parts, strings.TrimSpace(dq.Message))
	}

	sales := metricByKey(metrics, MetricRevenue)
	if sales != nil && salesStarted(*sales) {
		parts = append(parts, "Sales started at "+money.Format(sales.Current, "PHP")+
			". The earlier period was about zero, so read the peso change of "+
			money.Format(sales.Change, "PHP")+" and not a percent.")
	}

	gross := metricByKey(metrics, MetricGrossProfit)
	net := metricByKey(metrics, MetricNetProfit)
	if sameProfitPercent(gross, net) {
		parts = append(parts, "Profit after the goods and profit after everything moved by the same percent. Shop costs may be missing.")
	}

	ar := metricByKey(metrics, MetricAccountsReceivable)
	cash := metricByKey(metrics, MetricCash)
	if customersOweMuchMore(ar, cash) {
		parts = append(parts, "Money customers owe rose much more than cash ("+
			money.Format(ar.Change, "PHP")+" versus "+money.Format(cash.Change, "PHP")+
			"). The profit is uncollected. Collect the largest balances before spending the profit.")
	}

	ap := metricByKey(metrics, MetricAccountsPayable)
	if ap != nil && ap.Change > 1e-9 {
		parts = append(parts, "Money you owe rose by "+money.Format(ap.Change, "PHP")+". Check what is due this week.")
	}

	return strings.Join(parts, " ")
}

// InsightsReadingFocus lists the metric keys named by the reading rules.
// The data-quality warning is a banner, so it is not a focus key.
func InsightsReadingFocus(metrics []insightsMetricRow) []string {
	var keys []string
	if sales := metricByKey(metrics, MetricRevenue); sales != nil && salesStarted(*sales) {
		keys = append(keys, string(MetricRevenue))
	}
	gross := metricByKey(metrics, MetricGrossProfit)
	net := metricByKey(metrics, MetricNetProfit)
	if sameProfitPercent(gross, net) {
		keys = append(keys, string(MetricOperatingExpenses))
	}
	ar := metricByKey(metrics, MetricAccountsReceivable)
	cash := metricByKey(metrics, MetricCash)
	if customersOweMuchMore(ar, cash) {
		keys = append(keys, string(MetricAccountsReceivable))
	}
	if ap := metricByKey(metrics, MetricAccountsPayable); ap != nil && ap.Change > 1e-9 {
		keys = append(keys, string(MetricAccountsPayable))
	}
	if keys == nil {
		return []string{}
	}
	return keys
}

func metricByKey(metrics []insightsMetricRow, key MetricKey) *insightsMetricRow {
	for i := range metrics {
		if metrics[i].Key == string(key) {
			return &metrics[i]
		}
	}
	return nil
}

func salesStarted(m insightsMetricRow) bool {
	if math.Abs(m.Current) < 1e-9 {
		return false
	}
	return m.ChangePctLabel == "New" || math.Abs(m.Previous) < 1e-9
}

func sameProfitPercent(gross, net *insightsMetricRow) bool {
	if gross == nil || net == nil || gross.ChangePct == nil || net.ChangePct == nil {
		return false
	}
	if math.Abs(gross.Change) < 1e-9 && math.Abs(net.Change) < 1e-9 {
		return false
	}
	return math.Abs(*gross.ChangePct-*net.ChangePct) < 0.11
}

func customersOweMuchMore(ar, cash *insightsMetricRow) bool {
	if ar == nil || cash == nil || ar.Change <= 1e-9 {
		return false
	}
	if ar.ChangePct != nil && cash.ChangePct != nil {
		return *ar.ChangePct >= *cash.ChangePct*2 && *ar.ChangePct-*cash.ChangePct >= 20
	}
	// Sales-style "New" has no percent. Compare pesos only when cash did not also start from zero.
	if ar.ChangePctLabel == "New" && cash.ChangePctLabel != "New" {
		return true
	}
	return false
}
