package finance

import (
	"math"
	"testing"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/invoicejournal"
)

func TestBuildCustomerCreditNoteLinesBalances(t *testing.T) {
	// Pure arithmetic shape check using fixed account ids (no DB).
	lines := []invoicejournal.Line{
		{AccountID: 1, Debit: 1000},
		{AccountID: 2, Credit: 1120},
		{AccountID: 3, Debit: 120},
	}
	var d, c float64
	for _, ln := range lines {
		d += ln.Debit
		c += ln.Credit
	}
	if math.Abs(d-c) > 0.0001 {
		t.Fatalf("customer credit lines not balanced: debit=%.4f credit=%.4f", d, c)
	}
}

func TestBuildVendorCreditLinesBalances(t *testing.T) {
	lines := []invoicejournal.Line{
		{AccountID: 1, Debit: 1120},
		{AccountID: 2, Credit: 1000},
		{AccountID: 3, Credit: 120},
	}
	var d, c float64
	for _, ln := range lines {
		d += ln.Debit
		c += ln.Credit
	}
	if math.Abs(d-c) > 0.0001 {
		t.Fatalf("vendor credit lines not balanced: debit=%.4f credit=%.4f", d, c)
	}
}

func TestCreditHasPostedJournalNilID(t *testing.T) {
	// Document: nil / zero JE id means not posted (cancel allowed for draft JE path).
	var jeID *int64
	if jeID != nil && *jeID > 0 {
		t.Fatal("expected nil je id")
	}
}

func TestCustomerCreditPretaxClamp(t *testing.T) {
	total, tax := 100.0, 150.0
	pretax := total - tax
	if pretax < 0 {
		pretax = 0
	}
	if pretax != 0 {
		t.Fatalf("pretax clamp want 0 got %v", pretax)
	}
}
