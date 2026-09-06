package inventory

import (
	"strings"
	"testing"
	"time"
)

func TestSerialReconciliationSerialSQL(t *testing.T) {
	q, args := serialReconciliationSerialSQL(1, serialReportFilters{}, true)

	if len(args) != 1 {
		t.Fatalf("expected 1 arg (tenant id), got %d", len(args))
	}
	// Outer pagination queries sort by subquery output names; aliases must exist.
	for _, alias := range []string{"as item_qty_on_hand", "as serial_unit_count", "as variance"} {
		if !strings.Contains(q, alias) {
			t.Errorf("expected alias %q in query:\n%s", alias, q)
		}
	}
	// Variance must compare balance to serial counts, not the misleading constant 1.
	if !strings.Contains(q, "coalesce(sc.cnt, 0)") {
		t.Errorf("expected serial count comparison in query:\n%s", q)
	}
	if strings.Contains(q, "- 1)") {
		t.Errorf("query still compares against constant 1:\n%s", q)
	}
}

func TestSerialReconciliationItemSQL(t *testing.T) {
	q, args := serialReconciliationItemSQL(1, serialReportFilters{}, false)
	if len(args) != 1 {
		t.Fatalf("expected 1 arg (tenant id), got %d", len(args))
	}
	for _, alias := range []string{"as item_qty_on_hand", "as serial_unit_count", "as variance"} {
		if !strings.Contains(q, alias) {
			t.Errorf("expected alias %q in query:\n%s", alias, q)
		}
	}
}

func TestSerialBookDetailSQLIncludesLedgerColumns(t *testing.T) {
	q, args := serialBookDetailSQL(9, time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC), time.Date(2026, 9, 6, 0, 0, 0, 0, time.UTC), serialReportFilters{})
	if len(args) < 3 {
		t.Fatalf("expected date args, got %d", len(args))
	}
	for _, want := range []string{
		"as increase_qty",
		"as release_qty",
		"as inventory_qty",
		"as partner_name",
		"as opening_qty",
		"event_type not in",
	} {
		if !strings.Contains(q, want) {
			t.Errorf("expected %q in detail SQL", want)
		}
	}
}

func TestSerialBookDetailSQLIncludeTransfers(t *testing.T) {
	q, _ := serialBookDetailSQL(1, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC), serialReportFilters{IncludeTransfers: true})
	if strings.Contains(q, "event_type not in") {
		t.Fatalf("include_transfers should not exclude transfer events:\n%s", q)
	}
}

func TestSerialBookSummarySQLInventoryQtyFilter(t *testing.T) {
	q, _ := serialBookSummarySQL(1, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC), serialReportFilters{InventoryQty: "1"})
	if !strings.Contains(q, "coalesce(l.location_name") {
		t.Errorf("expected location column in summary SQL")
	}
	if !strings.Contains(q, "= 1") {
		t.Errorf("expected inventory qty filter in summary SQL:\n%s", q)
	}
}

func TestSerialSlipTypeLabel(t *testing.T) {
	if got := serialSlipTypeLabel("sold"); got != "Sold" {
		t.Fatalf("sold -> %q", got)
	}
	if got := serialSlipTypeLabel("transferred"); got != "Location transfer" {
		t.Fatalf("transferred -> %q", got)
	}
}
