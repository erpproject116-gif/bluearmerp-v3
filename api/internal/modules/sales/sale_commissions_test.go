package sales

import "testing"

func TestComputeCommissionAmount(t *testing.T) {
	got := computeCommissionAmount("percent", 5, 10000)
	if got != 500 {
		t.Fatalf("5%% of 10000: want 500 got %.4f", got)
	}
	got = computeCommissionAmount("fixed", 250, 10000)
	if got != 250 {
		t.Fatalf("fixed 250: want 250 got %.4f", got)
	}
	got = computeCommissionAmount("PERCENT", 10, 1234.56)
	want := roundMoney4(123.456)
	if got != want {
		t.Fatalf("10%% of 1234.56: want %.4f got %.4f", want, got)
	}
}
