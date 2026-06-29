package goodsreceipt

import "testing"

func TestNormalizeSerialNo(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"  SN001  ", "SN001"},
		{"SN002\r\n", "SN002"},
		{"\tSN003\n", "SN003"},
		{"", ""},
	}
	for _, tc := range tests {
		if got := normalizeSerialNo(tc.in); got != tc.want {
			t.Errorf("normalizeSerialNo(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestMaxSerialBatchSize(t *testing.T) {
	if maxSerialBatchSize != 100 {
		t.Fatalf("expected batch cap 100, got %d", maxSerialBatchSize)
	}
}

// Integration tests for processSerialScans require DATABASE_URL and migration 050 applied.
// Run manually: go test ./internal/modules/goodsreceipt/ -run Integration -tags=integration
