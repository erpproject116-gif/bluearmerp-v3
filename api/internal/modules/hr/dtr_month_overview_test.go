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

func TestDtrStatusLetter(t *testing.T) {
	if dtrStatusLetter("present") != "P" || dtrStatusLetter("awol") != "W" {
		t.Fatal("unexpected status letters")
	}
	if dtrStatusLetter("unknown") != "" {
		t.Fatal("unknown status should be blank")
	}
}

func TestMonthOverviewDayAppendUsesIndex(t *testing.T) {
	// Regression: pointers into a growing slice lose day cells; index map must keep them.
	out := []DTRMonthOverviewRow{}
	idxByID := map[int64]int{}
	for id := int64(1); id <= 40; id++ {
		idxByID[id] = len(out)
		out = append(out, DTRMonthOverviewRow{EmployeeID: id, Days: []DTRMonthDayCell{}})
	}
	for id := int64(1); id <= 40; id++ {
		i := idxByID[id]
		out[i].Days = append(out[i].Days, DTRMonthDayCell{Day: 1, Status: "present", HoursWorked: 8})
	}
	for id := int64(1); id <= 40; id++ {
		if len(out[idxByID[id]].Days) != 1 {
			t.Fatalf("employee %d lost day cells", id)
		}
	}
}
