package finance

import (
	"testing"
)

func TestNormalizeSerialNos(t *testing.T) {
	got := normalizeSerialNos([]string{" A1 ", "a1", "", "B2", "b2"})
	if len(got) != 2 || got[0] != "A1" || got[1] != "B2" {
		t.Fatalf("normalizeSerialNos = %#v", got)
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
