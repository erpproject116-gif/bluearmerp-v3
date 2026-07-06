package activitylog

import (
	"testing"
)

func TestDiffChanges_doesNotFalseClearDisplayFields(t *testing.T) {
	oldM := map[string]any{
		"id":              float64(6),
		"sales_order_no":  "260626001",
		"customer_name":   "JUANEL CASAVERDE",
		"location_name":   "Head Office",
		"grand_total":     float64(6100),
		"created_by_name": "John Ranel",
	}
	newM := map[string]any{
		"partner_id":      float64(1),
		"location_id":     float64(2),
		"progress_status": "in_progress",
		"grand_total":     float64(6200),
		"notes":           "Updated note",
	}
	details := diffChanges(oldM, newM)
	for _, d := range details {
		if containsSubstring(d, "customer name cleared") || containsSubstring(d, "sales order no cleared") {
			t.Fatalf("unexpected false clear line: %q", d)
		}
	}
	if len(details) == 0 {
		t.Fatal("expected at least one change detail")
	}
}

func containsSubstring(s, sub string) bool {
	return len(sub) == 0 || (len(s) >= len(sub) && indexOf(s, sub) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

func TestLinesChanged_detectsLineEdits(t *testing.T) {
	oldM := map[string]any{"lines": []any{map[string]any{"line_no": float64(1), "qty": float64(1)}}}
	newM := map[string]any{"lines": []any{map[string]any{"line_no": float64(1), "qty": float64(2)}}}
	if !linesChanged(oldM, newM) {
		t.Fatal("expected lines to be detected as changed")
	}
	if linesChanged(oldM, oldM) {
		t.Fatal("expected identical lines to be unchanged")
	}
}
