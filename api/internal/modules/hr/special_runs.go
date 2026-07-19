package hr

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type specialRunBody struct {
	Year          int    `json:"year"`
	PeriodLabel   string `json:"period_label"`
	EmployeeID    *int64 `json:"employee_id"` // final pay: one employee
	SeparationDate string `json:"separation_date"`
}

type specialRunPreviewRow struct {
	EmployeeID   int64   `json:"employee_id"`
	EmployeeNo   string  `json:"employee_no"`
	EmployeeName string  `json:"employee_name"`
	BaseSalary   float64 `json:"base_salary"`
	YTDBasic     float64 `json:"ytd_basic"`
	MonthsWorked float64 `json:"months_worked"`
	Amount       float64 `json:"amount"`
	Notes        string  `json:"notes,omitempty"`
}

type specialRunResult struct {
	RunType       string                 `json:"run_type"`
	PayPeriodID   int64                  `json:"pay_period_id,omitempty"`
	PayslipCount  int                    `json:"payslip_count"`
	TotalGross    float64                `json:"total_gross"`
	TotalNet      float64                `json:"total_net"`
	Employees     []specialRunPreviewRow `json:"employees"`
	JournalEntryID *int64                `json:"journal_entry_id,omitempty"`
}

func registerSpecialRunRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("hr.special_runs", auth.AccessRead)).Post("/special-runs/thirteenth/preview", previewThirteenth(pool))
	r.With(auth.RequirePermission("hr.special_runs", auth.AccessWrite)).Post("/special-runs/thirteenth", runThirteenth(pool))
	r.With(auth.RequirePermission("hr.special_runs", auth.AccessRead)).Post("/special-runs/final-pay/preview", previewFinalPay(pool))
	r.With(auth.RequirePermission("hr.special_runs", auth.AccessWrite)).Post("/special-runs/final-pay", runFinalPay(pool))
}

// PH 13th month = (total basic salary earned in calendar year) / 12.
// Approximation: sum of BASIC payslip lines in the year (or base_salary × months with payslips).
func computeThirteenthRows(ctx context.Context, tx pgx.Tx, tenantID int64, year int) ([]specialRunPreviewRow, error) {
	start := fmt.Sprintf("%d-01-01", year)
	end := fmt.Sprintf("%d-12-31", year)
	rows, err := tx.Query(ctx, `
		select e.id, e.employee_no, e.full_name, e.base_salary::float8,
		  coalesce((
		    select sum(pl.amount)::float8
		    from public.hr_payslips ps
		    join public.hr_payslip_lines pl on pl.payslip_id = ps.id
		    join public.hr_pay_periods pp on pp.id = ps.pay_period_id
		    where ps.tenant_id = e.tenant_id and ps.employee_id = e.id
		      and ps.status = 'posted' and pl.line_code = 'BASIC'
		      and pp.period_start >= $2::date and pp.period_end <= $3::date
		      and coalesce(pp.run_type, 'regular') = 'regular'
		  ), 0),
		  coalesce((
		    select count(distinct date_trunc('month', pp.period_start))::float8
		    from public.hr_payslips ps
		    join public.hr_pay_periods pp on pp.id = ps.pay_period_id
		    where ps.tenant_id = e.tenant_id and ps.employee_id = e.id
		      and ps.status = 'posted'
		      and pp.period_start >= $2::date and pp.period_end <= $3::date
		      and coalesce(pp.run_type, 'regular') = 'regular'
		  ), 0)
		from public.hr_employees e
		where e.tenant_id = $1 and e.status in ('active', 'terminated') and e.base_salary > 0
		order by e.full_name`, tenantID, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []specialRunPreviewRow
	for rows.Next() {
		var row specialRunPreviewRow
		if err := rows.Scan(&row.EmployeeID, &row.EmployeeNo, &row.EmployeeName, &row.BaseSalary, &row.YTDBasic, &row.MonthsWorked); err != nil {
			return nil, err
		}
		if row.YTDBasic <= 0 && row.MonthsWorked > 0 {
			row.YTDBasic = roundMoney(row.BaseSalary * row.MonthsWorked)
			row.Notes = "Estimated from base salary × months with payslips"
		}
		row.Amount = roundMoney(row.YTDBasic / 12)
		if row.Amount <= 0 {
			continue
		}
		out = append(out, row)
	}
	return out, nil
}

func previewThirteenth(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body specialRunBody
		_ = json.NewDecoder(r.Body).Decode(&body)
		year := body.Year
		if year < 2000 {
			year = time.Now().Year()
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to preview.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		rows, err := computeThirteenthRows(r.Context(), tx, tu.TenantID, year)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to compute 13th month.", "ERR_INTERNAL")
			return
		}
		var total float64
		for _, row := range rows {
			total += row.Amount
		}
		response.OK(w, specialRunResult{
			RunType: "thirteenth", PayslipCount: len(rows), TotalGross: roundMoney(total), TotalNet: roundMoney(total), Employees: rows,
		}, "13th month preview (basic earned / 12).")
	}
}

