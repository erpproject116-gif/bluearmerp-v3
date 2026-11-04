package hr

import (
	"testing"
	"time"
)

func TestPeriodsOverlap(t *testing.T) {
	y := 2026
	d := func(month time.Month, day int) time.Time {
		return time.Date(y, month, day, 0, 0, 0, 0, time.UTC)
	}
	if !periodsOverlap(d(time.January, 1), d(time.January, 15), d(time.January, 10), d(time.January, 20)) {
		t.Fatal("1–15 should overlap 10–20")
	}
	if periodsOverlap(d(time.January, 1), d(time.January, 15), d(time.January, 16), d(time.January, 31)) {
		t.Fatal("1–15 should not overlap 16–31")
	}
}

func TestQuincenaRanges(t *testing.T) {
	s1, e1, s2, e2, err := quincenaRanges(2026, time.February)
	if err != nil {
		t.Fatal(err)
	}
	if s1.Format("2006-01-02") != "2026-02-01" || e1.Format("2006-01-02") != "2026-02-15" ||
		s2.Format("2006-01-02") != "2026-02-16" || e2.Format("2006-01-02") != "2026-02-28" {
		t.Fatalf("2026 got %s %s %s %s", s1.Format("2006-01-02"), e1.Format("2006-01-02"), s2.Format("2006-01-02"), e2.Format("2006-01-02"))
	}
	_, _, _, e2, err = quincenaRanges(2028, time.February)
	if err != nil {
		t.Fatal(err)
	}
	if e2.Format("2006-01-02") != "2028-02-29" {
		t.Fatalf("2028 end = %s", e2.Format("2006-01-02"))
	}
}

func TestStatutoryPackageError(t *testing.T) {
	err := statutoryPackageError{Agency: "SSS"}
	if err.Error() != "SSS statutory package is missing for this period end." {
		t.Fatal(err.Error())
	}
}
