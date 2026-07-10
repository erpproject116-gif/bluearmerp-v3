package quotation

import "testing"

func TestParseRfqLayoutPages_tableWithHeaders(t *testing.T) {
	pages := []RfqPageInput{
		{
			Page: 1, Width: 600, Height: 800,
			Words: []RfqWord{
				{Text: "REQUEST", X: 50, Y: 40, W: 80, H: 12},
				{Text: "FOR", X: 140, Y: 40, W: 30, H: 12},
				{Text: "QUOTATION", X: 180, Y: 40, W: 90, H: 12},
				{Text: "Item", X: 40, Y: 120, W: 40, H: 12},
				{Text: "Code", X: 85, Y: 120, W: 40, H: 12},
				{Text: "Qty", X: 180, Y: 120, W: 30, H: 12},
				{Text: "Description", X: 260, Y: 120, W: 90, H: 12},
				{Text: "Unit", X: 400, Y: 120, W: 35, H: 12},
				{Text: "Price", X: 450, Y: 120, W: 40, H: 12},
				{Text: "ABC-001", X: 40, Y: 145, W: 60, H: 12},
				{Text: "10", X: 180, Y: 145, W: 20, H: 12},
				{Text: "Pump", X: 260, Y: 145, W: 40, H: 12},
				{Text: "seal", X: 305, Y: 145, W: 35, H: 12},
				{Text: "kit", X: 345, Y: 145, W: 25, H: 12},
				{Text: "pcs", X: 400, Y: 145, W: 30, H: 12},
				{Text: "1500", X: 450, Y: 145, W: 40, H: 12},
			},
		},
	}
	lines := ParseRfqLayoutPages(pages)
	if len(lines) != 1 {
		t.Fatalf("expected 1 line, got %d: %+v", len(lines), lines)
	}
	if lines[0].ItemCode != "ABC-001" || lines[0].Qty != "10" {
		t.Fatalf("unexpected line: %+v", lines[0])
	}
	if lines[0].UnitPrice != "1500" {
		t.Fatalf("expected unit price 1500, got %q", lines[0].UnitPrice)
	}
}

func TestParseRfqLayoutPages_skipsFooterAndCover(t *testing.T) {
	pages := []RfqPageInput{
		{
			Page: 1, Width: 500, Height: 700,
			Words: []RfqWord{
				{Text: "Please", X: 40, Y: 30, W: 50, H: 12},
				{Text: "quote", X: 95, Y: 30, W: 40, H: 12},
				{Text: "the", X: 140, Y: 30, W: 25, H: 12},
				{Text: "following", X: 170, Y: 30, W: 70, H: 12},
				{Text: "items", X: 245, Y: 30, W: 40, H: 12},
				{Text: "for", X: 290, Y: 30, W: 25, H: 12},
				{Text: "our", X: 320, Y: 30, W: 25, H: 12},
				{Text: "project", X: 350, Y: 30, W: 50, H: 12},
				{Text: "Item", X: 40, Y: 100, W: 35, H: 12},
				{Text: "Qty", X: 120, Y: 100, W: 30, H: 12},
				{Text: "Description", X: 200, Y: 100, W: 80, H: 12},
				{Text: "X-1", X: 40, Y: 125, W: 30, H: 12},
				{Text: "2", X: 120, Y: 125, W: 10, H: 12},
				{Text: "Widget", X: 200, Y: 125, W: 50, H: 12},
				{Text: "Subtotal", X: 40, Y: 150, W: 60, H: 12},
				{Text: "1000", X: 120, Y: 150, W: 40, H: 12},
			},
		},
	}
	lines := ParseRfqLayoutPages(pages)
	if len(lines) != 1 {
		t.Fatalf("expected 1 data line (no subtotal), got %d", len(lines))
	}
}

func TestParseRfqLayoutPages_multipageContinuation(t *testing.T) {
	pages := []RfqPageInput{
		{
			Page: 1, Width: 400, Height: 600,
			Words: []RfqWord{
				{Text: "Item", X: 30, Y: 80, W: 30, H: 10},
				{Text: "Qty", X: 120, Y: 80, W: 25, H: 10},
				{Text: "Description", X: 200, Y: 80, W: 80, H: 10},
				{Text: "A1", X: 30, Y: 100, W: 20, H: 10},
				{Text: "1", X: 120, Y: 100, W: 10, H: 10},
				{Text: "Alpha", X: 200, Y: 100, W: 40, H: 10},
			},
		},
		{
			Page: 2, Width: 400, Height: 600,
			Words: []RfqWord{
				// Continuation page: repeated header (common on multi-page RFQs)
				{Text: "Item", X: 30, Y: 40, W: 30, H: 10},
				{Text: "Qty", X: 120, Y: 40, W: 25, H: 10},
				{Text: "Description", X: 200, Y: 40, W: 80, H: 10},
				{Text: "B2", X: 30, Y: 60, W: 20, H: 10},
				{Text: "3", X: 120, Y: 60, W: 10, H: 10},
				{Text: "Beta", X: 200, Y: 60, W: 35, H: 10},
			},
		},
	}
	lines := ParseRfqDocument(pages)
	if len(lines) != 2 {
		t.Fatalf("expected 2 lines across pages, got %d: %+v", len(lines), lines)
	}
	if lines[1].ItemCode != "B2" || lines[1].Qty != "3" {
		t.Fatalf("page 2 line: %+v", lines[1])
	}
}

