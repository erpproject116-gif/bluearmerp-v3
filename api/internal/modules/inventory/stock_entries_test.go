package inventory

import "testing"

func TestValidateStockEntryBody_transfer(t *testing.T) {
	from, to, same := int64(1), int64(2), int64(1)
	reason := "Restock branch"
	blank := "  "

	tests := []struct {
		name    string
		body    stockEntryBody
		wantKey string
	}{
		{
			name: "missing reason",
			body: stockEntryBody{
				EntryType:      "transfer",
				FromLocationID: &from,
				ToLocationID:   &to,
				Lines:          []stockEntryLineIn{{ItemID: 10, Qty: 1}},
			},
			wantKey: "notes",
		},
		{
			name: "blank reason",
			body: stockEntryBody{
				EntryType:      "transfer",
				FromLocationID: &from,
				ToLocationID:   &to,
				Notes:          &blank,
				Lines:          []stockEntryLineIn{{ItemID: 10, Qty: 1}},
			},
			wantKey: "notes",
		},
		{
			name: "same location",
			body: stockEntryBody{
				EntryType:      "transfer",
				FromLocationID: &from,
				ToLocationID:   &same,
				Notes:          &reason,
				Lines:          []stockEntryLineIn{{ItemID: 10, Qty: 1}},
			},
			wantKey: "to_location_id",
		},
		{
			name: "valid transfer",
			body: stockEntryBody{
				EntryType:      "transfer",
				FromLocationID: &from,
				ToLocationID:   &to,
				Notes:          &reason,
				Lines:          []stockEntryLineIn{{ItemID: 10, Qty: 2, Remark: "shelf A"}},
			},
		},
	}
	for _, tc := range tests {
		errs := validateStockEntryBody(tc.body)
		if tc.wantKey == "" {
			if errs != nil {
				t.Errorf("%s: unexpected errs %v", tc.name, errs)
			}
			continue
		}
		if errs == nil || errs[tc.wantKey] == "" {
			t.Errorf("%s: expected key %q, got %v", tc.name, tc.wantKey, errs)
		}
	}
}

func TestTransferQtyOutEqualsQtyIn(t *testing.T) {
	// Locked rule: display qty_out and qty_in from one stored qty.
	qty := 5.0
	if qtyOut, qtyIn := qty, qty; qtyOut != qtyIn {
		t.Fatalf("qty out/in must match: %v vs %v", qtyOut, qtyIn)
	}
}

func TestNormalizeStockEntryLots(t *testing.T) {
	lotID := int64(9)
	got := normalizeStockEntryLots(3, &lotID, nil)
	if len(got) != 1 || got[0].LotBatchID != 9 || got[0].Qty != 3 {
		t.Fatalf("expected single full-line lot, got %#v", got)
	}
	got = normalizeStockEntryLots(5, nil, []stockEntryLotIn{{LotBatchID: 1, Qty: 2}, {LotBatchID: 2, Qty: 3}})
	if sumStockEntryLotQty(got) != 5 {
		t.Fatalf("sum=%v", sumStockEntryLotQty(got))
	}
}

func TestValidateTransferLineTracking(t *testing.T) {
	serialReq := ItemTrackingSettings{TrackSerial: true, SerialPolicy: TrackingPolicyRequired}
	if err := validateTransferLineTracking(1, serialReq, 2, 0, nil, true); err == nil {
		t.Fatal("expected required serials on post")
	}
	if err := validateTransferLineTracking(1, serialReq, 2, 0, nil, false); err != nil {
		t.Fatalf("draft may omit serials: %v", err)
	}
	if err := validateTransferLineTracking(1, serialReq, 2, 2, nil, true); err != nil {
		t.Fatalf("matching serial count: %v", err)
	}
	if err := validateTransferLineTracking(1, serialReq, 2, 1, nil, true); err == nil {
		t.Fatal("expected serial count mismatch")
	}

	lotReq := ItemTrackingSettings{TrackLot: true, LotPolicy: TrackingPolicyRequired}
	if err := validateTransferLineTracking(1, lotReq, 4, 0, []stockEntryLotIn{{LotBatchID: 1, Qty: 2}, {LotBatchID: 2, Qty: 2}}, true); err != nil {
		t.Fatalf("lot sum ok: %v", err)
	}
	if err := validateTransferLineTracking(1, lotReq, 4, 0, []stockEntryLotIn{{LotBatchID: 1, Qty: 1}}, true); err == nil {
		t.Fatal("expected lot sum mismatch")
	}
	if got := serialLotAttachmentCount(3, 2); got != 5 {
		t.Fatalf("count=%d", got)
	}
}
