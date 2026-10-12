package hr

import "testing"

func TestMayIncludePenaltyInPay(t *testing.T) {
	if mayIncludePenaltyInPay(true, 500, 9) != true {
		t.Fatal("authority, amount, and pay item should include the penalty")
	}
	if mayIncludePenaltyInPay(false, 500, 9) {
		t.Fatal("penalty without authority must not change pay")
	}
	if mayIncludePenaltyInPay(true, 0, 9) {
		t.Fatal("zero penalty must not change pay")
	}
	if mayIncludePenaltyInPay(true, 500, 0) {
		t.Fatal("penalty without a pay item must not change pay")
	}
}
