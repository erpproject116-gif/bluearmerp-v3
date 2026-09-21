package sales

import "testing"

func TestValidateSaleBodyRequiresCategory(t *testing.T) {
	base := saleBody{
		OrderDate:      "2026-09-21",
		TaxTypeID:      1,
		CurrencyID:     1,
		PartnerID:      1,
		LocationID:     1,
		ProgressStatus: "unconfirmed",
	}
	if errs := validateSaleBody(base, true); errs["sales_category"] == "" {
		t.Fatal("missing category should be required")
	}
	blank := "  "
	base.SalesCategory = &blank
	if errs := validateSaleBody(base, false); errs["sales_category"] == "" {
		t.Fatal("blank category should be required")
	}
	cat := "general"
	base.SalesCategory = &cat
	if errs := validateSaleBody(base, true); errs != nil {
		t.Fatalf("valid category: %v", errs)
	}
	if *base.SalesCategory != "general" {
		t.Fatalf("category trimmed to %q", *base.SalesCategory)
	}
}
