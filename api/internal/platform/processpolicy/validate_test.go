package processpolicy

import (
	"testing"
	"time"
)

func TestValidateDirectSale(t *testing.T) {
	p := Policy{SalesRequireSO: true}
	if errs := ValidateDirectSale(p, false); errs == nil {
		t.Fatal("expected error for direct sale when SO required")
	}
	if errs := ValidateDirectSale(p, true); errs != nil {
		t.Fatalf("unexpected error: %v", errs)
	}
}

func TestValidateSalesOrderCreate(t *testing.T) {
	p := Policy{SalesRequireQuotation: true}
	qid := int64(10)
	if errs := ValidateSalesOrderCreate(p, nil); errs == nil {
		t.Fatal("expected error without quotation")
	}
	if errs := ValidateSalesOrderCreate(p, &qid); errs != nil {
		t.Fatalf("unexpected error: %v", errs)
	}
}

func TestValidatePurchaseOrderCreate(t *testing.T) {
	p := Policy{PurchaseRequirePR: true}
	prid := int64(5)
	if errs := ValidatePurchaseOrderCreate(p, nil); errs == nil {
		t.Fatal("expected error without PR")
	}
	if errs := ValidatePurchaseOrderCreate(p, &prid); errs != nil {
		t.Fatalf("unexpected error: %v", errs)
	}
}

func TestValidatePurchaseRequestForPO(t *testing.T) {
	p := Policy{PurchaseRequirePRApproval: true}
	now := time.Now()
	// Relaxed: Unconfirmed / unapproved PRs may become POs.
	if errs := ValidatePurchaseRequestForPO(p, "e_approval", nil); errs != nil {
		t.Fatalf("unexpected error for unapproved PR: %v", errs)
	}
	if errs := ValidatePurchaseRequestForPO(p, "unconfirmed", nil); errs != nil {
		t.Fatalf("unexpected error for unconfirmed PR: %v", errs)
	}
	if errs := ValidatePurchaseRequestForPO(p, "confirmed", &now); errs != nil {
		t.Fatalf("unexpected error: %v", errs)
	}
}

func TestValidateSupplierInvoiceLineSource(t *testing.T) {
	on := Policy{PurchaseRequireGRBeforeSupplierInv: true}
	off := Policy{PurchaseRequireGRBeforeSupplierInv: false}

	if errs := ValidateSupplierInvoiceLineSource(on, false); errs == nil {
		t.Fatal("expected error: PO-only line must be rejected when GR-before-invoice is enabled")
	}
	if errs := ValidateSupplierInvoiceLineSource(on, true); errs != nil {
		t.Fatalf("unexpected error for GR-backed line: %v", errs)
	}
	if errs := ValidateSupplierInvoiceLineSource(off, false); errs != nil {
		t.Fatalf("unexpected error when policy disabled: %v", errs)
	}
}

func TestValidateSalesOrderApproval(t *testing.T) {
	on := Policy{SalesRequireSOApproval: true}
	off := Policy{SalesRequireSOApproval: false}

	// Relaxed: Sales / release may proceed without SO approval.
	if errs := ValidateSalesOrderApproval(on, false, ""); errs != nil {
		t.Fatalf("unexpected error when policy on: %v", errs)
	}
	if errs := ValidateSalesOrderApproval(on, true, "e_approval"); errs != nil {
		t.Fatalf("unexpected error for pending approval: %v", errs)
	}
	if errs := ValidateSalesOrderApproval(on, true, "unconfirmed"); errs != nil {
		t.Fatalf("unexpected error for unconfirmed approval: %v", errs)
	}
	if errs := ValidateSalesOrderApproval(on, true, "confirmed"); errs != nil {
		t.Fatalf("unexpected error for approved SO: %v", errs)
	}
	if errs := ValidateSalesOrderApproval(off, false, ""); errs != nil {
		t.Fatalf("unexpected error when policy disabled: %v", errs)
	}
}

