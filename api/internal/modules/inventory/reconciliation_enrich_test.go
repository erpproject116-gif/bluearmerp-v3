package inventory

import "testing"

func TestSerialQtyMismatchRowHasDocumentFields(t *testing.T) {
	// Compile-time / shape guard: enriched API fields must exist for SpreadsheetGrid columns.
	row := serialQtyMismatchRow{
		DocumentNo:    "260716003",
		DocumentLabel: "Sales 260716003",
		ContextLabel:  "Sales line",
	}
	if row.DocumentNo == "" || row.DocumentLabel == "" || row.ContextLabel == "" {
		t.Fatal("document enrichment fields must be populated for UI")
	}
}

func TestGRSerialGapRowHasReference(t *testing.T) {
	row := grSerialGapRow{
		Reference:     "GR-1",
		DocumentLabel: "GR GR-1",
	}
	if row.Reference == "" {
		t.Fatal("gr-serial-gap must expose reference for human tables")
	}
}
