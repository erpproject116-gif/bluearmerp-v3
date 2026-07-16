package hr

import "testing"

func TestAbsenceDeductionFormula(t *testing.T) {
	// 22,000 / 22 = 1,000 per day; 2 absent days → 2,000
	daily := 22000.0 / workingDaysPerMonth
	got := roundMoney(daily * 2)
	if got != 2000 {
		t.Fatalf("want 2000 got %.2f", got)
	}
}

func TestSplitPersonName(t *testing.T) {
	last, first, mid := splitPersonName("Juan dela Cruz")
	if first != "Juan" || last != "Cruz" || mid != "dela" {
		t.Fatalf("got first=%s mid=%s last=%s", first, mid, last)
	}
}
