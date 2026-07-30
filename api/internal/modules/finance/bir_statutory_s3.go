package finance

import (
	"context"
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const compensationWHTDisclaimer = "For accountant review — not certified eFPS"

func registerBIRStatutoryS3Routes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.compensation_wht_read", auth.AccessRead)).Get("/statutory/compensation/1601c", exportCompensation1601C(pool))
	r.With(auth.RequirePermission("finance.compensation_wht_read", auth.AccessRead)).Get("/statutory/compensation/employee-alphalist", exportCompensationEmployeeAlphalist(pool))
}

func exportCompensation1601C(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		month := strings.TrimSpace(r.URL.Query().Get("month"))
		if month == "" {
			month = time.Now().Format("2006-01")
		}
		rows, totals, err := queryCompensation1601C(r.Context(), pool, tu.TenantID, month)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to build 1601-C pack.", "ERR_INTERNAL")
			return
		}
		if r.URL.Query().Get("format") == "json" {
			response.OK(w, map[string]any{
				"profile":        "1601-C spreadsheet pack (not certified eFPS)",
				"month":          month,
				"disclaimer":     compensationWHTDisclaimer,
				"rows":           rows,
				"total_gross":    totals.Gross,
				"total_ded":      totals.Deductions,
				"total_wht":      totals.WHT,
				"employee_count": len(rows),
			}, compensationWHTDisclaimer)
			return
		}
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="1601C_compensation_%s.csv"`, month))
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"profile", "1601-C compensation spreadsheet pack (not certified eFPS)"})
		_ = cw.Write([]string{"disclaimer", compensationWHTDisclaimer})
		_ = cw.Write([]string{"month", month})
		_ = cw.Write([]string{"employee_no", "full_name", "tin", "gross", "deductions", "withholding_tax"})
		for _, row := range rows {
			_ = cw.Write([]string{row.EmployeeNo, row.FullName, row.TIN,
				fmt.Sprintf("%.2f", row.Gross), fmt.Sprintf("%.2f", row.Deductions), fmt.Sprintf("%.2f", row.WHT)})
		}
		_ = cw.Write([]string{"TOTALS", "", "", fmt.Sprintf("%.2f", totals.Gross), fmt.Sprintf("%.2f", totals.Deductions), fmt.Sprintf("%.2f", totals.WHT)})
		cw.Flush()
	}
}

type compensation1601Row struct {
	EmployeeNo string  `json:"employee_no"`
	FullName   string  `json:"full_name"`
	TIN        string  `json:"tin"`
	Gross      float64 `json:"gross"`
	Deductions float64 `json:"deductions"`
	WHT        float64 `json:"withholding_tax"`
}

type compensation1601Totals struct {
	Gross      float64
	Deductions float64
	WHT        float64
}

func queryCompensation1601C(ctx context.Context, pool *pgxpool.Pool, tenantID int64, month string) ([]compensation1601Row, compensation1601Totals, error) {
	rows, err := pool.Query(ctx, `
		select e.employee_no, e.full_name, coalesce(e.tin,''),
		  sum(ps.gross_pay)::float8, sum(ps.deductions)::float8,
		  coalesce(sum(case when pl.line_code in ('WHT','WITHHOLDING_TAX') then pl.amount else 0 end),0)::float8
		from public.hr_payslips ps
		join public.hr_pay_periods pp on pp.id=ps.pay_period_id
		join public.hr_employees e on e.id=ps.employee_id
		left join public.hr_payslip_lines pl on pl.payslip_id=ps.id
		where ps.tenant_id=$1 and ps.status='posted'
		  and to_char(pp.period_end, 'YYYY-MM')=$2
		group by e.employee_no, e.full_name, e.tin
		order by e.employee_no`, tenantID, month)
	if err != nil {
		return nil, compensation1601Totals{}, err
	}
	defer rows.Close()
	var out []compensation1601Row
	var totals compensation1601Totals
	for rows.Next() {
		var row compensation1601Row
		_ = rows.Scan(&row.EmployeeNo, &row.FullName, &row.TIN, &row.Gross, &row.Deductions, &row.WHT)
		totals.Gross += row.Gross
		totals.Deductions += row.Deductions
		totals.WHT += row.WHT
		out = append(out, row)
	}
	if out == nil {
		out = []compensation1601Row{}
	}
	return out, totals, nil
}

func exportCompensationEmployeeAlphalist(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		year := time.Now().Year()
		if y := strings.TrimSpace(r.URL.Query().Get("year")); y != "" {
			if n, err := strconv.Atoi(y); err == nil {
				year = n
			}
		}
		rows, err := queryCompensationAlphalist(r.Context(), pool, tu.TenantID, year)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to build employee alphalist.", "ERR_INTERNAL")
			return
		}
		if r.URL.Query().Get("format") == "json" {
			response.OK(w, map[string]any{
				"tax_year":     year,
				"disclaimer":   compensationWHTDisclaimer,
				"employee_count": len(rows),
				"rows":         rows,
			}, compensationWHTDisclaimer)
			return
		}
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="employee_alphalist_%d.csv"`, year))
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"disclaimer", compensationWHTDisclaimer})
		_ = cw.Write([]string{"tax_year", strconv.Itoa(year)})
		_ = cw.Write([]string{"employee_no", "full_name", "tin", "tax_status", "gross_ytd", "deductions_ytd", "net_ytd", "withholding_tax_ytd"})
		var totalGross, totalDed, totalNet, totalWHT float64
		for _, row := range rows {
			_ = cw.Write([]string{
				row.EmployeeNo, row.FullName, row.TIN, row.TaxStatus,
				fmt.Sprintf("%.2f", row.GrossYTD), fmt.Sprintf("%.2f", row.DeductionsYTD),
				fmt.Sprintf("%.2f", row.NetYTD), fmt.Sprintf("%.2f", row.WHTYTD),
			})
			totalGross += row.GrossYTD
			totalDed += row.DeductionsYTD
			totalNet += row.NetYTD
			totalWHT += row.WHTYTD
		}
		_ = cw.Write([]string{"TOTALS", "", "", "", fmt.Sprintf("%.2f", totalGross), fmt.Sprintf("%.2f", totalDed), fmt.Sprintf("%.2f", totalNet), fmt.Sprintf("%.2f", totalWHT)})
		cw.Flush()
	}
}

