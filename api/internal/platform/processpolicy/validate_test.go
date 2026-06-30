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
	if errs := ValidatePurchaseRequestForPO(p, "e_approval", nil); errs == nil {
		t.Fatal("expected error for unapproved PR")
	}
	if errs := ValidatePurchaseRequestForPO(p, "confirmed", nil); errs == nil {
		t.Fatal("expected error for confirmed without approved_at")
	}
	if errs := ValidatePurchaseRequestForPO(p, "confirmed", &now); errs != nil {
		t.Fatalf("unexpected error: %v", errs)
	}
}
