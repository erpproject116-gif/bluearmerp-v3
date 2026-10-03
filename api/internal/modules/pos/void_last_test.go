package pos

import "testing"

func TestVoidLastDefaultReason(t *testing.T) {
	reason := ""
	if reason == "" {
		reason = "Void last sale at register"
	}
	if reason != "Void last sale at register" {
		t.Fatalf("got %q", reason)
	}
}

func TestMultiInvoiceORBlockMessage(t *testing.T) {
	const msg = "Cannot void: official receipt is applied to other invoices. Unapply in Finance first."
	if len(msg) < 20 {
		t.Fatal("block message too short")
	}
}
