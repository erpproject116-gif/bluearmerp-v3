package health

import "testing"

func TestCriticalTablesIncludesAttachments(t *testing.T) {
	want := map[string]bool{
		"fin_supplier_invoice_attachments": true,
		"po_purchase_order_attachments":    true,
		"sa_sales_attachments":             true,
	}
	for _, table := range CriticalTables {
		delete(want, table)
	}
	if len(want) > 0 {
		t.Fatalf("CriticalTables missing: %v", want)
	}
}
