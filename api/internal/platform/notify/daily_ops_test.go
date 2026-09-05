package notify

import (
	"strings"
	"testing"
)

func TestFormatDailyOpsQuietDay(t *testing.T) {
	subj, htmlBody, textBody := formatDailyOps("Acme Co", dailyOpsMetrics{}, "https://app.bluearmerp.com")
	if !strings.Contains(subj, "quiet day") {
		t.Fatalf("subject=%q want quiet day", subj)
	}
	if !strings.Contains(htmlBody, "No major movement today") {
		t.Fatal("html missing empty-state banner")
	}
	if !strings.Contains(htmlBody, "https://app.bluearmerp.com/app/dashboard") {
		t.Fatal("html missing dashboard deep link")
	}
	if !strings.Contains(textBody, "No major movement today.") {
		t.Fatal("text missing empty-state")
	}
	if !strings.Contains(htmlBody, "#3c50e0") {
		t.Fatal("html missing brand color")
	}
	if !strings.Contains(htmlBody, "Sent to business owners only") {
		t.Fatal("html should state business-owner recipients")
	}
	if strings.Contains(htmlBody, "store admins") {
		t.Fatal("html must not mention store admins as recipients")
	}
}

func TestFormatDailyOpsRiskSubjectAndLinks(t *testing.T) {
	m := dailyOpsMetrics{ZeroStockItems: 2, ReconGaps: 1, SalesCompletedToday: 3}
	subj, htmlBody, textBody := formatDailyOps("Acme Co", m, "https://app.bluearmerp.com")
	if !strings.Contains(subj, "risk signal") {
		t.Fatalf("subject=%q want risk signal", subj)
	}
	if !strings.Contains(htmlBody, "/app/sales/sales") {
		t.Fatal("missing sales deep link")
	}
	if !strings.Contains(htmlBody, "/app/sales-order/sales-orders") {
		t.Fatal("missing SO deep link")
	}
	if !strings.Contains(htmlBody, "/app/inventory/find-stock") {
		t.Fatal("missing find-stock deep link")
	}
	if !strings.Contains(htmlBody, "#b45309") {
		t.Fatal("risk values should use amber accent")
	}
	if !strings.Contains(textBody, "Zero stock items: 2") {
		t.Fatal("text missing zero stock count")
	}
	if !strings.Contains(textBody, "Open sales: https://app.bluearmerp.com/app/sales/sales") {
		t.Fatal("text missing deep link parity")
	}
}
