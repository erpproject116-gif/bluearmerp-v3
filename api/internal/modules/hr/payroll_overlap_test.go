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

func TestFirstQuincenaOmitsSalaryAndStatutory(t *testing.T) {
	start := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, time.January, 15, 0, 0, 0, 0, time.UTC)
	if !isFirstQuincena(start, end) {
		t.Fatal("1–15 should be the first range")
	}
	fullStart := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	fullEnd := time.Date(2026, time.January, 31, 0, 0, 0, 0, time.UTC)
	if isFirstQuincena(fullStart, fullEnd) {
		t.Fatal("a full month is not the first range")
	}
	secondStart := time.Date(2026, time.January, 16, 0, 0, 0, 0, time.UTC)
	if isFirstQuincena(secondStart, fullEnd) {
		t.Fatal("16–31 is not the first range")
	}
	out := omitFirstQuincenaSalary(employeePayslipDraft{
		PremiumTotal: 100,
		CatalogEarn:  50,
		Lines: []draftPayslipLine{
			{LineType: "earning", LineCode: "BASIC", Amount: 20000},
			{LineType: "earning", LineCode: "OT", Amount: 100},
			{LineType: "deduction", LineCode: "SSS_EE", Amount: 500},
			{LineType: "employer_share", LineCode: "SSS_ER", Amount: 1000},
			{LineType: "deduction", LineCode: "PHIC_EE", Amount: 250},
			{LineType: "employer_share", LineCode: "PHIC_ER", Amount: 250},
			{LineType: "deduction", LineCode: "HDMF_EE", Amount: 200},
			{LineType: "employer_share", LineCode: "HDMF_ER", Amount: 200},
			{LineType: "deduction", LineCode: "WHT", Amount: 800},
			{LineType: "deduction", LineCode: "ABSENCE", Amount: 10},
		},
	})
	if out.GrossPay != 150 {
		t.Fatalf("gross = %v", out.GrossPay)
	}
	if out.Deductions != 10 || out.EmployerShare != 0 || out.NetPay != 140 {
		t.Fatalf("deduct %v employer %v net %v", out.Deductions, out.EmployerShare, out.NetPay)
	}
	for _, ln := range out.Lines {
		if ln.LineCode == "BASIC" && ln.Amount != 0 {
			t.Fatalf("basic = %v", ln.Amount)
		}
		switch ln.LineCode {
		case "SSS_EE", "SSS_ER", "PHIC_EE", "PHIC_ER", "HDMF_EE", "HDMF_ER", "WHT":
			t.Fatalf("kept %s", ln.LineCode)
		}
	}
}

func TestStatutoryPackageError(t *testing.T) {
	err := statutoryPackageError{Agency: "SSS"}
	if err.Error() != "SSS statutory package is missing for this period end." {
		t.Fatal(err.Error())
	}
}
