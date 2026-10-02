package inventory

import "testing"

func TestRejectCrossLocationAdjustAsTransfer(t *testing.T) {
	lines := []stockAdjustmentLineBody{
		{ItemID: 1, LocationID: 10, QtyDelta: -2},
		{ItemID: 1, LocationID: 20, QtyDelta: 2},
	}
	if errs := rejectCrossLocationAdjustAsTransfer(false, lines); errs != nil {
		t.Fatalf("expected allow when handoff off, got %v", errs)
	}
	errs := rejectCrossLocationAdjustAsTransfer(true, lines)
	if errs == nil || errs["lines"] == "" {
		t.Fatalf("expected multi-location rejection when handoff on, got %v", errs)
	}
	sameLoc := []stockAdjustmentLineBody{
		{ItemID: 1, LocationID: 10, QtyDelta: -1},
		{ItemID: 2, LocationID: 10, QtyDelta: 3},
	}
	if errs := rejectCrossLocationAdjustAsTransfer(true, sameLoc); errs != nil {
		t.Fatalf("same-location adjust should pass: %v", errs)
	}
}
