package inventory

import "testing"

func TestSerialAdjRequiresApproval(t *testing.T) {
	neg := []serialAdjustmentLine{{SerialUnitID: 1, QtyDelta: -1}}
	pos := []serialAdjustmentLine{{SerialUnitID: 1, QtyDelta: 1}}
	manyNeg := make([]serialAdjustmentLine, 5)
	for i := range manyNeg {
		manyNeg[i] = serialAdjustmentLine{SerialUnitID: int64(i + 1), QtyDelta: -1}
	}

	if serialAdjRequiresApproval(false, pos) {
		t.Fatal("policy off must never require approval")
	}
	if serialAdjRequiresApproval(true, neg) {
		t.Fatal("single negative under threshold must post now")
	}
	if !serialAdjRequiresApproval(true, pos) {
		t.Fatal("any positive delta must require approval when policy on")
	}
	if !serialAdjRequiresApproval(true, manyNeg) {
		t.Fatal("5+ lines must require approval when policy on")
	}
}
