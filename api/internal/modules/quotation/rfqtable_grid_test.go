package quotation

import "testing"

func TestMergeNearbyWords_joinsFragments(t *testing.T) {
	words := []RfqWord{
		{Text: "Descri", X: 100, Y: 50, W: 30, H: 10},
		{Text: "ption", X: 132, Y: 50, W: 28, H: 10},
		{Text: "10", X: 200, Y: 50, W: 15, H: 10},
	}
	merged := mergeNearbyWords(words)
	if len(merged) != 2 {
		t.Fatalf("expected 2 merged words, got %d: %+v", len(merged), merged)
	}
	if merged[0].Text != "Description" {
		t.Fatalf("expected Description, got %q", merged[0].Text)
	}
}

func TestPageTextToStructuredTable_tabular(t *testing.T) {
	text := "No.\tQty\tDescription\tUnit Price\n1\t10\tPump seal kit\t1500\n2\t5\tHeavy bearing\t800"
	tbl := pageTextToStructuredTable(1, text)
	if tbl == nil {
		t.Fatal("expected structured table")
	}
	if len(tbl.Rows) < 2 {
		t.Fatalf("expected 2 rows, got %d", len(tbl.Rows))
	}
	result := ParseRfqStructuredTables([]RfqStructuredTable{*tbl}, RfqParseOptions{})
	if len(result.Lines) < 2 {
		t.Fatalf("expected 2 lines, got %d: %+v", len(result.Lines), result.Lines)
	}
	if !result.TableDetected {
		t.Fatal("expected table detected")
	}
}

func TestFilterFallbackLines_dropsEmptyJunk(t *testing.T) {
	lines := []ParsedRfqLine{
		{Description: "", ItemCode: "", Qty: "1", Confidence: 0.5},
		{Description: "Valid pump seal", Qty: "1", Confidence: 0.5},
		{Description: "short", Qty: "1", Confidence: 0.5},
		{ItemCode: "ABC-1", Description: "Widget", Qty: "2", Confidence: 0.9},
	}
	filtered := filterFallbackLines(lines)
	if len(filtered) != 2 {
		t.Fatalf("expected 2 kept lines, got %d: %+v", len(filtered), filtered)
	}
}

func TestParseRfqDocument_inferredGridNoHeader(t *testing.T) {
	pages := []RfqPageInput{
		{
			Page: 1, Width: 600, Height: 800,
			Words: []RfqWord{
				{Text: "1", X: 30, Y: 120, W: 10, H: 12},
				{Text: "ABC-001", X: 80, Y: 120, W: 55, H: 12},
				{Text: "Pump seal kit", X: 200, Y: 120, W: 90, H: 12},
				{Text: "10", X: 360, Y: 120, W: 15, H: 12},
				{Text: "1500", X: 450, Y: 120, W: 35, H: 12},
				{Text: "2", X: 30, Y: 145, W: 10, H: 12},
				{Text: "XYZ-9", X: 80, Y: 145, W: 45, H: 12},
				{Text: "Heavy bearing", X: 200, Y: 145, W: 90, H: 12},
				{Text: "5", X: 360, Y: 145, W: 10, H: 12},
				{Text: "800", X: 450, Y: 145, W: 30, H: 12},
			},
		},
	}
	result := ParseRfqDocumentWithOptions(pages, RfqParseOptions{})
	if len(result.Lines) < 2 {
		t.Fatalf("expected >=2 inferred lines, got %d: %+v", len(result.Lines), result.Lines)
	}
	if !result.TableDetected {
		t.Fatalf("expected table detected via inferred grid, lines=%+v", result.Lines)
	}
}
