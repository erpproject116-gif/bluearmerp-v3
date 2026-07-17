package inventory

import "testing"

func TestSerialStatusBlocksPositiveAdjustment(t *testing.T) {
	tests := []struct {
		status string
		want   bool
	}{
		{"sold", true},
		{"reserved", true},
		{"in_stock", false},
		{"void", false},
		{"scrapped", false},
	}
	for _, tc := range tests {
		if got := serialStatusBlocksPositiveAdjustment(tc.status); got != tc.want {
			t.Errorf("serialStatusBlocksPositiveAdjustment(%q) = %v, want %v", tc.status, got, tc.want)
		}
	}
}