func runThirteenth(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body specialRunBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		year := body.Year
		if year < 2000 {
			year = time.Now().Year()
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to run 13th month.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		rows, err := computeThirteenthRows(r.Context(), tx, tu.TenantID, year)
		if err != nil || len(rows) == 0 {
			response.Validation(w, map[string]string{"employees": "No eligible employees for 13th month."})
			return
		}
		label := strings.TrimSpace(body.PeriodLabel)
		if label == "" {
			label = fmt.Sprintf("13th Month %d", year)
		}
		start := time.Date(year, 12, 1, 0, 0, 0, 0, time.UTC)
		end := time.Date(year, 12, 31, 0, 0, 0, 0, time.UTC)
		var periodID int64
		if err := tx.QueryRow(r.Context(), `
			insert into public.hr_pay_periods (tenant_id, period_label, period_start, period_end, run_type)
			values ($1,$2,$3,$4,'thirteenth') returning id`,
			tu.TenantID, label, start, end).Scan(&periodID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create pay period.", "ERR_INTERNAL")
			return
		}
		var totalGross, totalNet float64
		for _, row := range rows {
			amt := row.Amount
			var payslipID int64
			if err := tx.QueryRow(r.Context(), `
				insert into public.hr_payslips (tenant_id, pay_period_id, employee_id, gross_pay, deductions, net_pay, status)
				values ($1,$2,$3,$4,0,$4,'draft') returning id`,
				tu.TenantID, periodID, row.EmployeeID, amt).Scan(&payslipID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to create payslip.", "ERR_INTERNAL")
				return
			}
			if _, err := tx.Exec(r.Context(), `
				insert into public.hr_payslip_lines (payslip_id, line_no, line_type, line_code, description, amount)
				values ($1,1,'earning','THIRTEENTH',$2,$3)`,
				payslipID, fmt.Sprintf("13th month pay %d", year), amt); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to create payslip line.", "ERR_INTERNAL")
				return
			}
			totalGross += amt
			totalNet += amt
		}
		totalGross = roundMoney(totalGross)
		totalNet = roundMoney(totalNet)
		jeID, err := postPayrollAccrualJE(r.Context(), tx, tu.TenantID, periodID, totalGross, 0, totalNet, tu.AppUserID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to post accrual.", "ERR_INTERNAL")
			return
		}
		_, _ = tx.Exec(r.Context(), `update public.hr_payslips set status='posted', journal_entry_id=$3, updated_at=now() where pay_period_id=$1 and tenant_id=$2`, periodID, tu.TenantID, jeID)
		_, _ = tx.Exec(r.Context(), `update public.hr_pay_periods set status='processed', updated_at=now() where id=$1`, periodID)
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "hr.thirteenth_run", "hr_pay_period", &periodID, nil, body)
		response.OK(w, specialRunResult{
			RunType: "thirteenth", PayPeriodID: periodID, PayslipCount: len(rows),
			TotalGross: totalGross, TotalNet: totalNet, Employees: rows, JournalEntryID: &jeID,
		}, "13th month run complete.")
	}
}

func computeFinalPayRow(ctx context.Context, tx pgx.Tx, tenantID, empID int64, separationDate time.Time) (specialRunPreviewRow, error) {
	var row specialRunPreviewRow
	var hireDate time.Time
	err := tx.QueryRow(ctx, `
		select id, employee_no, full_name, base_salary::float8, hire_date
		from public.hr_employees where id=$1 and tenant_id=$2`, empID, tenantID,
	).Scan(&row.EmployeeID, &row.EmployeeNo, &row.EmployeeName, &row.BaseSalary, &hireDate)
	if err != nil {
		return row, err
	}
	// Pro-rate last month: days worked in separation month / days in month × basic
	daysInMonth := float64(time.Date(separationDate.Year(), separationDate.Month()+1, 0, 0, 0, 0, 0, time.UTC).Day())
	dayWorked := float64(separationDate.Day())
	lastMonth := roundMoney(row.BaseSalary * (dayWorked / daysInMonth))
	unusedLeaveDays, _ := sumCashableLeaveDays(ctx, tx, tenantID, empID, separationDate)
	dailyRate := roundMoney(row.BaseSalary / daysInMonth)
	unusedLeave := roundMoney(unusedLeaveDays * dailyRate)
	months := int(separationDate.Month())
	if hireDate.Year() == separationDate.Year() {
		months = int(separationDate.Month()) - int(hireDate.Month()) + 1
		if months < 1 {
			months = 1
		}
	}
	thirteenth := roundMoney(row.BaseSalary * float64(months) / 12)
	row.Amount = roundMoney(lastMonth + unusedLeave + thirteenth)
	row.YTDBasic = lastMonth
	row.MonthsWorked = float64(months)
	row.Notes = fmt.Sprintf("Last month pro-rate ₱%.2f + leave cash-out ₱%.2f (%.2f days) + 13th pro-rate ₱%.2f", lastMonth, unusedLeave, unusedLeaveDays, thirteenth)
	return row, nil
}

