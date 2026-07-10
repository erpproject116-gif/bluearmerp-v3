package quotation

import "testing"

func TestParseRfqStructuredTables_laptopDesktopSheet(t *testing.T) {
	tables := []RfqStructuredTable{
		{
			Page: 1, Sheet: "Laptop",
			Headers: []string{"Item", "Quantity", "Technical Specifications", "Cost Per Unit", "Total Cost", "For reference only (not exact brand, model, and amount)", "Remarks"},
			Rows:    [][]string{{"Mid-Range Laptop", "85", "Intel Core i5, 16GB RAM", "45000", "3825000", "https://example.com/laptop", ""}},
		},
		{
			Page: 2, Sheet: "Desktop",
			Headers: []string{"Column 1", "Quantity", "Technical Specifications", "Cost Per Unit", "Total Cost", "For reference only (not exact brand, model, and amount)", "Remarks"},
			Rows:    [][]string{{"Mid-Range Desktops", "64", "Intel Core i7, 32GB RAM", "49000", "3136000", "https://example.com/desktop", ""}},
		},
	}
	result := ParseRfqStructuredTables(tables, RfqParseOptions{})
	if len(result.Lines) != 2 {
		t.Fatalf("expected 2 lines, got %d: %+v", len(result.Lines), result.Lines)
	}
	if !result.TableDetected {
		t.Fatal("expected table detected")
	}
	if result.Lines[0].ItemName != "Mid-Range Laptop" || result.Lines[0].Qty != "85" {
		t.Fatalf("laptop line: %+v", result.Lines[0])
	}
	if result.Lines[0].UnitPrice != "45000" {
		t.Fatalf("expected unit price 45000, got %q", result.Lines[0].UnitPrice)
	}
	if result.Lines[1].ItemName != "Mid-Range Desktops" || result.Lines[1].Qty != "64" {
		t.Fatalf("desktop line: %+v", result.Lines[1])
	}
	if !containsStr(result.Lines[1].Remarks, "Sheet: Desktop") {
		t.Fatalf("expected sheet remark, got %q", result.Lines[1].Remarks)
	}
}

func containsStr(s, sub string) bool {
	return len(sub) == 0 || (len(s) >= len(sub) && (s == sub || len(s) > 0 && stringContains(s, sub)))
}

func stringContains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
