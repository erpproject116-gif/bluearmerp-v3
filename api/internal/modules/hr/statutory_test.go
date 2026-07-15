package hr

import (
	"math"
	"testing"
)

func TestMSCFromCompensation(t *testing.T) {
	cfg := statutoryConfigSSS{
		MSCMin: 5000, MSCMax: 35000, RegularMSCCap: 20000,
		BandStart: 5250, BandWidth: 500,
		EmployeeRate: 0.05, EmployerRate: 0.10,
		ECLow: 10, ECHigh: 30, ECCompThreshold: 14750,
	}
	cases := []struct {
		comp float64
		msc  float64
	}{
		{5000, 5000},
		{5249.99, 5000},
		{14250, 14500},
		{14750, 15000},
		{20250, 20500},
		{34750, 35000},
		{50000, 35000},
	}
	for _, c := range cases {
		got := mscFromCompensation(c.comp, cfg)
		if got != c.msc {
			t.Fatalf("comp %.2f: msc want %.0f got %.0f", c.comp, c.msc, got)
		}
	}
}

func TestComputeSSSSampleRows(t *testing.T) {
	cfg := statutoryConfigSSS{
		MSCMin: 5000, MSCMax: 35000, RegularMSCCap: 20000,
		BandStart: 5250, BandWidth: 500,
		EmployeeRate: 0.05, EmployerRate: 0.10,
		ECLow: 10, ECHigh: 30, ECCompThreshold: 14750,
	}
	// Below 5250 → MSC 5000 → EE 250, ER 500, EC 10
	ee, er, ec, _ := computeSSS(5000, cfg)
	if ee != 250 || er != 500 || ec != 10 {
		t.Fatalf("low band: ee=%.2f er=%.2f ec=%.2f", ee, er, ec)
	}
	// 34750+ → MSC 35000 = 20k + 15k MPF → EE 1000+750=1750, ER 2000+1500=3500, EC 30
	ee, er, ec, _ = computeSSS(40000, cfg)
	if ee != 1750 || er != 3500 || ec != 30 {
		t.Fatalf("max band: ee=%.2f er=%.2f ec=%.2f", ee, er, ec)
	}
}

func TestComputePhilHealthPagibigBIR(t *testing.T) {
	ph := statutoryConfigPHIC{Rate: 0.05, EmployeeShare: 0.5, EmployerShare: 0.5, SalaryFloor: 10000, SalaryCeiling: 100000}
	ee, er := computePhilHealth(20000, ph)
	if ee != 500 || er != 500 {
		t.Fatalf("phic 20k: ee=%.2f er=%.2f", ee, er)
	}
	ee, er = computePhilHealth(5000, ph) // floor
	if ee != 250 || er != 250 {
		t.Fatalf("phic floor: ee=%.2f er=%.2f", ee, er)
	}

	hd := statutoryConfigHDMF{LowThreshold: 1500, Ceiling: 10000, EmployeeRateLow: 0.01, EmployeeRate: 0.02, EmployerRate: 0.02, MaxEE: 200, MaxER: 200}
	ee, er = computePagibig(25000, hd)
	if ee != 200 || er != 200 {
		t.Fatalf("hdmf cap: ee=%.2f er=%.2f", ee, er)
	}

	annualTax := computeBIRAnnualTRAIN(300000) // 15% of 50k = 7500
	if math.Abs(annualTax-7500) > 0.01 {
		t.Fatalf("bir annual: got %.2f", annualTax)
	}
	monthly := computeBIRWithholding(25000, statutoryConfigBIR{}) // taxable 25k/mo → 300k/yr → 7500/12
	if math.Abs(monthly-625) > 0.01 {
		t.Fatalf("bir monthly: got %.2f", monthly)
	}
}
