package middleware

import "testing"

func TestIsCommercialTradeMutation(t *testing.T) {
	cases := []struct {
		method, path string
		want         bool
	}{
		{"GET", "/api/v1/sales/sales", false},
		{"POST", "/api/v1/sales/sales", true},
		{"POST", "/api/v1/inventory/items", false},
		{"POST", "/api/v1/inventory/stock-entries/1/post", false},
		{"POST", "/api/v1/purchase-order/purchase-orders", true},
		{"POST", "/api/v1/quotation/quotations", true},
		{"POST", "/api/v1/quotation/currencies", false},
		{"POST", "/api/v1/finance/accounts", false},
		{"POST", "/api/v1/finance/supplier-invoices", true},
		{"POST", "/api/v1/pos/checkout", true},
		{"POST", "/api/v1/platform/console/customers/1/confirm-day1-payment", false},
	}
	for _, c := range cases {
		got := isCommercialTradeMutation(c.method, c.path)
		if got != c.want {
			t.Fatalf("%s %s: got %v want %v", c.method, c.path, got, c.want)
		}
	}
}
