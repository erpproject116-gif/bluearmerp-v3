package inventory

import "testing"

func TestValidateStockAdjustmentBody(t *testing.T) {
	errs := validateStockAdjustmentBody(stockAdjustmentBody{})
	if errs["item_id"] == "" || errs["location_id"] == "" || errs["qty_delta"] == "" || errs["reason"] == "" {
		t.Fatalf("expected all field errors, got %#v", errs)
	}
	errs = validateStockAdjustmentBody(stockAdjustmentBody{
		ItemID: 1, LocationID: 2, QtyDelta: 1, Reason: "count",
	})
	if len(errs) != 0 {
		t.Fatalf("expected no errors, got %#v", errs)
	}
}

func TestStockAdjRequiresApprovalPolicyFlag(t *testing.T) {
	// Policy on means createStockAdjustment routes to request path (behavior covered by handler);
	// keep a lightweight invariant that zero qty is always invalid regardless of policy.
	errs := validateStockAdjustmentBody(stockAdjustmentBody{
		ItemID: 1, LocationID: 1, QtyDelta: 0, Reason: "x",
	})
	if errs["qty_delta"] == "" {
		t.Fatal("zero qty must be rejected")
	}
}
