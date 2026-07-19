package hr

import (
	"testing"
	"time"
)

func TestBusinessDaysInclusive(t *testing.T) {
	from := time.Date(2026, 7, 13, 0, 0, 0, 0, time.UTC) // Monday
	to := time.Date(2026, 7, 17, 0, 0, 0, 0, time.UTC)   // Friday
	if got := businessDaysInclusive(from, to); got != 5 {
		t.Fatalf("expected 5 business days, got %v", got)
	}
	// weekend-only range
	sat := time.Date(2026, 7, 18, 0, 0, 0, 0, time.UTC)
	sun := time.Date(2026, 7, 19, 0, 0, 0, 0, time.UTC)
	if got := businessDaysInclusive(sat, sun); got != 0 {
		t.Fatalf("expected 0 business days on weekend, got %v", got)
	}
}

func TestAvailableDays(t *testing.T) {
	b := LeaveBalance{Opening: 10, Accrued: 5, Used: 3, Reserved: 2, Adjusted: 1}
	if got := availableDays(b); got != 11 {
		t.Fatalf("expected 11 available, got %v", got)
	}
}

func TestDailyLeaveCashOutMath(t *testing.T) {
	base := 30000.0
	daysInMonth := 30.0
	unusedDays := 5.0
	daily := roundMoney(base / daysInMonth)
	cash := roundMoney(unusedDays * daily)
	if cash <= 0 {
		t.Fatal("cash-out should be positive when unused days exist")
	}
	if cash != roundMoney(5000) {
		t.Fatalf("expected 5000 cash-out, got %v", cash)
	}
}
