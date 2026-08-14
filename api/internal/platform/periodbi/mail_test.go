package periodbi

import (
	"strings"
	"testing"
)

func TestFormatWeeklySubjectAndLinks(t *testing.T) {
	rep := Report{
		Period:        "weekly",
		AsOf:          "2026-08-14",
		WindowLabel:   "Last 7 days",
		SalesInWindow: 1000,
		RedFlagTotal:  2,
		RedFlags:      []NamedAmount{{Label: "Low stock", Count: 2, Href: "/app/inventory/find-stock"}},
	}
	subj, htmlBody, textBody := Format("Acme Co", rep, "https://app.bluearmerp.com")
	if !strings.Contains(subj, "risk signal") {
		t.Fatalf("subject=%q", subj)
	}
	if !strings.Contains(htmlBody, "/app/dashboard/period-summary?period=weekly") {
		t.Fatal("missing in-app deep link")
	}
	if !strings.Contains(htmlBody, "#3c50e0") {
		t.Fatal("missing brand color")
	}
	if !strings.Contains(textBody, "Acme Co") {
		t.Fatal("text missing company")
	}
}
