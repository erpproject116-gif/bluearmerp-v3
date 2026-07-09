package pdf

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"testing"
	"time"
)

func fixedGeneratedAt() time.Time {
	return time.Date(2026, 1, 15, 10, 30, 0, 0, time.UTC)
}

func quotationFixture() QuotationPrintInput {
	gen := fixedGeneratedAt()
	return QuotationPrintInput{
		Tenant: Party{
			CompanyName: "Acme Trading Co.",
			Address:     "123 Main St, Manila",
			Phone:       "+63 2 1234 5678",
			Email:       "sales@acme.test",
		},
		Partner: Party{
			CompanyName: "Beta Builders Inc.",
			Address:     "456 Oak Ave",
			Mobile:      "+63 917 000 0000",
			Email:       "procurement@beta.test",
		},
		Quotation: QuotationDoc{
			ReferenceNo:    "Q-2026-001",
			DateNoDisplay:  "001",
			OrderDate:      "2026-01-10",
			TaxTypeName:    "VAT inclusive",
			CurrencyCode:   "PHP",
			LocationName:   "Main warehouse",
			PicName:        "Jane Doe",
			ProgressStatus: "in_progress",
			ValidUntil:     "2026-02-10",
			PaymentTerms:   "50% down, 50% on delivery",
			Notes:          "Lead time 2 weeks.",
			Subtotal:       1000.00,
			TaxTotal:       120.00,
			GrandTotal:     1120.00,
			Lines: []QuotationLine{
				{LineNo: 1, ItemCode: "SKU-01", ItemName: "Widget A", Qty: 2, UnitVatInc: 500, LineTotal: 1000},
			},
		},
		GeneratedAt: &gen,
	}
}

func TestRenderQuotationPDFGolden(t *testing.T) {
	pdf, err := RenderQuotationPDF(quotationFixture())
	if err != nil {
		t.Fatalf("RenderQuotationPDF: %v", err)
	}
	if len(pdf) < 4 || string(pdf[:4]) != "%PDF" {
		t.Fatalf("expected PDF header, got %q", string(pdf[:min(8, len(pdf))]))
	}

	hash := sha256.Sum256(pdf)
	got := hex.EncodeToString(hash[:])

	if os.Getenv("UPDATE_GOLDEN") == "1" {
		t.Logf("quotation golden sha256: %s", got)
		return
	}

	const want = "79249fc72fb1e40573cf5eed64b6953afda6deb63a8364787248ed7b31f7dbd3"
	if got != want {
		t.Fatalf("quotation PDF drift: got sha256=%s want %s", got, want)
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
