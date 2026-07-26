package okr

import "testing"

func TestKrProgress(t *testing.T) {
	if got := krProgress(50, 100); got != 50 {
		t.Fatalf("got %v want 50", got)
	}
	if got := krProgress(150, 100); got != 100 {
		t.Fatalf("cap at 100, got %v", got)
	}
	if got := krProgress(10, 0); got != 0 {
		t.Fatalf("zero target got %v", got)
	}
}

func TestIsAtRisk(t *testing.T) {
	// Far future date — not at risk even with low progress if >30 days
	far := Objective{Status: "active", Progress: 20, PeriodEnd: "2099-01-01"}
	if isAtRisk(far) {
		t.Fatal("far period should not be at risk")
	}
	healthy := Objective{Status: "active", Progress: 80, PeriodEnd: "2099-01-01"}
	if isAtRisk(healthy) {
		t.Fatal("high progress should not be at risk")
	}
}
