package finance

import "testing"

// voidPurchaseInvoice validates its void config at construction, so this also
// guards the interpolated table/column identifiers.
func TestVoidPurchaseInvoiceConfigIsValid(t *testing.T) {
	if h := voidPurchaseInvoice(nil); h == nil {
		t.Fatal("voidPurchaseInvoice returned no handler")
	}
}
