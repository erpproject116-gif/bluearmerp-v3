package customfields

import "testing"

func TestNormalizeFieldKey(t *testing.T) {
	tests := []struct {
		label, key, want string
	}{
		{"Tax ID", "", "tax_id"},
		{"1099 Form", "", "f_1099_form"},
		{"", "", "field"},
		{"VIP", "vip_code", "vip_code"},
		{"Test", "9bad", "f_9bad"},
	}
	for _, tc := range tests {
		got := NormalizeFieldKey(tc.label, tc.key)
		if got != tc.want {
			t.Fatalf("NormalizeFieldKey(%q, %q) = %q, want %q", tc.label, tc.key, got, tc.want)
		}
	}
}

func TestValidateDefinitionInputEntityType(t *testing.T) {
	errs := ValidateDefinitionInput("unknown_entity", "tax_id", "Tax ID", "text", true)
	if errs["entity_type"] == "" {
		t.Fatal("expected entity_type validation error for unknown entity")
	}
	errs = ValidateDefinitionInput("inv_partner", "tax_id", "Tax ID", "text", true)
	if len(errs) != 0 {
		t.Fatalf("expected no errors, got %#v", errs)
	}
	errs = ValidateDefinitionInput("fin_supplier_invoice", "vendor_ref", "Vendor ref", "select", true)
	if len(errs) != 0 {
		t.Fatalf("expected fin_supplier_invoice to be valid, got %#v", errs)
	}
}
