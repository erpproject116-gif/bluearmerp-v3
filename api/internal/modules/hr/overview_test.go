package hr

import (
	"strings"
	"testing"
	"time"
)

func TestHrOverviewCountsOnly(t *testing.T) {
	sql := strings.ToLower(hrOverviewSQL)
	for _, banned := range []string{"payroll", "payslip", "amount", "net_pay", "gross"} {
		if strings.Contains(sql, banned) {
			t.Fatalf("overview must not read pay figures, found %s", banned)
		}
	}
	if !strings.Contains(sql, "status='active'") || !strings.Contains(sql, "not in ('closed','cancelled')") {
		t.Fatal("overview filters active employees and open discipline cases")
	}
	if !strings.Contains(sql, "status='submitted'") || !strings.Contains(sql, "status='open'") {
		t.Fatal("overview counts pending leave and open absence alerts")
	}
}

func TestDisciplineReportRange(t *testing.T) {
	now := time.Date(2026, 10, 12, 15, 0, 0, 0, time.UTC)
	from, to, ok := disciplineReportRange("", "", now)
	if !ok || from != "2026-09-12" || to != "2026-10-12" {
		t.Fatalf("empty range should default to 30 days, got %s %s %v", from, to, ok)
	}
	from, to, ok = disciplineReportRange("2026-10-01", "2026-10-12", now)
	if !ok || from != "2026-10-01" || to != "2026-10-12" {
		t.Fatal("a valid range should pass through")
	}
	if _, _, ok = disciplineReportRange("2026-10-12", "2026-10-01", now); ok {
		t.Fatal("an inverted range should fail")
	}
	if _, _, ok = disciplineReportRange("10/01/2026", "2026-10-12", now); ok {
		t.Fatal("a non ISO date should fail")
	}
	if !strings.Contains(disciplineReportSQL, "c.created_at::date between") || !strings.Contains(disciplineReportSQL, disciplineHasRealFileSQL) {
		t.Fatal("report lists cases opened in the range and whether a real file is attached")
	}
}
