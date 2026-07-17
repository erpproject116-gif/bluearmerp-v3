package sales

import "testing"

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
