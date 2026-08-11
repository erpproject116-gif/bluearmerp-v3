package finance

import (
	"strings"
	"testing"
)

func TestComputeSaleOutstanding_mixedApplications(t *testing.T) {
	cases := []struct {
		name                          string
		grand, receipts, credits, ret float64
		want                          float64
	}{
		{"or_only", 1000, 400, 0, 0, 600},
		{"credit_only", 1000, 0, 250, 0, 750},
		{"retainer_only", 1000, 0, 0, 100, 900},
		{"mixed", 1000, 300, 200, 100, 400},
		{"fully_covered", 500, 200, 200, 100, 0},
		{"over_applied_negative", 100, 80, 30, 0, -10},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := computeSaleOutstanding(tc.grand, tc.receipts, tc.credits, tc.ret)
			if got != tc.want {
				t.Fatalf("got %v want %v", got, tc.want)
			}
		})
	}
}

func TestComputeSupplierInvoiceOutstanding(t *testing.T) {
	cases := []struct {
		name                     string
		grand, payments, credits float64
		want                     float64
	}{
		{"pv_only", 1000, 400, 0, 600},
		{"credit_only", 1000, 0, 250, 750},
		{"mixed", 1000, 300, 200, 500},
		{"fully_covered", 500, 200, 300, 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := computeSupplierInvoiceOutstanding(tc.grand, tc.payments, tc.credits)
			if got != tc.want {
				t.Fatalf("got %v want %v", got, tc.want)
			}
		})
	}
}

func TestSaleAppliedLateralSQL_includesCreditAndRetainer(t *testing.T) {
	sql := saleAppliedLateralSQL("s")
	if !strings.Contains(sql, "fin_receipt_applications") {
		t.Fatal("expected OR applications in lateral")
	}
	if !strings.Contains(sql, "fin_credit_note_applications") {
		t.Fatal("expected credit note applications in lateral")
	}
	if !strings.Contains(sql, "fin_retainer_applications") {
		t.Fatal("expected retainer applications in lateral")
	}
}

func TestSupplierInvoiceAppliedLateralSQL_includesVendorCredits(t *testing.T) {
	sql := supplierInvoiceAppliedLateralSQLAsOf("si", "")
	if !strings.Contains(sql, "fin_payment_applications") {
		t.Fatal("expected payment applications in lateral")
	}
	if !strings.Contains(sql, "fin_vendor_credit_applications") {
		t.Fatal("expected vendor credit applications in lateral")
	}
}
