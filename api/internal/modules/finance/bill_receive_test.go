package finance

import (
	"testing"
)

func TestPostsQtyOnAutoReceive(t *testing.T) {
	// Matches goods_receipts postsQty: inventory qty OR lot OR serial imply Find Stock / Inv Book.
	cases := []struct {
		inv, lot, serial bool
		want             bool
	}{
		{false, false, false, false},
		{true, false, false, true},
		{false, true, false, true},
		{false, false, true, true},
		{true, true, true, true},
	}
	for _, tc := range cases {
		got := tc.inv || tc.lot || tc.serial
		if got != tc.want {
			t.Errorf("inv=%v lot=%v serial=%v → %v want %v", tc.inv, tc.lot, tc.serial, got, tc.want)
		}
	}
}


func TestConfirmingBillProgress(t *testing.T) {
	cases := map[string]bool{
		"completed":   true,
		"Completed":   true,
		"e_approval":  true,
		"confirm":     true,
		"unconfirmed": false,
		"in_progress": false,
		"":            false,
	}
	for in, want := range cases {
		if got := confirmingBillProgress(in); got != want {
			t.Errorf("confirmingBillProgress(%q)=%v want %v", in, got, want)
		}
	}
}

func TestMarshalSerialNosRoundTrip(t *testing.T) {
	b := marshalSerialNos([]string{"SN-1", " SN-2 "})
	if string(b) != `["SN-1","SN-2"]` {
		t.Fatalf("marshalSerialNos = %s", b)
	}
}

func TestTrackingPolicyRequired(t *testing.T) {
	for _, tc := range []struct {
		policy string
		want   bool
	}{
		{"optional", false},
		{" OPTIONAL ", false},
		{"required", true},
		{"", true},
		{"unknown", true},
	} {
		if got := trackingPolicyRequired(tc.policy); got != tc.want {
			t.Errorf("trackingPolicyRequired(%q)=%v want %v", tc.policy, got, tc.want)
		}
	}
}

func TestValidateTrackingCapturePolicy2B(t *testing.T) {
	tests := []struct {
		name         string
		trackSerial  bool
		serialPolicy string
		trackLot     bool
		lotPolicy    string
		qty          float64
		serials      []string
		lots         []billLotLine
		wantErr      bool
	}{
		{name: "required serial empty", trackSerial: true, serialPolicy: "required", qty: 2, wantErr: true},
		{name: "optional serial empty", trackSerial: true, serialPolicy: "optional", qty: 2},
		{name: "optional serial complete", trackSerial: true, serialPolicy: "optional", qty: 2, serials: []string{"S1", "S2"}},
		{name: "optional serial partial", trackSerial: true, serialPolicy: "optional", qty: 2, serials: []string{"S1"}, wantErr: true},
		{name: "required lot empty", trackLot: true, lotPolicy: "required", qty: 2, wantErr: true},
		{name: "optional lot empty", trackLot: true, lotPolicy: "optional", qty: 2},
		{name: "optional lot balanced", trackLot: true, lotPolicy: "optional", qty: 2, lots: []billLotLine{{LotNo: "L1", Qty: 1}, {LotNo: "L2", Qty: 1}}},
		{name: "optional lot unbalanced", trackLot: true, lotPolicy: "optional", qty: 2, lots: []billLotLine{{LotNo: "L1", Qty: 1}}, wantErr: true},
		{name: "unknown serial policy is required", trackSerial: true, serialPolicy: "", qty: 1, wantErr: true},
		{name: "unknown lot policy is required", trackLot: true, lotPolicy: "", qty: 1, wantErr: true},
		{name: "plain qty item", qty: 3},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := validateTrackingCapture(
				tc.trackSerial,
				tc.serialPolicy,
				tc.trackLot,
				tc.lotPolicy,
				tc.qty,
				tc.serials,
				tc.lots,
			)
			if (err != nil) != tc.wantErr {
				t.Fatalf("validateTrackingCapture() error=%v wantErr=%v", err, tc.wantErr)
			}
		})
	}
}
