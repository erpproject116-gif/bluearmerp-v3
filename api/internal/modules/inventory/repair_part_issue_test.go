package inventory

import (
	"strings"
	"testing"
	"time"
)

func TestPlanPartIssueRepeatSaveDoesNotIssue(t *testing.T) {
	existing := map[string]float64{"k1": 2}
	line := RepairOrderLine{LineRole: "part", PartKey: "k1", Qty: 2}
	_, deltas, msg := planPartIssueDeltas(existing, []RepairOrderLine{line})
	if msg != "" {
		t.Fatal(msg)
	}
	if len(deltas) != 0 {
		t.Fatalf("repeat save issued again: %+v", deltas)
	}
}

func TestPlanPartIssueSmallerQtyReturnsDifference(t *testing.T) {
	existing := map[string]float64{"k1": 2}
	line := RepairOrderLine{LineRole: "part", PartKey: "k1", Qty: 1}
	_, deltas, msg := planPartIssueDeltas(existing, []RepairOrderLine{line})
	if msg != "" || len(deltas) != 1 || deltas[0].Issue || deltas[0].Qty != 1 {
		t.Fatalf("got %+v %q", deltas, msg)
	}
}

func TestPlanPartIssueRemovedPartReturnsAll(t *testing.T) {
	existing := map[string]float64{"k1": 2}
	_, deltas, msg := planPartIssueDeltas(existing, nil)
	if msg != "" || len(deltas) != 1 || deltas[0].Issue || deltas[0].Qty != 2 {
		t.Fatalf("got %+v %q", deltas, msg)
	}
}

func TestPlanPartIssueMissingKeyRejected(t *testing.T) {
	existing := map[string]float64{"k1": 1}
	line := RepairOrderLine{LineRole: "part", Qty: 1}
	_, _, msg := planPartIssueDeltas(existing, []RepairOrderLine{line})
	if msg != partKeyRequiredMessage {
		t.Fatalf("got %q", msg)
	}
}

func TestSerialPartQtyRejected(t *testing.T) {
	if serialPartQtyError(true, 2) == "" {
		t.Fatal("qty other than 1 should be rejected")
	}
	if serialPartQtyError(true, 1) != "" {
		t.Fatal("qty 1 should be allowed")
	}
}

func TestUnknownLotRejected(t *testing.T) {
	if unknownLotError(true, false) != "Unknown lot." {
		t.Fatal(unknownLotError(true, false))
	}
	if unknownLotError(true, true) != "" {
		t.Fatal("known lot should pass")
	}
}

func TestHybridZeroCostRejected(t *testing.T) {
	if !partIssueBlockedByCost(true, 0) {
		t.Fatal("hybrid on with purchase price 0 should block the issue")
	}
	if partIssueBlockedByCost(false, 0) {
		t.Fatal("hybrid off should still allow a zero-cost stock move")
	}
}

func TestWarrantyJournalDebits5280(t *testing.T) {
	code := warrantyJournalDebitCode()
	if code != "5280" {
		t.Fatal(code)
	}
	if code == "5010" || code == "4030" {
		t.Fatal(code)
	}
}

func TestCoveredRejectedWhenWarrantyEnded(t *testing.T) {
	serial := int64(9)
	order := time.Date(2026, 10, 8, 0, 0, 0, 0, time.UTC)
	end := order.AddDate(0, 0, -1)
	msg := coverageWarrantyError("covered", &serial, true, "active", end, order)
	if msg != coveredWarrantyMessage {
		t.Fatal(msg)
	}
	if coverageWarrantyError("goodwill", &serial, true, "expired", end, order) != "" {
		t.Fatal("goodwill should stay allowed when the warranty is expired")
	}
}

func TestConvertSerialOnlyOnOneMatch(t *testing.T) {
	if serialUnitIDFromMatches(nil) != nil {
		t.Fatal("zero matches")
	}
	if serialUnitIDFromMatches([]int64{1, 2}) != nil {
		t.Fatal("two matches")
	}
	got := serialUnitIDFromMatches([]int64{7})
	if got == nil || *got != 7 {
		t.Fatal(got)
	}
}

func TestUnitLinesStayOnStatusReportAndOffPartsTotal(t *testing.T) {
	if !statusReportKeepsUnitLines(statusReportFromClause()) {
		t.Fatal(statusReportFromClause())
	}
	where := repairPartConsumptionWhere()
	if strings.Contains(where, "ln.") {
		t.Fatal(where)
	}
	query := repairPartConsumptionSQL(where)
	if !repairPartConsumptionUsesIssues(query) {
		t.Fatal(query)
	}
	if strings.Contains(query, "inv_repair_order_lines") || strings.Contains(query, "ln.") {
		t.Fatal("parts total still reads repair order lines")
	}
}
