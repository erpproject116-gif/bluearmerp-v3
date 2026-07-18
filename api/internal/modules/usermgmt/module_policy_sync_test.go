package usermgmt

import (
	"testing"
)

func TestPolicyFieldsToRelax(t *testing.T) {
	q := policyFieldsToRelax("quotation")
	if len(q) != 1 || q[0].Field != "sales_require_quotation" || q[0].Value {
		t.Fatalf("quotation: %+v", q)
	}
	so := policyFieldsToRelax("sales_order")
	if len(so) != 3 {
		t.Fatalf("sales_order want 3 fields, got %d", len(so))
	}
	pr := policyFieldsToRelax("purchase_request")
	if len(pr) != 2 {
		t.Fatalf("purchase_request want 2 fields, got %d", len(pr))
	}
	if policyFieldsToRelax("inventory") != nil {
		t.Fatal("inventory should not auto-relax policies")
	}
}

func TestBuildPolicyPatchFromDisabled(t *testing.T) {
	next := map[string]bool{
		"quotation":   false,
		"sales_order": false,
		"sales":       true,
	}
	patch, deltas, msgs := buildPolicyPatchFromDisabled(next)
	if patch.SalesRequireQuotation == nil || *patch.SalesRequireQuotation {
		t.Fatal("expected sales_require_quotation false")
	}
	if patch.SalesRequireSO == nil || *patch.SalesRequireSO {
		t.Fatal("expected sales_require_so false")
	}
	if len(deltas) < 4 {
		t.Fatalf("expected multiple deltas, got %d", len(deltas))
	}
	if len(msgs) == 0 {
		t.Fatal("expected messages")
	}
}

func TestBuildPolicyPatchReEnableLeavesPolicies(t *testing.T) {
	// All on — no relaxations
	next := map[string]bool{"quotation": true, "sales_order": true}
	patch, deltas, _ := buildPolicyPatchFromDisabled(next)
	if patchHasAny(patch) || len(deltas) != 0 {
		t.Fatalf("re-enable should not patch policies: patch=%+v deltas=%v", patch, deltas)
	}
}

func TestSimpleStorePreset(t *testing.T) {
	mods, patch, msgs := applyPresetModules("simple_store")
	if mods["quotation"] || mods["sales_order"] || mods["purchase_request"] {
		t.Fatalf("simple_store should hide quote/SO/PR: %+v", mods)
	}
	if !mods["sales"] || !mods["pos"] {
		t.Fatalf("simple_store should keep sales+pos: %+v", mods)
	}
	if patch.PurchaseRequireGRBeforeSupplierInv == nil || *patch.PurchaseRequireGRBeforeSupplierInv {
		t.Fatal("simple_store should turn off GR-before-invoice")
	}
	if len(msgs) == 0 {
		t.Fatal("expected preset messages")
	}
}

func TestFullProcessPreset(t *testing.T) {
	mods, patch, _ := applyPresetModules("full_process")
	if !mods["quotation"] || !mods["sales_order"] || !mods["purchase_request"] {
		t.Fatalf("full_process should enable quote/SO/PR: %+v", mods)
	}
	if patch.SalesRequireSO == nil || !*patch.SalesRequireSO {
		t.Fatal("full_process should require SO")
	}
}
