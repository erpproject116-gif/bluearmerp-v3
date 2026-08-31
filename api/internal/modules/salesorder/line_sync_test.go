package salesorder

import (
	"testing"
)

func TestPlanSalesOrderLineSync_preservesIDsByLineNo(t *testing.T) {
	existing := []existingSOLine{
		{ID: 10, LineNo: 1},
		{ID: 11, LineNo: 2},
	}
	incoming := []computedLine{
		{LineNo: 1, ItemCode: "A", Qty: 2},
		{LineNo: 2, ItemCode: "B", Qty: 3},
	}
	plan := planSalesOrderLineSync(existing, incoming)
	if len(plan.Updates) != 2 || len(plan.Inserts) != 0 || len(plan.Deletes) != 0 {
		t.Fatalf("unexpected plan: updates=%d inserts=%d deletes=%d", len(plan.Updates), len(plan.Inserts), len(plan.Deletes))
	}
	if plan.Updates[0].ID == nil || *plan.Updates[0].ID != 10 {
		t.Fatalf("line 1 id = %v want 10", plan.Updates[0].ID)
	}
	if plan.Updates[1].ID == nil || *plan.Updates[1].ID != 11 {
		t.Fatalf("line 2 id = %v want 11", plan.Updates[1].ID)
	}
}

func TestPlanSalesOrderLineSync_prefersClientID(t *testing.T) {
	existing := []existingSOLine{
		{ID: 10, LineNo: 1},
		{ID: 11, LineNo: 2},
	}
	id11 := int64(11)
	id10 := int64(10)
	// Swap line_no but keep stable ids from client.
	incoming := []computedLine{
		{ID: &id11, LineNo: 1, ItemCode: "B"},
		{ID: &id10, LineNo: 2, ItemCode: "A"},
	}
	plan := planSalesOrderLineSync(existing, incoming)
	if len(plan.Updates) != 2 || len(plan.Deletes) != 0 {
		t.Fatalf("unexpected plan: %+v", plan)
	}
	if *plan.Updates[0].ID != 11 || plan.Updates[0].LineNo != 1 {
		t.Fatalf("first update = id %v line %d", plan.Updates[0].ID, plan.Updates[0].LineNo)
	}
	if *plan.Updates[1].ID != 10 || plan.Updates[1].LineNo != 2 {
		t.Fatalf("second update = id %v line %d", plan.Updates[1].ID, plan.Updates[1].LineNo)
	}
}

func TestPlanSalesOrderLineSync_insertAndDelete(t *testing.T) {
	existing := []existingSOLine{
		{ID: 10, LineNo: 1},
		{ID: 11, LineNo: 2},
	}
	id10 := int64(10)
	incoming := []computedLine{
		{ID: &id10, LineNo: 1, ItemCode: "A"},
		{LineNo: 3, ItemCode: "C"}, // no leftover row at line_no 3 → insert; id 11 removed
	}
	plan := planSalesOrderLineSync(existing, incoming)
	if len(plan.Updates) != 1 || len(plan.Inserts) != 1 || len(plan.Deletes) != 1 {
		t.Fatalf("unexpected plan: updates=%d inserts=%d deletes=%v", len(plan.Updates), len(plan.Inserts), plan.Deletes)
	}
	if plan.Deletes[0] != 11 {
		t.Fatalf("delete = %d want 11", plan.Deletes[0])
	}
	if plan.Inserts[0].ItemCode != "C" || plan.Inserts[0].ID != nil {
		t.Fatalf("insert = %+v", plan.Inserts[0])
	}
}

func TestPlanSalesOrderLineSync_lineNoReuseUpdatesInPlace(t *testing.T) {
	existing := []existingSOLine{
		{ID: 10, LineNo: 1},
		{ID: 11, LineNo: 2},
	}
	id10 := int64(10)
	// Replacing content at line_no 2 without an id still keeps id 11 stable.
	incoming := []computedLine{
		{ID: &id10, LineNo: 1, ItemCode: "A"},
		{LineNo: 2, ItemCode: "C"},
	}
	plan := planSalesOrderLineSync(existing, incoming)
	if len(plan.Updates) != 2 || len(plan.Inserts) != 0 || len(plan.Deletes) != 0 {
		t.Fatalf("unexpected plan: updates=%d inserts=%d deletes=%v", len(plan.Updates), len(plan.Inserts), plan.Deletes)
	}
	if plan.Updates[1].ID == nil || *plan.Updates[1].ID != 11 || plan.Updates[1].ItemCode != "C" {
		t.Fatalf("line 2 update = %+v", plan.Updates[1])
	}
}
