package inventory

import (
	"testing"
	"time"
)

func TestValidateWarrantyDatePair(t *testing.T) {
	d := func(s string) *time.Time {
		tm, err := time.Parse("2006-01-02", s)
		if err != nil {
			t.Fatal(err)
		}
		return &tm
	}
	if err := validateWarrantyDatePair(d("2024-01-01"), d("2025-01-01")); err != nil {
		t.Fatalf("expected ok, got %v", err)
	}
	if err := validateWarrantyDatePair(d("2024-01-01"), d("2024-01-01")); err != nil {
		t.Fatalf("same day should be ok, got %v", err)
	}
	if err := validateWarrantyDatePair(d("2025-01-01"), d("2024-01-01")); err == nil {
		t.Fatal("expected end-before-start error")
	}
	if err := validateWarrantyDatePair(nil, d("2024-01-01")); err != nil {
		t.Fatalf("nil start ok, got %v", err)
	}
	if err := validateWarrantyDatePair(d("2024-01-01"), nil); err != nil {
		t.Fatalf("nil end ok, got %v", err)
	}
}

func TestParseOptionalWarrantyDate(t *testing.T) {
	set, cleared, val, err := parseOptionalWarrantyDate(nil)
	if set || cleared || val != nil || err != nil {
		t.Fatalf("omit: set=%v cleared=%v val=%v err=%v", set, cleared, val, err)
	}
	empty := "  "
	set, cleared, val, err = parseOptionalWarrantyDate(&empty)
	if !set || !cleared || val != nil || err != nil {
		t.Fatalf("clear: set=%v cleared=%v val=%v err=%v", set, cleared, val, err)
	}
	ok := "2024-06-15"
	set, cleared, val, err = parseOptionalWarrantyDate(&ok)
	if !set || cleared || err != nil || val == nil || val.Format("2006-01-02") != "2024-06-15" {
		t.Fatalf("date: set=%v cleared=%v val=%v err=%v", set, cleared, val, err)
	}
	bad := "not-a-date"
	_, _, _, err = parseOptionalWarrantyDate(&bad)
	if err == nil {
		t.Fatal("expected parse error")
	}
}

func TestWarrantyEndFromMonths(t *testing.T) {
	start := time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC)
	if warrantyEndFromMonths(start, 0) != nil {
		t.Fatal("months 0 => nil")
	}
	end := warrantyEndFromMonths(start, 12)
	if end == nil || end.Format("2006-01-02") != "2025-01-15" {
		t.Fatalf("got %v", end)
	}
}
