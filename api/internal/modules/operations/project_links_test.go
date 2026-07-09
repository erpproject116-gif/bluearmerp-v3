package operations

import (
	"fmt"
	"testing"
)

func TestInventoryProjectErrorMessage(t *testing.T) {
	msg := inventoryProjectErrorMessage(nil)
	if msg != "Failed to create inventory project." {
		t.Fatalf("unexpected default: %q", msg)
	}
	dup := inventoryProjectErrorMessage(fmt.Errorf(`duplicate key value violates unique constraint "inv_projects_tenant_id_project_code_key"`))
	if dup == "" || dup == msg {
		t.Fatalf("expected duplicate-specific message, got %q", dup)
	}
}
