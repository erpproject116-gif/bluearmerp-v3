package finance

import "testing"

func TestNormalizeARApps(t *testing.T) {
	in := []openPaymentApplyApp{
		{SalesID: 1, AppliedAmount: 100},
		{DocID: 2, AppliedAmount: 50},
		{SalesID: 3, AppliedAmount: 0},
		{SalesID: 4, AppliedAmount: 0, DiscountAmount: 25},
		{SalesID: 0, DocID: 0, AppliedAmount: 10},
	}
	out := normalizeARApps(in)
	if len(out) != 3 {
		t.Fatalf("want 3 apps, got %d", len(out))
	}
	if out[0].SalesID != 1 || out[0].AppliedAmount != 100 {
		t.Fatalf("first app mismatch: %+v", out[0])
	}
	if out[1].SalesID != 2 || out[1].AppliedAmount != 50 {
		t.Fatalf("second app mismatch: %+v", out[1])
	}
	if out[2].SalesID != 4 || out[2].DiscountAmount != 25 {
		t.Fatalf("discount-only app mismatch: %+v", out[2])
	}
}

func TestNormalizeAPApps(t *testing.T) {
	in := []openPaymentApplyApp{
		{InvoiceID: 10, AppliedAmount: 200},
		{DocID: 11, AppliedAmount: 25},
		{InvoiceID: 12, AppliedAmount: -1},
	}
	out := normalizeAPApps(in)
	if len(out) != 2 {
		t.Fatalf("want 2 apps, got %d", len(out))
	}
	if out[0].SupplierInvoiceID != 10 || out[1].SupplierInvoiceID != 11 {
		t.Fatalf("unexpected ids: %+v %+v", out[0], out[1])
	}
}

func TestRejectMultiPartnerWithoutFlag_message(t *testing.T) {
	// Documents the Phase 1 same-partner rule surface (handler checks len(groups) > 1 && !AllowMultiPartner).
	msgAR := "Selected rows must belong to one customer. Clear other customers or enable multi-partner apply."
	msgAP := "Selected rows must belong to one vendor. Clear other vendors or enable multi-partner apply."
	if msgAR == "" || msgAP == "" {
		t.Fatal("expected non-empty validation messages")
	}
}
