package quotation

import "testing"

func TestParseRfqPages_basicTable(t *testing.T) {
	pages := []struct {
		Page int
		Text string
	}{
		{Page: 1, Text: `REQUEST FOR QUOTATION
Item Code Qty Description
ABC-001 10 Industrial pump seal kit
2 5 pcs Heavy duty bearing 6205`},
	}
	lines := ParseRfqPages(pages)
	if len(lines) < 2 {
		t.Fatalf("expected >=2 lines, got %d", len(lines))
	}
	if lines[0].ItemCode != "ABC-001" || lines[0].Qty != "10" {
		t.Fatalf("first line: %+v", lines[0])
	}
}

func TestParseRfqPages_dedupes(t *testing.T) {
	pages := []struct {
		Page int
		Text string
	}{
		{Page: 1, Text: "ABC-001 2 Widget A"},
		{Page: 2, Text: "ABC-001 2 Widget A"},
	}
	lines := ParseRfqPages(pages)
	if len(lines) != 1 {
		t.Fatalf("expected 1 deduped line, got %d", len(lines))
	}
}
