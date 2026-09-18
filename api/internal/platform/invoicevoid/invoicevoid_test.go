package invoicevoid

import (
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func validConfig() Config {
	return Config{
		Table:         "sa_sales",
		NumberColumn:  "sales_no",
		JournalColumn: "invoice_journal_entry_id",
		DocumentType:  "sa_sale",
		DisplayName:   "Sales invoice",
		AuditAction:   "sales.invoice.void",
		AuditTarget:   "sa_sales",
		JournalRemark: func(no string) string { return "Void sales " + no },
	}
}

func TestValidateConfig(t *testing.T) {
	if err := ValidateConfig(validConfig()); err != nil {
		t.Fatalf("valid config rejected: %v", err)
	}

	bad := map[string]func(c *Config){
		"injected table":  func(c *Config) { c.Table = "sa_sales; drop table users" },
		"empty number":    func(c *Config) { c.NumberColumn = "" },
		"missing type":    func(c *Config) { c.DocumentType = " " },
		"missing audit":   func(c *Config) { c.AuditAction = "" },
		"missing remark":  func(c *Config) { c.JournalRemark = nil },
		"blank blocker":   func(c *Config) { c.Payments = []PaymentBlocker{{Label: "", Query: "select 1"}} },
		"queryless block": func(c *Config) { c.Payments = []PaymentBlocker{{Label: "Payments", Query: ""}} },
	}
	for name, mutate := range bad {
		cfg := validConfig()
		mutate(&cfg)
		if err := ValidateConfig(cfg); err == nil {
			t.Fatalf("%s config accepted", name)
		}
	}
}

func TestReadReasonRequiresText(t *testing.T) {
	cases := []struct {
		name string
		body string
		want string
		ok   bool
	}{
		{"reason", `{"reason":"  wrong vendor  "}`, "wrong vendor", true},
		{"empty", `{"reason":"   "}`, "", false},
		{"missing", `{}`, "", false},
		{"too long", `{"reason":"` + strings.Repeat("x", 2001) + `"}`, "", false},
	}
	for _, tt := range cases {
		r := httptest.NewRequest("POST", "/void", strings.NewReader(tt.body))
		got, ok := readReason(httptest.NewRecorder(), r)
		if ok != tt.ok || got != tt.want {
			t.Fatalf("%s: readReason = %q, %v; want %q, %v", tt.name, got, ok, tt.want, tt.ok)
		}
	}
}

// The locked v1 rule: voiding an invoice never touches inventory. Guard the
// source so a later edit cannot quietly add a stock reverse here.
func TestVoidNeverTouchesInventory(t *testing.T) {
	files := []string{
		"invoicevoid.go",
		"../invoicejournal/void.go",
	}
	forbidden := []string{"inv_stock_movements", "inv_serial_units", "inv_lot_batches"}
	for _, f := range files {
		src, err := os.ReadFile(f)
		if err != nil {
			t.Fatalf("read %s: %v", f, err)
		}
		for _, table := range forbidden {
			if strings.Contains(string(src), table) {
				t.Fatalf("%s references %s; void must leave inventory untouched", f, table)
			}
		}
	}
}
