package inventory

import (
	"strings"
	"testing"
	"time"
)

func TestLotBookDetailSQLIncludesLedgerColumns(t *testing.T) {
	q, args := lotBookDetailSQL(9, time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC), time.Date(2026, 9, 6, 0, 0, 0, 0, time.UTC), lotReportFilters{})
	if len(args) < 3 {
		t.Fatalf("expected date args, got %d", len(args))
	}
	for _, want := range []string{
		"as increase_qty",
		"as release_qty",
		"as inventory_qty",
		"as partner_name",
		"as opening_qty",
		"lb.expiry_date",
		"public.inv_lot_events",
		"i.track_lot = true",
		"event_type not in",
	} {
		if !strings.Contains(q, want) {
			t.Errorf("expected %q in detail SQL", want)
		}
	}
}

func TestLotBookDetailSQLIncludeTransfers(t *testing.T) {
	q, _ := lotBookDetailSQL(1, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC), lotReportFilters{IncludeTransfers: true})
	if strings.Contains(q, "event_type not in") {
		t.Fatalf("include_transfers should not exclude transfer events:\n%s", q)
	}
}

func TestLotBookDetailSQLFilters(t *testing.T) {
	q, args := lotBookDetailSQL(1, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC), lotReportFilters{
		LotNo:     "L-100",
		EventType: "consumed",
		RefType:   "goods_receipt",
	})
	if len(args) != 6 {
		t.Fatalf("expected 6 args, got %d: %v", len(args), args)
	}
	for _, want := range []string{"lb.lot_no ilike", "e.event_type = $", "e.ref_type = $"} {
		if !strings.Contains(q, want) {
			t.Errorf("expected %q in detail SQL:\n%s", want, q)
		}
	}
}

func TestLotBookSummarySQLInventoryQtyFilter(t *testing.T) {
	q, _ := lotBookSummarySQL(1, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC), lotReportFilters{InventoryQty: "1"})
	if !strings.Contains(q, "coalesce(l.location_name") {
		t.Errorf("expected location column in summary SQL")
	}
	if !strings.Contains(q, "= 1") {
		t.Errorf("expected inventory qty filter in summary SQL:\n%s", q)
	}
}

func TestLotBookSummarySQLValidityFilters(t *testing.T) {
	from := time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)
	q, args := lotBookSummarySQL(1, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC), lotReportFilters{
		ValidityFrom: &from,
		ValidityTo:   &to,
	})
	if len(args) != 5 {
		t.Fatalf("expected 5 args, got %d", len(args))
	}
	if !strings.Contains(q, "lb.expiry_date >= $4::date") || !strings.Contains(q, "lb.expiry_date <= $5::date") {
		t.Errorf("expected expiry_date validity filters in summary SQL:\n%s", q)
	}
}

func TestLotSlipTypeLabel(t *testing.T) {
	if got := lotSlipTypeLabel("consumed"); got != "Consumed" {
		t.Fatalf("consumed -> %q", got)
	}
	if got := lotSlipTypeLabel("produced"); got != "Produced" {
		t.Fatalf("produced -> %q", got)
	}
	if got := lotSlipTypeLabel("transferred"); got != "Location transfer" {
		t.Fatalf("transferred -> %q", got)
	}
}

func TestLotEventTypeForQtyDelta(t *testing.T) {
	cases := []struct {
		delta float64
		kind  string
		want  string
	}{
		{1, "adjusted", "received"},
		{-1, "adjusted", "sold"},
		{2, "produced", "produced"},
		{-2, "consumed", "consumed"},
		{3, "returned", "returned"},
		{-3, "voided", "voided"},
	}
	for _, c := range cases {
		if got := LotEventTypeForQtyDelta(c.delta, c.kind); got != c.want {
			t.Errorf("LotEventTypeForQtyDelta(%v, %q) = %q, want %q", c.delta, c.kind, got, c.want)
		}
	}
}
