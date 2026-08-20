package dashboard

import "testing"

func TestSanitizeHomeWidgetIDs_DefaultFinance(t *testing.T) {
	got := sanitizeHomeWidgetIDs([]string{"day_jobs", "unknown", "sales_trend", "day_jobs"})
	if got[0] != "finance" {
		t.Fatalf("finance must be first, got %v", got)
	}
	if len(got) != 3 {
		t.Fatalf("expected 3 widgets after sanitize, got %v", got)
	}
}

func TestSanitizeHomeWidgetIDs_EmptyKeepsFinance(t *testing.T) {
	got := sanitizeHomeWidgetIDs(nil)
	if len(got) != 1 || got[0] != "finance" {
		t.Fatalf("empty layout must keep finance, got %v", got)
	}
}

func TestSanitizeHomeWidgetIDs_Allowlist(t *testing.T) {
	got := sanitizeHomeWidgetIDs([]string{"finance", "overdue", "cash_in_out", "shortcuts", "recent_activity"})
	if len(got) != 5 {
		t.Fatalf("got %v", got)
	}
}
