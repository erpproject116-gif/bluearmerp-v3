package goodsreceipt

import "testing"

func TestNormalizeLotNo(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"  LOT001  ", "LOT001"},
		{"", ""},
		{"LOT-2026", "LOT-2026"},
	}
	for _, tc := range tests {
		if got := normalizeLotNo(tc.in); got != tc.want {
			t.Errorf("normalizeLotNo(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestMaxLotBatchSize(t *testing.T) {
	if maxLotBatchSize != 100 {
		t.Fatalf("expected batch cap 100, got %d", maxLotBatchSize)
	}
}

func TestAutoLotNo(t *testing.T) {
	got := autoLotNo("PORK", 1)
	if got == "" {
		t.Fatal("autoLotNo returned empty string")
	}
	if len(got) < 10 {
		t.Fatalf("autoLotNo too short: %q", got)
	}
}

func TestDefaultExpiry(t *testing.T) {
	if defaultExpiry(nil) != nil {
		t.Fatal("expected nil for nil shelf days")
	}
	zero := 0
	if defaultExpiry(&zero) != nil {
		t.Fatal("expected nil for zero shelf days")
	}
	days := 7
	got := defaultExpiry(&days)
	if got == nil {
		t.Fatal("expected expiry date")
	}
}
