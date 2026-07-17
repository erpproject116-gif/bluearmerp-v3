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

func TestReversalBlockingSerialStatuses(t *testing.T) {
	want := map[string]bool{"sold": true, "reserved": true}
	if len(reversalBlockingSerialStatuses) != len(want) {
		t.Fatalf("expected %d blocking statuses, got %v", len(want), reversalBlockingSerialStatuses)
	}
	for _, st := range reversalBlockingSerialStatuses {
		if !want[st] {
			t.Errorf("unexpected blocking status %q", st)
		}
	}
}

// Integration tests for processSerialScans require DATABASE_URL and migration 050 applied.
// Run manually: go test ./internal/modules/goodsreceipt/ -run Integration -tags=integration
