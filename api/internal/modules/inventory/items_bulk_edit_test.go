package inventory

import "testing"

func TestBulkWarrantyMonths(t *testing.T) {
	if msg := bulkWarrantyMonthsError(nil); msg != "" {
		t.Fatalf("nil: %s", msg)
	}
	zero := 0
	if msg := bulkWarrantyMonthsError(&zero); msg != "" {
		t.Fatalf("0: %s", msg)
	}
	neg := -1
	if msg := bulkWarrantyMonthsError(&neg); msg == "" {
		t.Fatal("negative should be rejected")
	}
}
