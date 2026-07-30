package response

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestValidationAssistPreservesErrorsAndAssist(t *testing.T) {
	rr := httptest.NewRecorder()
	errs := map[string]string{"qty": "Quantity exceeds PO balance (1.0000)."}
	assist := Assist{
		Code:   "SA_SI_QTY_EXCEEDS_PO_BALANCE",
		Title:  "Quantity exceeds open PO balance",
		Detail: "Only 1.0000 remains on this PO line.",
		Field:  "qty",
		Actions: []AssistAction{
			{Label: "Open Goods Receipts", Href: "/app/purchase-order/goods-receipt"},
		},
	}
	ValidationAssist(rr, errs, assist)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rr.Code)
	}
	var env Envelope
	if err := json.Unmarshal(rr.Body.Bytes(), &env); err != nil {
		t.Fatal(err)
	}
	if env.Success {
		t.Fatal("expected success=false")
	}
	if env.Code != "ERR_VALIDATION" {
		t.Fatalf("code = %q", env.Code)
	}
	if env.Errors["qty"] != errs["qty"] {
		t.Fatalf("errors = %#v", env.Errors)
	}
	if env.Assist == nil || env.Assist.Code != "SA_SI_QTY_EXCEEDS_PO_BALANCE" {
		t.Fatalf("assist = %#v", env.Assist)
	}
	if len(env.Assist.Actions) != 1 || env.Assist.Actions[0].Href != "/app/purchase-order/goods-receipt" {
		t.Fatalf("actions = %#v", env.Assist.Actions)
	}
}

func TestErrAssistAttachesAssist(t *testing.T) {
	rr := httptest.NewRecorder()
	assist := Assist{
		Code:   "SA_RETAINER_NOT_FUNDED",
		Title:  "Retainer must be funded first",
		Detail: "Record an official receipt against this retainer before applying it.",
		Actions: []AssistAction{
			{Label: "Open Retainers", Href: "/app/sales/retainers"},
		},
	}
	ErrAssist(rr, http.StatusBadRequest, "Retainer must be funded via OR.", "ERR_BAD_REQUEST", assist)

	var env Envelope
	if err := json.Unmarshal(rr.Body.Bytes(), &env); err != nil {
		t.Fatal(err)
	}
	if env.Code != "ERR_BAD_REQUEST" {
		t.Fatalf("code = %q", env.Code)
	}
	if env.Assist == nil || env.Assist.Code != "SA_RETAINER_NOT_FUNDED" {
		t.Fatalf("assist = %#v", env.Assist)
	}
	if env.Message != "Retainer must be funded via OR." {
		t.Fatalf("message = %q", env.Message)
	}
}
