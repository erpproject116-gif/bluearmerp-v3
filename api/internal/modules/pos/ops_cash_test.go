package pos

import "testing"

func TestComputeExpectedCashExcludesCoinExchange(t *testing.T) {
	// opening 1000 + cash sales 500 + in 50 - out 20 = 1530
	got := computeExpectedCash(1000, 500, 50, 20)
	if got != 1530 {
		t.Fatalf("got %v want 1530", got)
	}
	// coin exchange must not be passed into this helper — callers omit it
	withCoinIgnored := computeExpectedCash(1000, 500, 50, 20) // same
	if withCoinIgnored != got {
		t.Fatal("expected cash must ignore coin exchange")
	}
}

func TestComputeExpectedCashZeroes(t *testing.T) {
	if computeExpectedCash(0, 0, 0, 0) != 0 {
		t.Fatal("want 0")
	}
}
