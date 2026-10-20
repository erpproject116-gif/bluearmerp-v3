package hr

import "testing"

func TestCalendarMonthBounds(t *testing.T) {
	from, to, ok := calendarMonthBounds(2026, 10)
	if !ok || from != "2026-10-01" || to != "2026-10-31" {
		t.Fatalf("oct 2026: from=%s to=%s ok=%v", from, to, ok)
	}
	from, to, ok = calendarMonthBounds(2026, 2)
	if !ok || from != "2026-02-01" || to != "2026-02-28" {
		t.Fatalf("feb 2026: from=%s to=%s ok=%v", from, to, ok)
	}
	if _, _, ok := calendarMonthBounds(2026, 13); ok {
		t.Fatal("month 13 should fail")
	}
}

func TestIsShortDay(t *testing.T) {
	if !isShortDay("present", 7.5) {
		t.Fatal("present under 8 hours is a short day")
	}
	if isShortDay("present", 8) {
		t.Fatal("present with 8 hours is not short")
	}
	if isShortDay("absent", 0) {
		t.Fatal("absent is not a short day")
	}
}
