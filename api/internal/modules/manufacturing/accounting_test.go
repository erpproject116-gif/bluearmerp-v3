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

func TestBuildCostPostingLinesUsesSelectedAccounts(t *testing.T) {
	costs, err := normalizeManufacturingCosts(120, 30, 20, 5)
	if err != nil {
		t.Fatal(err)
	}
	accts := costPostingAccounts{Debit: 11, CreditMaterial: 22, CreditConversion: 33}
	lines := buildCostPostingLines(costs, accts)
	if len(lines) != 3 {
		t.Fatalf("lines=%d want 3", len(lines))
	}
	if lines[0].AccountID != 11 || lines[0].Debit != 175 || lines[0].Credit != 0 {
		t.Fatalf("unexpected debit line: %+v", lines[0])
	}
	if lines[1].AccountID != 22 || lines[1].Credit != 120 {
		t.Fatalf("unexpected material line: %+v", lines[1])
	}
	if lines[2].AccountID != 33 || lines[2].Credit != 55 {
		t.Fatalf("unexpected conversion line: %+v", lines[2])
	}
	var debit, credit float64
	for _, line := range lines {
		debit += line.Debit
		credit += line.Credit
	}
	if math.Abs(debit-credit) > 0.0001 {
		t.Fatalf("journal is not balanced: debit=%v credit=%v", debit, credit)
	}

	materialOnly, _ := normalizeManufacturingCosts(50, 0, 0, 0)
	lines = buildCostPostingLines(materialOnly, costPostingAccounts{Debit: 11, CreditMaterial: 22})
	if len(lines) != 2 {
		t.Fatalf("material-only job should have 2 lines, got %d", len(lines))
	}
	for _, line := range lines {
		if line.AccountID == 0 {
			t.Fatalf("line without account: %+v", line)
		}
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
