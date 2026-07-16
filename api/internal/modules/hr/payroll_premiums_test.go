package hr

import (
	"math"
	"testing"
	"time"
)

func TestHourlyRate(t *testing.T) {
	// 22,000 monthly → 22,000 / 22 / 8 = 125/hr
	got := hourlyRate(22000)
	want := 125.0
	if got != want {
		t.Fatalf("hourlyRate(22000): want %.2f got %.4f", want, got)
	}
}

func TestHolidayPremiumAmount(t *testing.T) {
	hourly := 125.0
	regular := dtrPremiumRow{
		workDate: time.Now(), status: "holiday", hoursWorked: 8, payMultiplier: 2.0, holidayType: "regular",
	}
	// 200% holiday → premium factor 1.0 × 8 × 125 = 1000
	got := holidayPremiumAmount(hourly, regular)
	if got != 1000 {
		t.Fatalf("regular holiday premium: want 1000 got %.2f", got)
	}
	special := dtrPremiumRow{
		status: "holiday", hoursWorked: 8, payMultiplier: 1.3, holidayType: "special_non_working",
	}
	// 130% → factor 0.3 × 8 × 125 = 300
	got = holidayPremiumAmount(hourly, special)
	if math.Abs(got-300) > 0.01 {
		t.Fatalf("special holiday premium: want 300 got %.2f", got)
	}
}

func TestInsertPremiumLinesAfterBasic(t *testing.T) {
	base := []draftPayslipLine{
		{LineNo: 1, LineType: "earning", LineCode: "BASIC", Description: "Base salary", Amount: 25000},
		{LineNo: 2, LineType: "deduction", LineCode: "SSS_EE", Description: "SSS", Amount: 500},
	}
	prem := []draftPayslipLine{
		{LineType: "earning", LineCode: "OT_PAY", Description: "Overtime", Amount: 468.75},
	}
	out := insertPremiumLinesAfterBasic(base, prem)
	if len(out) != 3 {
		t.Fatalf("expected 3 lines, got %d", len(out))
	}
	if out[0].LineCode != "BASIC" || out[1].LineCode != "OT_PAY" || out[2].LineCode != "SSS_EE" {
		t.Fatalf("unexpected line order: %+v", out)
	}
	if out[2].LineNo != 3 {
		t.Fatalf("expected renumbered line 3, got %d", out[2].LineNo)
	}
}

func TestOTAndNightDiffTotals(t *testing.T) {
	hourly := hourlyRate(22000) // 125
	ot := hourly * otRateMultiplier * 2 // 2 OT hours
	nd := hourly * nightDiffRate * 4      // 4 night-diff hours
	if ot != 312.5 {
		t.Fatalf("OT total: want 312.5 got %.2f", ot)
	}
	if nd != 50 {
		t.Fatalf("ND total: want 50 got %.2f", nd)
	}
}