func TestValidatePurchaseOrderApproval(t *testing.T) {
	on := Policy{PurchaseRequirePOApproval: true}
	off := Policy{PurchaseRequirePOApproval: false}

	// Relaxed: Purchases / GR may proceed without PO approval.
	if errs := ValidatePurchaseOrderApproval(on, false, ""); errs != nil {
		t.Fatalf("unexpected error when policy on: %v", errs)
	}
	if errs := ValidatePurchaseOrderApproval(on, true, "e_approval"); errs != nil {
		t.Fatalf("unexpected error for pending approval: %v", errs)
	}
	if errs := ValidatePurchaseOrderApproval(on, true, "confirmed"); errs != nil {
		t.Fatalf("unexpected error for approved PO: %v", errs)
	}
	if errs := ValidatePurchaseOrderApproval(off, false, ""); errs != nil {
		t.Fatalf("unexpected error when policy disabled: %v", errs)
	}
}

func TestAllowJournalAutoPost(t *testing.T) {
	on := Policy{FinanceRequireJEApproval: true}
	off := Policy{FinanceRequireJEApproval: false}

	if AllowJournalAutoPost(on, true) {
		t.Fatal("auto-post must be downgraded to draft when JE approval policy is on")
	}
	if !AllowJournalAutoPost(off, true) {
		t.Fatal("auto-post should proceed when JE approval policy is off")
	}
	if AllowJournalAutoPost(off, false) {
		t.Fatal("auto-post must stay off when not requested")
	}
}

func TestValidateJournalEntryPost(t *testing.T) {
	on := Policy{FinanceRequireJEApproval: true}
	off := Policy{FinanceRequireJEApproval: false}

	if errs := ValidateJournalEntryPost(on, false, ""); errs == nil {
		t.Fatal("expected error: JE without approval request must block when policy on")
	}
	if errs := ValidateJournalEntryPost(on, true, "e_approval"); errs == nil {
		t.Fatal("expected error: pending JE approval must block when policy on")
	}
	if errs := ValidateJournalEntryPost(on, true, "confirmed"); errs != nil {
		t.Fatalf("unexpected error for approved JE: %v", errs)
	}
	if errs := ValidateJournalEntryPost(off, false, ""); errs != nil {
		t.Fatalf("unexpected error when policy disabled: %v", errs)
	}
}

func TestEffectiveReleaseOnHand(t *testing.T) {
	off := Policy{SalesCountCompletedWoTowardRelease: false}
	on := Policy{SalesCountCompletedWoTowardRelease: true}

	if got := EffectiveReleaseOnHand(off, 5, 2, 100); got != 5 {
		t.Fatalf("policy off must passthrough on-hand: got %v", got)
	}
	// Available = 5-2 = 3; completed 10 > 3 → floor to completed + reserved
	if got := EffectiveReleaseOnHand(on, 5, 2, 10); got != 12 {
		t.Fatalf("policy on should floor to completed WO: got %v want 12", got)
	}
	// Available already covers completed — no change
	if got := EffectiveReleaseOnHand(on, 20, 0, 10); got != 20 {
		t.Fatalf("policy on must not inflate when on-hand covers WO: got %v", got)
	}
}

func TestValidateSalesReleaseRequiresReservation_policyOffIdentical(t *testing.T) {
	p := Policy{SalesRequireReservation: true}
	// Without EffectiveReleaseOnHand adjustment, short stock still fails
	if errs := ValidateSalesReleaseRequiresReservation(p, true, 0, 0, 5, 2, 0); errs == nil {
		t.Fatal("expected insufficient stock")
	}
	// With completed WO floor applied by caller
	adj := EffectiveReleaseOnHand(Policy{SalesCountCompletedWoTowardRelease: true}, 2, 0, 5)
	if errs := ValidateSalesReleaseRequiresReservation(p, true, 0, 0, 5, adj, 0); errs != nil {
		t.Fatalf("expected pass with completed WO floor: %v", errs)
	}
	// Default policy EffectiveReleaseOnHand is bit-identical to raw on-hand
	raw := 7.0
	if EffectiveReleaseOnHand(Policy{}, raw, 1, 99) != raw {
		t.Fatal("default-off EffectiveReleaseOnHand must be identical to qtyOnHand")
	}
}
