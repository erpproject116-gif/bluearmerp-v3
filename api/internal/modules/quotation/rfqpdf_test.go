package quotation

import (
	"strings"
	"testing"
)

func TestClassifyRfqPageText_coverVsTable(t *testing.T) {
	if classifyRfqPageText("REQUEST FOR QUOTATION\nDepartment of Justice", 5) != rfqPageSkip {
		t.Fatal("expected cover skip")
	}
	table := "Item Code  Qty  Description  Unit Price\nABC-001  10  Pump seal  1500"
	if classifyRfqPageText(table, 12) != rfqPageTable {
		t.Fatal("expected table page")
	}
}

func TestPlainTextToWords_columns(t *testing.T) {
	text := "Item\tQty\tDescription\nABC-001\t10\tPump seal kit"
	words := plainTextToWords(text)
	if len(words) < 4 {
		t.Fatalf("expected words, got %d", len(words))
	}
	if words[0].Text != "Item" || words[1].Text != "Qty" {
		t.Fatalf("unexpected first row: %+v", words[:3])
	}
}

func TestSplitTableLine_spaces(t *testing.T) {
	parts := splitTableLine("ABC-001    10    Industrial pump")
	if len(parts) != 3 {
		t.Fatalf("expected 3 parts, got %v", parts)
	}
	if strings.TrimSpace(parts[0]) != "ABC-001" {
		t.Fatalf("unexpected: %v", parts)
	}
}
