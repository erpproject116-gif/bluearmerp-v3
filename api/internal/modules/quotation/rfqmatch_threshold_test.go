package quotation

import "testing"

// Golden match-threshold eval: documents the 0.7 auto-bind rule without changing it.
// Scores below 0.7 must not auto-bind; scores at/above 0.7 may bind.
func TestRfqAutoBindThreshold(t *testing.T) {
	const threshold = 0.7
	cases := []struct {
		name  string
		score float64
		bind  bool
	}{
		{"exact_code", 1.0, true},
		{"code_ilike", 0.85, true},
		{"name_full", 0.7, true},
		{"token_weak", 0.55, false},
		{"desc_token", 0.6, false},
		{"just_below", 0.69, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			shouldBind := tc.score >= threshold
			if shouldBind != tc.bind {
				t.Fatalf("score %.2f bind=%v want %v (threshold %.2f)", tc.score, shouldBind, tc.bind, threshold)
			}
		})
	}
}

func TestNormalizeRfqIdentityTokens(t *testing.T) {
	a := rfqLineIdentity(ParsedRfqLine{ItemName: "Laptop!", Qty: "8"})
	b := rfqLineIdentity(ParsedRfqLine{ItemName: "laptop", Qty: "8"})
	if a != b {
		t.Fatalf("identity mismatch: %q vs %q", a, b)
	}
}

func TestClassifyNumberedSectionVariant(t *testing.T) {
	pages := []RfqPageInput{{Page: 1, Text: "REQUEST FOR QUOTATION\nPhilGEPS\n1. Laptop – 8 units\nSpec\nFINANCIAL PROPOSAL"}}
	got := ClassifyRfqDocument(pages, nil)
	if got != RfqDocumentGovernmentSpec {
		t.Fatalf("type=%q", got)
	}
}

func TestClassifyBoqWithAmountDueNotInvoice(t *testing.T) {
	pages := []RfqPageInput{{Page: 1, Text: "REQUEST FOR QUOTATION\nBill of Quantities\nAmount Due subject to VAT"}}
	tables := []RfqStructuredTable{{Headers: []string{"Item", "Technical Specifications", "Qty"}, Rows: [][]string{{"A", "B", "1"}}}}
	got := ClassifyRfqDocument(pages, tables)
	if got == RfqDocumentInvoiceLike {
		t.Fatal("BOQ with Amount Due must not classify as invoice_like")
	}
}