func TestRowToLine_continuationRow(t *testing.T) {
	header := rfqTextRow{
		cells: []string{"Item", "Qty", "Description"},
		words: []RfqWord{
			{Text: "Item", X: 30, Y: 80, W: 30, H: 10},
			{Text: "Qty", X: 120, Y: 80, W: 25, H: 10},
			{Text: "Description", X: 200, Y: 80, W: 80, H: 10},
		},
	}
	schema := buildColumnSchema(header, 400)
	if len(schema) < 2 {
		t.Fatalf("schema not built: %+v", schema)
	}
	data := rfqTextRow{
		cells: []string{"B2", "3", "Beta"},
		words: []RfqWord{
			{Text: "B2", X: 30, Y: 60, W: 20, H: 10},
			{Text: "3", X: 120, Y: 60, W: 10, H: 10},
			{Text: "Beta", X: 200, Y: 60, W: 35, H: 10},
		},
	}
	parsed := rowToLine(data, schema)
	if !parsed.ok || parsed.line.ItemCode != "B2" || parsed.line.Qty != "3" {
		t.Fatalf("unexpected parse: ok=%v line=%+v", parsed.ok, parsed.line)
	}
}

func TestGroupWordsIntoRows_page2(t *testing.T) {
	words := []RfqWord{
		{Text: "B2", X: 30, Y: 60, W: 20, H: 10},
		{Text: "3", X: 120, Y: 60, W: 10, H: 10},
		{Text: "Beta", X: 200, Y: 60, W: 35, H: 10},
	}
	rows := groupWordsIntoRows(words)
	if len(rows) != 1 || len(rows[0].cells) != 3 {
		t.Fatalf("rows: %+v", rows)
	}
}

func TestFindHeaderRowIndex_page2DataRow(t *testing.T) {
	rows := groupWordsIntoRows([]RfqWord{
		{Text: "B2", X: 30, Y: 60, W: 20, H: 10},
		{Text: "3", X: 120, Y: 60, W: 10, H: 10},
		{Text: "Beta", X: 200, Y: 60, W: 35, H: 10},
	})
	idx := findHeaderRowIndex(rows)
	if idx >= 0 {
		t.Fatalf("data row misidentified as header idx=%d cells=%v hits=%d", idx, rows[idx].cells, countHeaderCells(rows[idx]))
	}
}

func TestParseRfqLayoutPages_headerlessContinuation(t *testing.T) {
	pages := []RfqPageInput{
		{
			Page: 1, Width: 400, Height: 600,
			Words: []RfqWord{
				{Text: "Item", X: 30, Y: 80, W: 30, H: 10},
				{Text: "Qty", X: 120, Y: 80, W: 25, H: 10},
				{Text: "Description", X: 200, Y: 80, W: 80, H: 10},
				{Text: "A1", X: 30, Y: 100, W: 20, H: 10},
				{Text: "1", X: 120, Y: 100, W: 10, H: 10},
				{Text: "Alpha", X: 200, Y: 100, W: 40, H: 10},
			},
		},
		{
			Page: 2, Width: 400, Height: 600,
			Words: []RfqWord{
				{Text: "B2", X: 30, Y: 60, W: 20, H: 10},
				{Text: "3", X: 120, Y: 60, W: 10, H: 10},
				{Text: "Beta", X: 200, Y: 60, W: 35, H: 10},
			},
		},
	}
	lines := ParseRfqLayoutPages(pages)
	if len(lines) != 2 {
		t.Fatalf("expected 2 lines, got %d: %+v", len(lines), lines)
	}
}

func TestParseRfqDocument_fallbackPlainText(t *testing.T) {
	pages := []RfqPageInput{
		{Page: 1, Text: "ABC-001 10 Industrial pump seal kit"},
	}
	lines := ParseRfqDocument(pages)
	if len(lines) < 1 {
		t.Fatal("expected fallback plain parse")
	}
}
