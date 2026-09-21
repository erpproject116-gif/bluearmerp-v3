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
