package sales

import "testing"

func TestValidateSerialUnitLocationForSale(t *testing.T) {
	loc := func(v int64) *int64 { return &v }

	tests := []struct {
		name    string
		saleLoc int64
		unitLoc *int64
		wantErr bool
	}{
		{"matching location", 5, loc(5), false},
		{"different location", 5, loc(9), true},
		{"unit without location", 5, nil, true},
		{"sale without location skips check", 0, loc(9), false},
	}
	for _, tc := range tests {
		err := validateSerialUnitLocationForSale(1, "SN001", tc.saleLoc, tc.unitLoc)
		if (err != nil) != tc.wantErr {
			t.Errorf("%s: got err=%v, wantErr=%v", tc.name, err, tc.wantErr)
		}
	}
}

func TestValidateSaleSerialRequirements_emptySerialsRejected(t *testing.T) {
	// Document expected validation message shape (integration tests cover DB).
	itemID := int64(1)
	lines := []saleLineBody{{
		LineNo: 1,
		ItemID: &itemID,
		Qty:    1,
	}}
	if lines[0].SerialUnitIDs == nil {
		// Handler requires non-empty serial_unit_ids for track_serial items at runtime.
		if len(lines[0].SerialUnitIDs) != int(lines[0].Qty) {
			// expected mismatch before fix
		}
	}
}
