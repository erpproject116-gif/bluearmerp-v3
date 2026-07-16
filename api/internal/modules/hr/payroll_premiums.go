package hr

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// PH payroll defaults (semi-monthly monthly basic ÷ 22 days ÷ 8 hours).
const (
	workingDaysPerMonth = 22.0
	hoursPerDay         = 8.0
	otRateMultiplier    = 1.25  // 125% of hourly (25% premium)
	nightDiffRate       = 0.10  // 10% of hourly on night-diff hours
)

type dtrPremiumResult struct {
	Lines        []draftPayslipLine
	TotalPremium float64
	EntryCount   int
}

type dtrPremiumRow struct {
	workDate        time.Time
	status          string
	hoursWorked     float64
	otHours         float64
	nightDiffHours  float64
	payMultiplier   float64
	holidayType     string
}

func hourlyRate(monthlyBasic float64) float64 {
	if monthlyBasic <= 0 {
		return 0
	}
	return monthlyBasic / workingDaysPerMonth / hoursPerDay
}

// computeDTRPremiums aggregates DTR rows in [periodStart, periodEnd] into OT, night-diff, and holiday premium earnings.
func computeDTRPremiums(
	ctx context.Context,
	tx pgx.Tx,
	tenantID, employeeID int64,
	periodStart, periodEnd time.Time,
	monthlyBasic float64,
) (dtrPremiumResult, error) {
	out := dtrPremiumResult{}
	if monthlyBasic <= 0 {
		return out, nil
	}

	rows, err := tx.Query(ctx, `
		select d.work_date, d.status, d.hours_worked::float8, d.ot_hours::float8, d.night_diff_hours::float8,
		  coalesce(h.pay_multiplier::float8, 2.0), coalesce(h.holiday_type, '')
		from public.hr_dtr_entries d
		left join public.hr_holidays h on h.id = d.holiday_id
		where d.tenant_id = $1 and d.employee_id = $2
		  and d.work_date >= $3::date and d.work_date <= $4::date
		order by d.work_date`,
		tenantID, employeeID, periodStart.Format("2006-01-02"), periodEnd.Format("2006-01-02"))
	if err != nil {
		return out, err
	}
	defer rows.Close()

	var entries []dtrPremiumRow
	for rows.Next() {
		var r dtrPremiumRow
		if err := rows.Scan(&r.workDate, &r.status, &r.hoursWorked, &r.otHours, &r.nightDiffHours, &r.payMultiplier, &r.holidayType); err != nil {
			return out, err
		}
		entries = append(entries, r)
	}
	out.EntryCount = len(entries)
	if len(entries) == 0 {
		return out, nil
	}

	hourly := hourlyRate(monthlyBasic)
	var otTotal, ndTotal, holTotal float64

	for _, e := range entries {
		if e.otHours > 0 {
			otTotal += hourly * otRateMultiplier * e.otHours
		}
		if e.nightDiffHours > 0 {
			ndTotal += hourly * nightDiffRate * e.nightDiffHours
		}
		holPremium := holidayPremiumAmount(hourly, e)
		holTotal += holPremium
	}

	lineNo := 1
	if otTotal > 0 {
		amt := roundMoney(otTotal)
		out.Lines = append(out.Lines, draftPayslipLine{
			LineNo: lineNo, LineType: "earning", LineCode: "OT_PAY",
			Description: fmt.Sprintf("Overtime pay (%d DTR day(s))", out.EntryCount), Amount: amt,
		})
		lineNo++
		out.TotalPremium += amt
	}
	if ndTotal > 0 {
		amt := roundMoney(ndTotal)
		out.Lines = append(out.Lines, draftPayslipLine{
			LineNo: lineNo, LineType: "earning", LineCode: "ND_PAY",
			Description: "Night differential (10% of hourly)", Amount: amt,
		})
		lineNo++
		out.TotalPremium += amt
	}
	if holTotal > 0 {
		amt := roundMoney(holTotal)
		out.Lines = append(out.Lines, draftPayslipLine{
			LineNo: lineNo, LineType: "earning", LineCode: "HOLIDAY_PAY",
			Description: "Holiday premium (from DTR / calendar)", Amount: amt,
		})
		out.TotalPremium += amt
	}
	out.TotalPremium = roundMoney(out.TotalPremium)
	return out, nil
}

func holidayPremiumAmount(hourly float64, e dtrPremiumRow) float64 {
	if e.hoursWorked <= 0 {
		return 0
	}
	isHoliday := e.status == "holiday" || e.payMultiplier > 1.0
	if !isHoliday {
		return 0
	}
	mult := e.payMultiplier
	if mult <= 1 {
		mult = 2.0
	}
	switch e.holidayType {
	case "special_non_working":
		if mult < 1.30 {
			mult = 1.30
		}
	case "special_working":
		if mult < 1.30 {
			mult = 1.30
		}
	default:
		if mult < 2.0 {
			mult = 2.0
		}
	}
	// Premium portion above regular hourly (multiplier − 1) × hours × hourly rate.
	premiumFactor := mult - 1.0
	if premiumFactor <= 0 {
		return 0
	}
	return hourly * premiumFactor * e.hoursWorked
}

