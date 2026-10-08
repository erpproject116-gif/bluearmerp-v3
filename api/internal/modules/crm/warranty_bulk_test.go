package crm

import "testing"

func TestWarrantyBulkError(t *testing.T) {
	if warrantyBulkError(nil, nil) == nil {
		t.Fatal("empty patch should be rejected")
	}
	end := "2026-12-31"
	if warrantyBulkError(&end, nil) != nil {
		t.Fatal("end date alone is allowed")
	}
	status := "active"
	if warrantyBulkError(nil, &status) != nil {
		t.Fatal("status alone is allowed")
	}
	bad := "nope"
	if warrantyBulkError(nil, &bad) == nil {
		t.Fatal("bad status should be rejected")
	}
}
