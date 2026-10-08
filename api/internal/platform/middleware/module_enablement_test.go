package middleware

import "testing"

func TestMatchModuleRuleLongestPrefix(t *testing.T) {
	tests := []struct {
		path        string
		wantModule  string
		wantFeature string
		wantMatch   bool
	}{
		{"/api/v1/inventory/items", "inventory", "", true},
		{"/api/v1/inventory/serial-units", "inventory", "inventory.serial_lot", true},
		{"/api/v1/inventory/lot-batches/register", "inventory", "inventory.serial_lot", true},
		{"/api/v1/inventory/price-lists", "inventory", "inventory.price_lists", true},
		{"/api/v1/inventory/repair-orders", "after_sales", "", true},
		{"/api/v1/finance/journals", "finance", "", true},
		{"/api/v1/finance/supplier-invoices", "purchases", "", true},
		{"/api/v1/manufacturing/work-orders", "manufacturing", "", true},
		{"/api/v1/pos/sessions", "pos", "", true},
		{"/api/v1/sales/sales", "sales", "", true},
		{"/api/v1/purchase-order/rfq", "purchase_order", "", true},
		{"/api/v1/shipping/orders", "", "", true},
		{"/api/v1/migration/items", "", "", false},
	}
	for _, tc := range tests {
		rule, ok := matchModuleRule(tc.path)
		if ok != tc.wantMatch {
			t.Fatalf("%s: matched=%v want %v", tc.path, ok, tc.wantMatch)
		}
		if !ok {
			continue
		}
		if rule.moduleCode != tc.wantModule || rule.featureCode != tc.wantFeature {
			t.Fatalf("%s: got module=%q feature=%q want module=%q feature=%q",
				tc.path, rule.moduleCode, rule.featureCode, tc.wantModule, tc.wantFeature)
		}
		if tc.path == "/api/v1/shipping/orders" {
			if len(rule.anyModule) != 2 || rule.anyModule[0] != "sales" || rule.anyModule[1] != "sales_order" {
				t.Fatalf("shipping anyModule = %v", rule.anyModule)
			}
		}
	}
}

func TestMatchModuleRuleShippingAnyModule(t *testing.T) {
	if !shippingWriteAllowed(map[string]bool{}, "sales") {
		t.Fatal("only sales")
	}
	if !shippingWriteAllowed(map[string]bool{}, "sales_order") {
		t.Fatal("only sales order")
	}
	if !shippingWriteAllowed(map[string]bool{}, "sales", "sales_order") {
		t.Fatal("both on")
	}
	if shippingWriteAllowed(map[string]bool{}) {
		t.Fatal("both off")
	}
}

func shippingWriteAllowed(enabled map[string]bool, on ...string) bool {
	for _, code := range on {
		enabled[code] = true
	}
	rule, ok := matchModuleRule("/api/v1/shipping/orders")
	if !ok {
		return false
	}
	for _, code := range rule.anyModule {
		if enabled[code] {
			return true
		}
	}
	return false
}

func TestMatchModuleRuleIgnoresLegacySerialLotPrefix(t *testing.T) {
	// Old incorrect prefix must not be the only serial gate; real routes use serial-units.
	rule, ok := matchModuleRule("/api/v1/inventory/serial-lot")
	if !ok {
		t.Fatal("expected inventory parent match for unknown serial-lot path")
	}
	if rule.moduleCode != "inventory" || rule.featureCode != "" {
		t.Fatalf("unexpected rule %+v", rule)
	}
}
