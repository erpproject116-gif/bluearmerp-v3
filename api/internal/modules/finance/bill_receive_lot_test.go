package finance

import "testing"

func TestPurchaseReceiveLotsOneNumber(t *testing.T) {
	got := purchaseReceiveLots(true, 4, nil, "LOT-20261009-000001")
	if len(got) != 1 || got[0].LotNo != "LOT-20261009-000001" || got[0].Qty != 4 {
		t.Fatalf("generated lot: %+v", got)
	}
	kept := purchaseReceiveLots(true, 4, []billLotLine{{LotNo: "VENDOR-1", Qty: 4}}, "LOT-20261009-000001")
	if len(kept) != 1 || kept[0].LotNo != "VENDOR-1" {
		t.Fatalf("typed lot: %+v", kept)
	}
	if err := validateTrackingCapture(false, "required", true, "required", 4, nil, got); err != nil {
		t.Fatal(err)
	}
	if err := validateTrackingCapture(false, "required", true, "required", 4, nil, []billLotLine{{LotNo: "A", Qty: 1}}); err == nil {
		t.Fatal("partial lot list")
	}
	if err := validateTrackingCapture(false, "required", true, "required", 4, nil, []billLotLine{{LotNo: " ", Qty: 4}}); err == nil {
		t.Fatal("blank lot number")
	}
}
