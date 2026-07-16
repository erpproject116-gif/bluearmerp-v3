package hr

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

type catalogPayResult struct {
	EarningLines   []draftPayslipLine
	DeductionLines []draftPayslipLine
	EarningTotal   float64
	DeductionTotal float64
	SSSBaseAdd     float64 // amounts that should inflate statutory compensation base
	TaxableAdd     float64
}

type absenceResult struct {
	AbsentDays   float64
	DeductionAmt float64
	Line         *draftPayslipLine
}

// loadCatalogPayItems returns active recurring earnings/deductions effective on asOf.
func loadCatalogPayItems(ctx context.Context, tx pgx.Tx, tenantID, employeeID int64, asOf time.Time) (catalogPayResult, error) {
	out := catalogPayResult{}
	rows, err := tx.Query(ctx, `
		select t.item_code, t.item_name, t.item_kind, t.is_taxable, t.include_in_sss, epi.amount::float8
		from public.hr_employee_pay_items epi
		join public.hr_pay_item_types t on t.id = epi.pay_item_type_id
		where epi.tenant_id = $1 and epi.employee_id = $2 and epi.is_active and t.is_active
		  and epi.effective_from <= $3::date
		  and (epi.effective_to is null or epi.effective_to >= $3::date)
		order by t.item_kind, t.sort_order, t.item_code`,
		tenantID, employeeID, asOf.Format("2006-01-02"))
	if err != nil {
		// Catalog tables may not exist yet on older DBs — treat as empty.
		return out, nil
	}
	defer rows.Close()
	lineNo := 1
	for rows.Next() {
		var code, name, kind string
		var taxable, incSSS bool
		var amount float64
		if err := rows.Scan(&code, &name, &kind, &taxable, &incSSS, &amount); err != nil {
			return out, err
		}
		if amount <= 0 {
			continue
		}
		amt := roundMoney(amount)
		ln := draftPayslipLine{LineNo: lineNo, LineCode: code, Description: name, Amount: amt}
		if kind == "earning" {
			ln.LineType = "earning"
			out.EarningLines = append(out.EarningLines, ln)
			out.EarningTotal += amt
			if taxable {
				out.TaxableAdd += amt
			}
			if incSSS {
				out.SSSBaseAdd += amt
			}
		} else {
			ln.LineType = "deduction"
			out.DeductionLines = append(out.DeductionLines, ln)
			out.DeductionTotal += amt
		}
		lineNo++
	}
	out.EarningTotal = roundMoney(out.EarningTotal)
	out.DeductionTotal = roundMoney(out.DeductionTotal)
	out.SSSBaseAdd = roundMoney(out.SSSBaseAdd)
	out.TaxableAdd = roundMoney(out.TaxableAdd)
	return out, nil
}

// computeAbsenceDeduction: unpaid absences (absent/awol) × daily rate, only when DTR rows exist in period.
func computeAbsenceDeduction(
	ctx context.Context,
	tx pgx.Tx,
	tenantID, employeeID int64,
	periodStart, periodEnd time.Time,
	monthlyBasic float64,
) (absenceResult, error) {
	out := absenceResult{}
	if monthlyBasic <= 0 {
		return out, nil
	}
	var absentDays float64
	var dtrCount int
	err := tx.QueryRow(ctx, `
		select
		  count(*)::int,
		  coalesce(sum(case when status in ('absent', 'awol') then 1 else 0 end), 0)::float8
		from public.hr_dtr_entries
		where tenant_id = $1 and employee_id = $2
		  and work_date >= $3::date and work_date <= $4::date`,
		tenantID, employeeID, periodStart.Format("2006-01-02"), periodEnd.Format("2006-01-02"),
	).Scan(&dtrCount, &absentDays)
	if err != nil {
		return out, err
	}
	// No DTR in period → do not pro-rate (full basic). Leave/rest/holiday/present unpaid only for absent/awol.
	if dtrCount == 0 || absentDays <= 0 {
		return out, nil
	}
	daily := monthlyBasic / workingDaysPerMonth
	out.AbsentDays = absentDays
	out.DeductionAmt = roundMoney(daily * absentDays)
	if out.DeductionAmt > monthlyBasic {
		out.DeductionAmt = roundMoney(monthlyBasic)
	}
	if out.DeductionAmt > 0 {
		ln := draftPayslipLine{
			LineNo: 1, LineType: "deduction", LineCode: "ABSENCE",
			Description: fmt.Sprintf("Unpaid absence (%g day(s))", absentDays),
			Amount:      out.DeductionAmt,
		}
		out.Line = &ln
	}
	return out, nil
}
