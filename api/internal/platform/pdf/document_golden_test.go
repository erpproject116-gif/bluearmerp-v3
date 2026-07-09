package pdf

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"testing"
)

func purchaseOrderFixture() GenericDocumentInput {
	return GenericDocumentInput{
		DocTitle:          "Purchase Order",
		DocSubtitle:       "PO-2026-0042",
		Tenant:            Party{CompanyName: "Acme Trading Co.", Phone: "+63 2 1234 5678"},
		CounterpartyTitle: "Supplier",
		Counterparty:      Party{CompanyName: "SupplyCo Ltd.", Email: "orders@supplyco.test"},
		DetailFields: []PartyField{
			{Label: "Date", Value: "01/15/2026"},
			{Label: "Currency", Value: "PHP"},
		},
		LineHeaders:   []string{"#", "Item", "Qty", "Unit", "Total"},
		LineRows:      [][]string{{"1", "SKU-01 — Widget A", "10.00", "100.00", "1000.00"}},
		LineColWidths: []float64{10, 90, 20, 30, 30},
		Totals: []TotalRow{
			{Label: "Subtotal", Value: "PHP 1000.00"},
			{Label: "Grand Total", Value: "PHP 1000.00", Bold: true},
		},
		Notes: "Deliver to main warehouse.",
	}
}

func TestRenderGenericDocumentPDFGolden(t *testing.T) {
	pdf, err := RenderGenericDocumentPDF(purchaseOrderFixture())
	if err != nil {
		t.Fatalf("RenderGenericDocumentPDF: %v", err)
	}
	if len(pdf) < 4 || string(pdf[:4]) != "%PDF" {
		t.Fatalf("expected PDF header, got %q", string(pdf[:min(8, len(pdf))]))
	}

	hash := sha256.Sum256(pdf)
	got := hex.EncodeToString(hash[:])

	if os.Getenv("UPDATE_GOLDEN") == "1" {
		t.Logf("generic document golden sha256: %s", got)
		return
	}

	const want = "30900e5cb046d6ec7bf6401cf47180474331bee98f46ff61c6c8462d564cc427"
	if got != want {
		t.Fatalf("generic document PDF drift: got sha256=%s want %s", got, want)
	}
}
