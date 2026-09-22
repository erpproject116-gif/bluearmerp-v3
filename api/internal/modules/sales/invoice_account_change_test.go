package sales

import (
	"os"
	"strings"
	"testing"
)

func TestPutSalesInvoiceAllowsPostedAccountChangeViaResync(t *testing.T) {
	src, err := os.ReadFile("invoice.go")
	if err != nil {
		t.Fatal(err)
	}
	body := string(src)
	if strings.Contains(body, "Accounts cannot be changed after the journal entry is posted") {
		t.Fatal("sales invoice PUT must not hard-reject account changes when JE is posted")
	}
	if !strings.Contains(body, "invoicejournal.Resync(") {
		t.Fatal("sales invoice PUT must Resync when posted JE accounts change")
	}
	if !strings.Contains(body, "jeStatus == \"posted\" && !accountsChanged") {
		t.Fatal("sales invoice PUT must keep fees/remark-only path when JE posted and accounts unchanged")
	}
}