type compensationAlphalistRow struct {
	EmployeeNo    string  `json:"employee_no"`
	FullName      string  `json:"full_name"`
	TIN           string  `json:"tin"`
	TaxStatus     string  `json:"tax_status"`
	GrossYTD      float64 `json:"gross_ytd"`
	DeductionsYTD float64 `json:"deductions_ytd"`
	NetYTD        float64 `json:"net_ytd"`
	WHTYTD        float64 `json:"withholding_tax_ytd"`
}

func queryCompensationAlphalist(ctx context.Context, pool *pgxpool.Pool, tenantID int64, year int) ([]compensationAlphalistRow, error) {
	rows, err := pool.Query(ctx, `
		select e.employee_no, e.full_name, coalesce(e.tin,''), coalesce(e.tax_status,''),
		  coalesce(sum(ps.gross_pay),0)::float8,
		  coalesce(sum(ps.deductions),0)::float8,
		  coalesce(sum(ps.net_pay),0)::float8,
		  coalesce((select sum(pl.amount) from public.hr_payslip_lines pl
		    join public.hr_payslips p2 on p2.id=pl.payslip_id
		    join public.hr_pay_periods pp2 on pp2.id=p2.pay_period_id
		    where p2.employee_id=e.id and p2.tenant_id=$1 and p2.status='posted'
		      and extract(year from pp2.period_end)=$2 and pl.line_code in ('WHT','WITHHOLDING_TAX')),0)::float8
		from public.hr_employees e
		left join public.hr_payslips ps on ps.employee_id=e.id and ps.tenant_id=$1 and ps.status='posted'
		left join public.hr_pay_periods pp on pp.id=ps.pay_period_id and extract(year from pp.period_end)=$2
		where e.tenant_id=$1 and e.status='active'
		group by e.id, e.employee_no, e.full_name, e.tin, e.tax_status
		having coalesce(sum(ps.gross_pay),0) > 0
		order by e.employee_no`, tenantID, year)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []compensationAlphalistRow
	for rows.Next() {
		var row compensationAlphalistRow
		_ = rows.Scan(&row.EmployeeNo, &row.FullName, &row.TIN, &row.TaxStatus,
			&row.GrossYTD, &row.DeductionsYTD, &row.NetYTD, &row.WHTYTD)
		out = append(out, row)
	}
	if out == nil {
		out = []compensationAlphalistRow{}
	}
	return out, nil
}