func previewFinalPay(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body specialRunBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.EmployeeID == nil || *body.EmployeeID <= 0 {
			response.Validation(w, map[string]string{"employee_id": "Required."})
			return
		}
		sep, err := parseDate(body.SeparationDate)
		if err != nil {
			sep = time.Now()
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to preview.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		row, err := computeFinalPayRow(r.Context(), tx, tu.TenantID, *body.EmployeeID, sep)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Employee not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, specialRunResult{
			RunType: "final_pay", PayslipCount: 1, TotalGross: row.Amount, TotalNet: row.Amount,
			Employees: []specialRunPreviewRow{row},
		}, "Final pay preview.")
	}
}

func runFinalPay(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body specialRunBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.EmployeeID == nil || *body.EmployeeID <= 0 {
			response.Validation(w, map[string]string{"employee_id": "Required."})
			return
		}
		sep, err := parseDate(body.SeparationDate)
		if err != nil {
			sep = time.Now()
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to run final pay.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		row, err := computeFinalPayRow(r.Context(), tx, tu.TenantID, *body.EmployeeID, sep)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Employee not found.", "ERR_NOT_FOUND")
			return
		}
		unusedLeaveDays, _ := sumCashableLeaveDays(r.Context(), tx, tu.TenantID, *body.EmployeeID, sep)
		if err := cashOutLeaveOnFinalPay(r.Context(), tx, tu.TenantID, *body.EmployeeID, tu.AppUserID, sep, unusedLeaveDays); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to cash out leave.", "ERR_INTERNAL")
			return
		}
		label := strings.TrimSpace(body.PeriodLabel)
		if label == "" {
			label = fmt.Sprintf("Final pay — %s", row.EmployeeName)
		}
		var periodID int64
		if err := tx.QueryRow(r.Context(), `
			insert into public.hr_pay_periods (tenant_id, period_label, period_start, period_end, run_type)
			values ($1,$2,$3,$3,'final_pay') returning id`,
			tu.TenantID, label, sep).Scan(&periodID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create pay period.", "ERR_INTERNAL")
			return
		}
		var payslipID int64
		if err := tx.QueryRow(r.Context(), `
			insert into public.hr_payslips (tenant_id, pay_period_id, employee_id, gross_pay, deductions, net_pay, status)
			values ($1,$2,$3,$4,0,$4,'draft') returning id`,
			tu.TenantID, periodID, row.EmployeeID, row.Amount).Scan(&payslipID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create payslip.", "ERR_INTERNAL")
			return
		}
		if _, err := tx.Exec(r.Context(), `
			insert into public.hr_payslip_lines (payslip_id, line_no, line_type, line_code, description, amount)
			values ($1,1,'earning','FINAL_PAY',$2,$3)`,
			payslipID, row.Notes, row.Amount); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create payslip line.", "ERR_INTERNAL")
			return
		}
		_, _ = tx.Exec(r.Context(), `update public.hr_employees set status='terminated', updated_at=now() where id=$1 and tenant_id=$2`, row.EmployeeID, tu.TenantID)
		jeID, err := postPayrollAccrualJE(r.Context(), tx, tu.TenantID, periodID, row.Amount, 0, row.Amount, tu.AppUserID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to post accrual.", "ERR_INTERNAL")
			return
		}
		_, _ = tx.Exec(r.Context(), `update public.hr_payslips set status='posted', journal_entry_id=$3 where pay_period_id=$1 and tenant_id=$2`, periodID, tu.TenantID, jeID)
		_, _ = tx.Exec(r.Context(), `update public.hr_pay_periods set status='processed' where id=$1`, periodID)
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "hr.final_pay_run", "hr_pay_period", &periodID, nil, body)
		response.OK(w, specialRunResult{
			RunType: "final_pay", PayPeriodID: periodID, PayslipCount: 1,
			TotalGross: row.Amount, TotalNet: row.Amount, Employees: []specialRunPreviewRow{row}, JournalEntryID: &jeID,
		}, "Final pay posted; employee marked terminated.")
	}
}
