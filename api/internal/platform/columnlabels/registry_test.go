package columnlabels

import "testing"

func TestValidViewKeyIncludesList(t *testing.T) {
	if !ValidViewKey("fin_supplier_invoice.list") {
		t.Fatal("expected fin_supplier_invoice.list to be registered")
	}
	if !ValidViewKey("fin_supplier_invoice.lines") {
		t.Fatal("expected fin_supplier_invoice.lines to remain registered")
	}
	cols := StandardColumns("fin_supplier_invoice.list")
	if len(cols) < 10 {
		t.Fatalf("expected list columns, got %d", len(cols))
	}
	found := false
	for _, c := range cols {
		if c.ColumnKey == "date_no_display" {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("expected date_no_display in list columns")
	}
}
