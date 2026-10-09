package sales

import (
	"testing"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/inventory"
)

func TestValidateLotBatchForSaleLine(t *testing.T) {
	item := func(v int64) *int64 { return &v }

	tests := []struct {
		name       string
		lineItemID *int64
		saleLoc    int64
		lotItemID  int64
		lotLoc     int64
		wantErr    bool
	}{
		{"matching item and location", item(10), 5, 10, 5, false},
		{"wrong item", item(10), 5, 11, 5, true},
		{"line without item", nil, 5, 10, 5, true},
		{"wrong location", item(10), 5, 10, 6, true},
		{"sale without location skips location check", item(10), 0, 10, 6, false},
	}
	for _, tc := range tests {
		err := validateLotBatchForSaleLine(1, tc.lineItemID, tc.saleLoc, tc.lotItemID, tc.lotLoc)
		if (err != nil) != tc.wantErr {
			t.Errorf("%s: got err=%v, wantErr=%v", tc.name, err, tc.wantErr)
		}
	}
}

func TestSaleInvoiceAllowsBlankLot(t *testing.T) {
	if !saleInvoiceAllowsBlankLot(nil) {
		t.Fatal("nil lot")
	}
	zero := int64(0)
	if !saleInvoiceAllowsBlankLot(&zero) {
		t.Fatal("zero lot")
	}
	chosen := int64(4)
	if saleInvoiceAllowsBlankLot(&chosen) {
		t.Fatal("a chosen lot is not blank")
	}
	if err := inventory.ValidateLotBatchCapture(1, inventory.TrackingPolicyRequired, nil); err == nil {
		t.Fatal("checkout still requires a lot")
	}
}

func TestSaleAutoMethod(t *testing.T) {
	if saleAutoMethod("manual") != inventory.LotAllocationFIFO {
		t.Fatal("manual")
	}
	if saleAutoMethod("fifo") != inventory.LotAllocationFIFO {
		t.Fatal("fifo")
	}
	if saleAutoMethod("fefo") != inventory.LotAllocationFEFO {
		t.Fatal("fefo")
	}
	if saleAutoMethod(inventory.ResolveLotAllocationMethod("manual", "fefo")) != inventory.LotAllocationFEFO {
		t.Fatal("item manual with tenant fefo stays fefo")
	}
}

func TestSalePostsQty(t *testing.T) {
	tests := []struct {
		name                        string
		trackInventory, lot, serial bool
		want                        bool
	}{
		{"quantity flag", true, false, false, true},
		{"lot only", false, true, false, true},
		{"serial only", false, false, true, true},
		{"none", false, false, false, false},
	}
	for _, tc := range tests {
		if got := salePostsQty(tc.trackInventory, tc.lot, tc.serial); got != tc.want {
			t.Errorf("%s: got %v, want %v", tc.name, got, tc.want)
		}
	}
}

func TestSaleLineShouldDeduct(t *testing.T) {
	tests := []struct {
		name                          string
		postsQty, salesMov, soRelease bool
		want                          bool
	}{
		{"direct or SO with no prior issue", true, false, false, true},
		{"SO already released", true, false, true, false},
		{"second apply", true, true, false, false},
		{"untracked item", false, false, false, false},
	}
	for _, tc := range tests {
		if got := saleLineShouldDeduct(tc.postsQty, tc.salesMov, tc.soRelease); got != tc.want {
			t.Errorf("%s: got %v, want %v", tc.name, got, tc.want)
		}
	}
}
