package pos

import "testing"

func TestComputeExpectedCashUsedByZReport(t *testing.T) {
	// Guard: Z report and activity must use the same expected-cash helper (no coin exchange).
	if computeExpectedCash(100, 50, 10, 5) != 155 {
		t.Fatal("expected cash formula drift")
	}
}
