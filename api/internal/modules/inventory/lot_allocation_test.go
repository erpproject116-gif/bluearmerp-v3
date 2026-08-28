package inventory

import "testing"

func TestNormalizeLotAllocationMethod(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"manual", LotAllocationManual},
		{"fefo", LotAllocationFEFO},
		{"fifo", LotAllocationFIFO},
		{"", LotAllocationManual},
		{"unknown", LotAllocationManual},
	}
	for _, tc := range tests {
		if got := NormalizeLotAllocationMethod(tc.in); got != tc.want {
			t.Errorf("NormalizeLotAllocationMethod(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestResolveLotAllocationMethod(t *testing.T) {
	if got := ResolveLotAllocationMethod("fefo", "fifo"); got != LotAllocationFEFO {
		t.Fatalf("item fefo should win, got %q", got)
	}
	if got := ResolveLotAllocationMethod("manual", "fefo"); got != LotAllocationFEFO {
		t.Fatalf("tenant default when manual, got %q", got)
	}
}
