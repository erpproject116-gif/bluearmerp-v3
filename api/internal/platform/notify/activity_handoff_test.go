package notify

import "testing"

func TestHandoffPermissionCodesAvoidBroadPrefixes(t *testing.T) {
	bill := handoffPermissionCodes("finance.supplier_invoice.create")
	if !hasCode(bill, "purchases.purchases") || !hasCode(bill, "purchases.purchases_new") {
		t.Fatalf("supplier invoice audience = %v", bill)
	}
	if hasCode(bill, "finance") || hasCode(bill, "finance.acct_i") {
		t.Fatalf("supplier invoice must not use the finance prefix: %v", bill)
	}
	rfq := handoffPermissionCodes("purchase_order.rfq_create")
	if !hasCode(rfq, "purchase_order.rfq") {
		t.Fatalf("rfq audience = %v", rfq)
	}
	gr := handoffPermissionCodes("goods_receipt.create")
	if !hasCode(gr, "purchase_order.goods_receipts") || !hasCode(gr, "purchases.purchases") {
		t.Fatalf("goods receipt audience = %v", gr)
	}
	if hasCode(gr, "purchase_order.purchase_orders") {
		t.Fatalf("goods receipt must not use the purchase-order prefix: %v", gr)
	}
	if handoffPermissionCodes("sales.update") != nil {
		t.Fatal("edits are not a handoff audience")
	}
}

func TestHandoffTitles(t *testing.T) {
	if got := handoffTitle("manufacturing.work_order_create", "WO-9"); got != "New production job WO-9" {
		t.Fatalf("work order title %q", got)
	}
	if got := handoffTitle("manufacturing.work_order_create_from_sales_order", "WO-2"); got != "New production job WO-2" {
		t.Fatalf("cutting/assembly share one title, got %q", got)
	}
	if got := handoffTitle("purchase_order.rfq_create", "RFQ-1"); got != "New RFQ RFQ-1" {
		t.Fatalf("rfq title %q", got)
	}
	if got := handoffTitle("goods_receipt.create", "GR-4"); got != "New purchase receive GR-4" {
		t.Fatalf("receive title %q", got)
	}
	if got := handoffTitle("finance.supplier_invoice.create_from_gr", "PINV-3"); got != "New purchase PINV-3" {
		t.Fatalf("purchase title %q", got)
	}
}

func TestKeepHandoffRecipient(t *testing.T) {
	partner := int64(10)
	other := int64(11)
	loc := int64(5)
	elsewhere := int64(9)
	doc := handoffDocScope{PartnerID: &partner, LocationID: &loc, Loaded: true}

	scopedOut := handoffCandidate{ID: 1, ScopeLookupOK: true, CustomerIDs: []int64{other}}
	if keepHandoffRecipient(scopedOut, doc, false) {
		t.Fatal("customer scope outside the document must drop")
	}
	scopedIn := handoffCandidate{ID: 2, ScopeLookupOK: true, CustomerIDs: []int64{partner}, LocationIDs: []int64{loc}}
	if !keepHandoffRecipient(scopedIn, doc, false) {
		t.Fatal("matching customer and location scopes must stay")
	}
	unscoped := handoffCandidate{ID: 3, Unscoped: true, ScopeLookupOK: true, CustomerIDs: []int64{other}}
	if !keepHandoffRecipient(unscoped, doc, false) {
		t.Fatal("an unscoped matching role must stay")
	}
	noRows := handoffCandidate{ID: 4, ScopeLookupOK: true}
	if keepHandoffRecipient(noRows, doc, false) {
		t.Fatal("scoped role with no scope rows must drop")
	}
	lookupFail := handoffCandidate{ID: 5, ScopeLookupOK: false, Unscoped: true}
	if keepHandoffRecipient(lookupFail, doc, false) {
		t.Fatal("scope lookup error must drop the user")
	}
	owner := handoffCandidate{ID: 6, ViewAll: true}
	if !keepHandoffRecipient(owner, handoffDocScope{}, true) {
		t.Fatal("owner stays without a document lookup")
	}
	homeOnly := handoffCandidate{ID: 7, Unscoped: true, ScopeLookupOK: true, HomeLocationID: loc}
	if !keepHandoffRecipient(homeOnly, doc, true) {
		t.Fatal("home location inside commercial locations must stay")
	}
	if keepHandoffRecipient(homeOnly, handoffDocScope{PartnerID: &partner, LocationID: &elsewhere, Loaded: true}, true) {
		t.Fatal("strict isolation must drop a location outside commercial locations")
	}
}

func hasCode(codes []string, want string) bool {
	for _, c := range codes {
		if c == want {
			return true
		}
	}
	return false
}
