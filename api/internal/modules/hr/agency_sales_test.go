package hr

import (
	"os"
	"strings"
	"testing"
)

func TestClientBillCreatesUnconfirmedSales(t *testing.T) {
	src, err := os.ReadFile("agency.go")
	if err != nil {
		t.Fatal(err)
	}
	text := string(src)
	start := strings.Index(text, "func createClientBill")
	if start < 0 {
		t.Fatal("createClientBill missing")
	}
	rest := text[start:]
	end := strings.Index(rest[1:], "\nfunc ")
	if end < 0 {
		t.Fatal("createClientBill bounds")
	}
	fn := rest[:1+end]
	for _, need := range []string{
		"allocate_sales_sequences",
		"insert into public.sa_sales",
		"insert into public.sa_sales_lines",
		"sales_id",
		"'unconfirmed'",
		"c.partner_id",
		"inv_locations",
		"quo_currencies",
		"quo_tax_types",
	} {
		if !strings.Contains(fn, need) {
			t.Fatalf("createClientBill missing %q", need)
		}
	}
	if strings.Contains(fn, "'confirmed'") || strings.Contains(fn, `"confirmed"`) {
		t.Fatal("client bill must not auto-confirm sales")
	}
}
