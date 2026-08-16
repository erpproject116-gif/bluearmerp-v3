package approval

import "testing"

func TestApproverPermissionForEntity(t *testing.T) {
	cases := []struct {
		entity string
		want   string
	}{
		{"purchase_request", "purchase_request.approve"},
		{"pr_purchase_request", "purchase_request.approve"},
		{"journal_entry", "finance.journal_entries"},
		{"inv_serial_adjustment_request", "inventory.serial_adjustment_approve"},
		{"inv_stock_adjustment_request", "inventory.stock_adjustment_approve"},
		{"unknown_thing", "purchase_request.approve"},
	}
	for _, tc := range cases {
		if got := ApproverPermissionForEntity(tc.entity); got != tc.want {
			t.Fatalf("%s: got %q want %q", tc.entity, got, tc.want)
		}
	}
}
