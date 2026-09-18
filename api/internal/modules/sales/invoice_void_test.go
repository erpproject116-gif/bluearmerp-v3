package sales

import "testing"

// voidSalesInvoice validates its void config at construction, so this also
// guards the interpolated table/column identifiers.
func TestVoidSalesInvoiceConfigIsValid(t *testing.T) {
	if h := voidSalesInvoice(nil); h == nil {
		t.Fatal("voidSalesInvoice returned no handler")
	}
}
