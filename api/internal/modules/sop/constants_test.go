package sop

import "testing"

func TestStaleReviewDays(t *testing.T) {
	if staleReviewDays != 180 {
		t.Fatalf("staleReviewDays=%d want 180", staleReviewDays)
	}
}

func TestMaxBody(t *testing.T) {
	if maxSOPBodyBytes != 200*1024 {
		t.Fatalf("max body %d", maxSOPBodyBytes)
	}
}
