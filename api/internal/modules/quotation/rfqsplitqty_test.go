package quotation

import "testing"

func TestSplitQtyUnitCell(t *testing.T) {
	cases := []struct {
		in   string
		qty  string
		unit string
		ok   bool
	}{
		{"600 PCS", "600", "pcs", true},
		{"5 BOXES", "5", "box", true},
		{"10 ROLLS", "10", "roll", true},
		{"10 BOTTLES", "10", "bottle", true},
		{"3 reams", "3", "ream", true},
		{"2 packs.", "2", "pack", true},
		{"1,200 pcs", "1200", "pcs", true},
		{"600", "", "", false},       // plain number — normalizeQty handles it
		{"PCS", "", "", false},        // unit only
		{"8 hours", "", "", false},    // not a UoM
		{"12 widgets", "", "", false}, // unknown unit word
		{"", "", "", false},
	}
	for _, tc := range cases {
		qty, unit, ok := splitQtyUnitCell(tc.in)
		if ok != tc.ok || qty != tc.qty || unit != tc.unit {
			t.Errorf("splitQtyUnitCell(%q) = (%q, %q, %v), want (%q, %q, %v)",
				tc.in, qty, unit, ok, tc.qty, tc.unit, tc.ok)
		}
	}
}

func TestExtractQtyUnitPrefix(t *testing.T) {
	cases := []struct {
		in   string
		qty  string
		unit string
		rest string
		ok   bool
	}{
		{"600 PCS BALLPEN (100 BLUE; 50 RED)", "600", "pcs", "BALLPEN (100 BLUE; 50 RED)", true},
		// OCR-fused unit + description with no space.
		{"10 BOTTLESINK PENTEL PEN (5 BLACK, 5 BLUE)", "10", "bottle", "INK PENTEL PEN (5 BLACK, 5 BLUE)", true},
		{"30 BOXES CON. FORMS", "30", "box", "CON. FORMS", true},
		// Known-unit validation must protect real product names.
		{"3 CANDLE HOLDERS", "", "", "", false},
		{"2 GALLERY FRAMES", "", "", "", false},
		{"24 KARAT GOLD PLATING", "", "", "", false},
		{"BALLPEN BLUE", "", "", "", false},
	}
	for _, tc := range cases {
		qty, unit, rest, ok := extractQtyUnitPrefix(tc.in)
		if ok != tc.ok || qty != tc.qty || unit != tc.unit || rest != tc.rest {
			t.Errorf("extractQtyUnitPrefix(%q) = (%q, %q, %q, %v), want (%q, %q, %q, %v)",
				tc.in, qty, unit, rest, ok, tc.qty, tc.unit, tc.rest, tc.ok)
		}
	}
}

func TestNormalizeRfqUnitAliases(t *testing.T) {
	cases := map[string]string{
		"BOXES":   "box",
		"rolls":   "roll",
		"Bottles": "bottle",
		"packs":   "pack",
		"ream":    "ream",
		"pcs":     "pcs",
		"pc":      "pcs",
		"pieces":  "pcs",
		"units":   "unit",
		"unrt":    "unit", // OCR misread
		"nrt":     "unit", // OCR misread
		"lot":     "lot",
		"sets":    "set",
		"ea.":     "ea",
		"":        "",
		"widget":  "widget", // unknown passes through
	}
	for in, want := range cases {
		if got := normalizeRfqUnit(in); got != want {
			t.Errorf("normalizeRfqUnit(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestClassifySpecSheet(t *testing.T) {
	pages := []RfqPageInput{{Page: 1, Text: "UNINTERRUPTIBLE POWER SUPPLY (UPS)\nITR STANDARD SPECIFICATION\nCOMPLIANCE\nDETAILS MINIMUM REQUIREMENTS\n(Y/N)\nOutput power capacity 600 Watts\n-Nothing follows-"}}
	if got := ClassifyRfqDocument(pages, nil); got != RfqDocumentSpecSheet {
		t.Fatalf("type = %q, want spec_sheet", got)
	}
	// Deterministic parse must return zero lines for spec sheets.
	result, docType := ParseRfqDeterministic(pages, nil, RfqParseOptions{})
	if docType != RfqDocumentSpecSheet || len(result.Lines) != 0 {
		t.Fatalf("spec_sheet parse = %d lines (type %q), want 0", len(result.Lines), docType)
	}
	// Same content inside a real RFQ must NOT be blocked as spec_sheet.
	rfqPages := []RfqPageInput{{Page: 1, Text: "REQUEST FOR QUOTATION\nITR STANDARD SPECIFICATION\nCOMPLIANCE\nMINIMUM REQUIREMENTS"}}
	if got := ClassifyRfqDocument(rfqPages, nil); got == RfqDocumentSpecSheet {
		t.Fatal("RFQ with spec attachment must not classify as spec_sheet")
	}
}

func TestClassifyAnnexFuzzyHeader(t *testing.T) {
	// OCR-garbled "Arlicles / Descriplions" on a scanned annex form.
	pages := []RfqPageInput{{Page: 1, Text: "REQUEST FOR QUOTATION\nplease quote for the goods listed in Annex A\nArlicles / Descriplions\nQty Unit"}}
	if got := ClassifyRfqDocument(pages, nil); got != RfqDocumentGovernmentAnnex {
		t.Fatalf("type = %q, want gov_annex_table", got)
	}
	// Clean spelling still classifies.
	clean := []RfqPageInput{{Page: 1, Text: "REQUEST FOR QUOTATION\nAnnex \"A\"\nArticles / Descriptions\nQty Unit"}}
	if got := ClassifyRfqDocument(clean, nil); got != RfqDocumentGovernmentAnnex {
		t.Fatalf("clean type = %q, want gov_annex_table", got)
	}
}

func TestSpecSheetBlockedReason(t *testing.T) {
	blocked, reason := rfqBlockedReason(RfqDocumentSpecSheet)
	if !blocked || reason == "" {
		t.Fatalf("spec_sheet must block with a reason, got (%v, %q)", blocked, reason)
	}
	blocked, reason = rfqBlockedReason(RfqDocumentInvoiceLike)
	if !blocked || reason == "" {
		t.Fatalf("invoice_like must block with a reason, got (%v, %q)", blocked, reason)
	}
	if blocked, _ := rfqBlockedReason(RfqDocumentRFQ); blocked {
		t.Fatal("rfq must not block")
	}
}
