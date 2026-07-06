package audit

import "testing"

func TestIsCriticalActionCode(t *testing.T) {
	critical := []string{
		"finance.receipt.create",
		"inventory.stock_adjustment",
		"user.update",
		"role.permissions.update",
		"group.permissions.update",
		"crm.job.evaluate",
		"sales.price_batch",
		"sales.create",
		"sales_order.update",
		"quotation.update",
	}
	for _, code := range critical {
		if !IsCriticalActionCode(code) {
			t.Fatalf("expected critical: %s", code)
		}
	}
	async := []string{
		"inventory.item.create",
		"crm.task.create",
	}
	for _, code := range async {
		if IsCriticalActionCode(code) {
			t.Fatalf("expected async: %s", code)
		}
	}
}
