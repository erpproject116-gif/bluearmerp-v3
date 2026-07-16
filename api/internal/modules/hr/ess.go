package hr

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func registerESSRoutes(r chi.Router, pool *pgxpool.Pool) {
	// Any authenticated user linked to an hr_employees.user_id can view own payslips / profile.
	r.Get("/ess/me", essMe(pool))
	r.Get("/ess/payslips", essMyPayslips(pool))
}

func essMe(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var emp Employee
		err := pool.QueryRow(r.Context(), `
			select id, employee_no, full_name, department, job_title, hire_date::text, status,
			  base_salary::float8, user_id, coalesce(email,''), notes,
			  coalesce(tin,''), coalesce(sss_no,''), coalesce(philhealth_no,''), coalesce(pagibig_no,''), coalesce(tax_status,'')
			from public.hr_employees
			where tenant_id = $1 and user_id = $2
			limit 1`, tu.TenantID, tu.AppUserID).Scan(
			&emp.ID, &emp.EmployeeNo, &emp.FullName, &emp.Department, &emp.JobTitle, &emp.HireDate, &emp.Status,
			&emp.BaseSalary, &emp.UserID, &emp.Email, &emp.Notes,
			&emp.TIN, &emp.SSSNo, &emp.PhilHealthNo, &emp.PagibigNo, &emp.TaxStatus,
		)
		if err != nil {
			response.Err(w, http.StatusNotFound, "No employee profile linked to your user. Ask HR to set user_id on your employee record.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, emp, "OK")
	}
}

func essMyPayslips(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var empID int64
		if err := pool.QueryRow(r.Context(), `
			select id from public.hr_employees where tenant_id=$1 and user_id=$2 limit 1`,
			tu.TenantID, tu.AppUserID).Scan(&empID); err != nil {
			response.Err(w, http.StatusNotFound, "No employee profile linked to your user.", "ERR_NOT_FOUND")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select ps.id, ps.pay_period_id, pp.period_label, ps.employee_id, e.employee_no, e.full_name,
			  ps.gross_pay::float8, ps.deductions::float8, ps.net_pay::float8, ps.status, ps.journal_entry_id
			from public.hr_payslips ps
			join public.hr_pay_periods pp on pp.id = ps.pay_period_id
			join public.hr_employees e on e.id = ps.employee_id
			where ps.tenant_id = $1 and ps.employee_id = $2 and ps.status = 'posted'
			order by pp.period_start desc
			limit 24`, tu.TenantID, empID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load payslips.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []Payslip
		for rows.Next() {
			var row Payslip
			if err := rows.Scan(&row.ID, &row.PayPeriodID, &row.PeriodLabel, &row.EmployeeID, &row.EmployeeNo, &row.EmployeeName,
				&row.GrossPay, &row.Deductions, &row.NetPay, &row.Status, &row.JournalEntryID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read payslip.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []Payslip{}
		}
		response.OK(w, out, "OK")
	}
}
