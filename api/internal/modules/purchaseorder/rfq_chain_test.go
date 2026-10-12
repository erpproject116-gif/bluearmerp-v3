package purchaseorder

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
)

type captureQuery struct {
	sql string
	row pgx.Row
}

func (c *captureQuery) QueryRow(_ context.Context, sql string, _ ...any) pgx.Row {
	c.sql = sql
	return c.row
}

type scanRow struct {
	id  int64
	err error
}

func (s scanRow) Scan(dest ...any) error {
	if s.err != nil {
		return s.err
	}
	*(dest[0].(*int64)) = s.id
	return nil
}

func TestRfqListStatusFilter(t *testing.T) {
	clause, arg, apply := rfqListStatusFilter("outstanding", "draft")
	if !apply || arg != "" || clause != " and r.status = 'sent'" {
		t.Fatalf("outstanding: %q %q %v", clause, arg, apply)
	}
	clause, arg, apply = rfqListStatusFilter("history", "")
	if !apply || arg != "" || !strings.Contains(clause, "'closed'") || !strings.Contains(clause, "'cancelled'") {
		t.Fatalf("history: %q %q %v", clause, arg, apply)
	}
	if strings.Contains(clause, "draft") || strings.Contains(clause, "sent") {
		t.Fatalf("history must not include open statuses: %s", clause)
	}
	clause, arg, apply = rfqListStatusFilter("", "sent")
	if !apply || arg != "sent" || !strings.Contains(clause, "$%d") {
		t.Fatalf("status: %q %q %v", clause, arg, apply)
	}
	if _, _, apply = rfqListStatusFilter("", "in_progress"); apply {
		t.Fatal("progress status is not an RFQ status")
	}
}

func TestGroupRfqComparison(t *testing.T) {
	lineA := int64(10)
	lineB := int64(11)
	until := "2026-12-01"
	groups := groupRfqComparison([]rfqCompareLine{
		{RFQRequestLineID: &lineA, QuotationLineID: 1, ItemName: "Paper", Supplier: "Acme", UnitPrice: 2, LineTotal: 20, ValidUntil: &until, QuoteNo: "Q1"},
		{RFQRequestLineID: &lineA, QuotationLineID: 2, ItemName: "Paper", Supplier: "Bolt", UnitPrice: 1.5, LineTotal: 15, QuoteNo: "Q2"},
		{RFQRequestLineID: &lineB, QuotationLineID: 3, ItemName: "Ink", Supplier: "Acme", UnitPrice: 4, LineTotal: 8, QuoteNo: "Q1"},
		{QuotationLineID: 4, ItemName: "Tape", Supplier: "Acme", UnitPrice: 3, LineTotal: 3, QuoteNo: "Q3"},
		{QuotationLineID: 5, Supplier: "Bolt", UnitPrice: 9, LineTotal: 9, QuoteNo: "Q4"},
	})
	if len(groups) != 4 {
		t.Fatalf("groups: %d", len(groups))
	}
	if groups[0].RFQRequestLineID == nil || *groups[0].RFQRequestLineID != 10 || len(groups[0].Quotes) != 2 {
		t.Fatalf("linked group: %+v", groups[0])
	}
	if groups[0].Quotes[0].Supplier != "Acme" || groups[0].Quotes[1].Supplier != "Bolt" {
		t.Fatalf("quotes: %+v", groups[0].Quotes)
	}
	if groups[2].RFQRequestLineID != nil || groups[2].ItemName != "Tape" || len(groups[2].Quotes) != 1 {
		t.Fatalf("unlinked named: %+v", groups[2])
	}
	if groups[3].ItemName != "Unlinked quote" || groups[3].Quotes[0].LineTotal != 9 {
		t.Fatalf("unlinked blank: %+v", groups[3])
	}
}

func TestFindOpenRFQReturnsExistingUnlessCancelled(t *testing.T) {
	q := &captureQuery{row: scanRow{id: 17}}
	id, found, err := findOpenRFQForPurchaseRequest(context.Background(), q, 1, 9)
	if err != nil || !found || id != 17 {
		t.Fatalf("got id=%d found=%v err=%v", id, found, err)
	}
	if !strings.Contains(q.sql, "purchase_request_id = $2") || !strings.Contains(q.sql, "status <> 'cancelled'") {
		t.Fatalf("lookup must reuse a non-cancelled RFQ: %s", q.sql)
	}

	missing := &captureQuery{row: scanRow{err: pgx.ErrNoRows}}
	id, found, err = findOpenRFQForPurchaseRequest(context.Background(), missing, 1, 9)
	if err != nil || found || id != 0 {
		t.Fatalf("missing RFQ: id=%d found=%v err=%v", id, found, err)
	}
}

func TestFindPurchaseOrderReturnsExistingQuoteOrder(t *testing.T) {
	q := &captureQuery{row: scanRow{id: 44}}
	id, found, err := findPurchaseOrderForSupplierQuotation(context.Background(), q, 1, 8)
	if err != nil || !found || id != 44 {
		t.Fatalf("got id=%d found=%v err=%v", id, found, err)
	}
	if !strings.Contains(q.sql, "supplier_quotation_id = $2") || !strings.Contains(q.sql, "deleted_at is null") {
		t.Fatalf("lookup must return the order for this quotation: %s", q.sql)
	}
	if strings.Contains(strings.ToLower(q.sql), "rejected") || strings.Contains(strings.ToLower(q.sql), "update") {
		t.Fatal("lookup must not reject sibling quotations")
	}

	broken := &captureQuery{row: scanRow{err: errors.New("db")}}
	if _, _, err := findPurchaseOrderForSupplierQuotation(context.Background(), broken, 1, 8); err == nil {
		t.Fatal("expected query error")
	}
}