type employeePayslipDraft struct {
	EmployeeID    int64
	EmployeeNo    string
	EmployeeName  string
	BaseSalary    float64
	PremiumTotal  float64
	CatalogEarn   float64
	CatalogDeduct float64
	AbsenceDeduct float64
	DTRDays       int
	GrossPay      float64
	Deductions    float64
	NetPay        float64
	Lines         []draftPayslipLine
	EmployerShare float64
}

func buildEmployeePayslipDraft(
	ctx context.Context,
	tx pgx.Tx,
	tenantID, employeeID int64,
	employeeNo, employeeName string,
	baseSalary float64,
	periodStart, periodEnd time.Time,
) (employeePayslipDraft, error) {
	out := employeePayslipDraft{
		EmployeeID: employeeID, EmployeeNo: employeeNo, EmployeeName: employeeName, BaseSalary: baseSalary,
	}

	absence, err := computeAbsenceDeduction(ctx, tx, tenantID, employeeID, periodStart, periodEnd, baseSalary)
	if err != nil {
		return out, err
	}
	out.AbsenceDeduct = absence.DeductionAmt
	compBase := roundMoney(baseSalary - absence.DeductionAmt)
	if compBase < 0 {
		compBase = 0
	}

	premiums, err := computeDTRPremiums(ctx, tx, tenantID, employeeID, periodStart, periodEnd, baseSalary)
	if err != nil {
		return out, err
	}
	out.PremiumTotal = premiums.TotalPremium
	out.DTRDays = premiums.EntryCount

	catalog, err := loadCatalogPayItems(ctx, tx, tenantID, employeeID, periodEnd)
	if err != nil {
		return out, err
	}
	out.CatalogEarn = catalog.EarningTotal
	out.CatalogDeduct = catalog.DeductionTotal

	statutoryBase := roundMoney(compBase + catalog.SSSBaseAdd)
	stat, err := computeStatutoryDeductions(ctx, tx, periodEnd, statutoryBase)
	if err != nil {
		return out, err
	}
	// Show contracted basic on the payslip; unpaid days appear as ABSENCE deduction.
	for i := range stat.Lines {
		if stat.Lines[i].LineCode == "BASIC" {
			stat.Lines[i].Amount = roundMoney(baseSalary)
			stat.Lines[i].Description = "Base salary"
		}
	}

	extraEarn := append([]draftPayslipLine{}, premiums.Lines...)
	extraEarn = append(extraEarn, catalog.EarningLines...)
	stat.Lines = insertPremiumLinesAfterBasic(stat.Lines, extraEarn)

	if absence.Line != nil {
		stat.Lines = append(stat.Lines, *absence.Line)
	}
	stat.Lines = append(stat.Lines, catalog.DeductionLines...)
	for i := range stat.Lines {
		stat.Lines[i].LineNo = i + 1
	}

	grossPay := roundMoney(baseSalary + premiums.TotalPremium + catalog.EarningTotal)
	out.GrossPay = grossPay

	taxableGross := roundMoney(compBase + premiums.TotalPremium + catalog.TaxableAdd)
	var whtDelta float64
	stat.Lines, whtDelta, err = recalculateWHT(ctx, tx, periodEnd, stat.Lines, taxableGross)
	if err != nil {
		return out, err
	}
	out.Lines = stat.Lines
	out.Deductions = roundMoney(stat.EmployeeDeduct + whtDelta + catalog.DeductionTotal + absence.DeductionAmt)
	out.NetPay = roundMoney(out.GrossPay - out.Deductions)
	if out.NetPay < 0 {
		out.NetPay = 0
	}
	out.EmployerShare = stat.EmployerShare
	return out, nil
}

func insertPremiumLinesAfterBasic(lines []draftPayslipLine, premiums []draftPayslipLine) []draftPayslipLine {
	if len(premiums) == 0 {
		return lines
	}
	out := make([]draftPayslipLine, 0, len(lines)+len(premiums))
	inserted := false
	for _, ln := range lines {
		out = append(out, ln)
		if !inserted && ln.LineCode == "BASIC" {
			out = append(out, premiums...)
			inserted = true
		}
	}
	if !inserted {
		out = append(out, premiums...)
	}
	for i := range out {
		out[i].LineNo = i + 1
	}
	return out
}

// recalculateWHT updates the withholding tax line using full taxable compensation (basic + premiums − EE statutory).
func recalculateWHT(ctx context.Context, tx pgx.Tx, asOf time.Time, lines []draftPayslipLine, grossPay float64) ([]draftPayslipLine, float64, error) {
	taxable := grossPay
	var oldWHT float64
	whtIdx := -1
	for i, ln := range lines {
		if ln.LineType == "deduction" && (ln.LineCode == "SSS_EE" || ln.LineCode == "PHIC_EE" || ln.LineCode == "HDMF_EE") {
			taxable -= ln.Amount
		}
		if ln.LineCode == "WHT" {
			whtIdx = i
			oldWHT = ln.Amount
		}
	}
	if taxable < 0 {
		taxable = 0
	}
	newWHT := 0.0
	if raw, code, err := loadAgencyConfig(ctx, tx, "bir", asOf); err == nil {
		var cfg statutoryConfigBIR
		_ = json.Unmarshal(raw, &cfg)
		newWHT = computeBIRWithholding(taxable, cfg)
		if whtIdx >= 0 {
			lines[whtIdx].Amount = newWHT
			lines[whtIdx].Description = "Withholding tax (" + code + ")"
		}
	}
	eeDeductDelta := newWHT - oldWHT
	return lines, eeDeductDelta, nil
}
