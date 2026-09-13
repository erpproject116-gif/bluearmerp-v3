package manufacturing

import (
	"math"
	"testing"
)

func TestManufacturingCompleteCostAndJournalPreview(t *testing.T) {
	costs, err := normalizeManufacturingCosts(120, 30, 20, 5)
	if err != nil {
		t.Fatal(err)
	}
	if costs.Total != 175 {
		t.Fatalf("total=%v want 175", costs.Total)
	}
	lines := manufacturingJournalPreview(costs)
	if len(lines) != 3 {
		t.Fatalf("lines=%d want 3", len(lines))
	}
	var debit, credit float64
	for _, line := range lines {
		debit += line.Debit
		credit += line.Credit
	}
	if math.Abs(debit-credit) > 0.0001 {
		t.Fatalf("journal is not balanced: debit=%v credit=%v", debit, credit)
	}
	if lines[0].Label != "Finished goods inventory" || lines[0].Debit != 175 {
		t.Fatalf("unexpected finished-goods line: %+v", lines[0])
	}
}

func TestManufacturingCompleteRejectsInvalidCosts(t *testing.T) {
	if _, err := normalizeManufacturingCosts(10, -1, 0, 0); err == nil {
		t.Fatal("negative labor cost should be rejected")
	}
	if _, err := normalizeManufacturingCosts(math.NaN(), 0, 0, 0); err == nil {
		t.Fatal("NaN material cost should be rejected")
	}
}

func TestCanReverseCompletedWorkOrder(t *testing.T) {
	if ok, reason := CanReverseWorkOrder(WOStatusCompleted, false); !ok || reason != "" {
		t.Fatalf("completed unreversed work order should reverse: %q", reason)
	}
	if ok, _ := CanReverseWorkOrder(WOStatusReleased, false); ok {
		t.Fatal("released work order must not reverse")
	}
	if ok, _ := CanReverseWorkOrder(WOStatusCompleted, true); ok {
		t.Fatal("second reversal must be blocked")
	}
}
