package inventory

import (
	"strings"
	"testing"
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
