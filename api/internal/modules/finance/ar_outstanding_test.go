package finance

import "testing"

func TestComputeSaleOutstanding_mixedApplications(t *testing.T) {
	cases := []struct {
		name                         string
		grand, receipts, credits, ret float64
		want                         float64
	}{
		{"or_only", 1000, 400, 0, 0, 600},
		{"credit_only", 1000, 0, 250, 0, 750},
		{"retainer_only", 1000, 0, 0, 100, 900},
		{"mixed", 1000, 300, 200, 100, 400},
		{"fully_covered", 500, 200, 200, 100, 0},
		{"over_applied_negative", 100, 80, 30, 0, -10},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := computeSaleOutstanding(tc.grand, tc.receipts, tc.credits, tc.ret)
			if got != tc.want {
				t.Fatalf("got %v want %v", got, tc.want)
			}
		})
	}
}
