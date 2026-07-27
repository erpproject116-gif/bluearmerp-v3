package operations

import (
	"fmt"
	"testing"
)

func TestDocHrefCoversSellingBuyingTypes(t *testing.T) {
	types := []string{
		"quo_quotation", "so_sales_order", "sa_sales",
		"pr_purchase_request", "rfq_request", "rfq_supplier_quotation",
		"po_purchase_order", "gr_goods_receipt", "fin_supplier_invoice",
		"fin_official_receipt", "job_cost_project",
	}
	for _, dt := range types {
		if !supportedDocTypes[dt] {
			t.Fatalf("missing supportedDocTypes entry: %s", dt)
		}
		if href := docHref(dt, 42); href == "" {
			t.Fatalf("empty href for %s", dt)
		}
	}
}

func TestInventoryProjectErrorMessage(t *testing.T) {
	msg := inventoryProjectErrorMessage(nil)
	if msg != "Failed to create inventory project." {
		t.Fatalf("unexpected default: %q", msg)
	}
	dup := inventoryProjectErrorMessage(fmt.Errorf(`duplicate key value violates unique constraint "inv_projects_tenant_id_project_code_key"`))
	if dup == "" || dup == msg {
		t.Fatalf("expected duplicate-specific message, got %q", dup)
	}
}
