package hr

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func registerPayrollDepthRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("hr.payroll_runs", auth.AccessWrite)).Post("/pay-periods/{id}/lock", lockPayPeriod(pool))
	r.With(auth.RequirePermission("hr.payroll_runs", auth.AccessWrite)).Post("/pay-periods/{id}/unlock", unlockPayPeriod(pool))
	r.With(auth.RequirePermission("hr.payroll_runs", auth.AccessRead)).Get("/pay-periods/{id}/bank-export", exportBankPayout(pool))
	r.With(auth.RequirePermission("hr.payroll_runs", auth.AccessRead)).Get("/pay-periods/{id}/preview-checklist", previewChecklist(pool))
	r.With(auth.RequirePermission("hr.employees", auth.AccessRead)).Get("/employees/{id}/tax-certificate", taxCertificatePack(pool))
	r.With(auth.RequirePermission("hr.remittances", auth.AccessRead)).Get("/export-packs/1601c", export1601CPack(pool))
}

func lockPayPeriod(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.hr_pay_periods
			set locked_at=now(), locked_by_user_id=$3, updated_at=now()
			where id=$1 and tenant_id=$2 and locked_at is null`, id, tu.TenantID, tu.AppUserID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusConflict, "Period not found or already locked.", "ERR_CONFLICT")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "hr.period.lock", "hr_pay_period", &id, nil, nil)
		response.OK(w, map[string]any{"id": id, "locked": true}, "Period locked.")
	}
}

func unlockPayPeriod(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.hr_pay_periods
			set locked_at=null, locked_by_user_id=null, updated_at=now()
			where id=$1 and tenant_id=$2 and locked_at is not null`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusConflict, "Period not found or not locked.", "ERR_CONFLICT")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "hr.period.unlock", "hr_pay_period", &id, nil, nil)
		response.OK(w, map[string]any{"id": id, "locked": false}, "Period unlocked.")
	}
}

func exportBankPayout(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		periodID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || periodID <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		format := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("format")))
		if format == "" {
			format = "generic_csv"
		}
		var label string
		if err := pool.QueryRow(r.Context(), `
			select period_label from public.hr_pay_periods where id=$1 and tenant_id=$2`, periodID, tu.TenantID).Scan(&label); err != nil {
			response.Err(w, http.StatusNotFound, "Pay period not found.", "ERR_NOT_FOUND")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select e.employee_no, e.full_name, coalesce(e.bank_name,''), coalesce(e.bank_account_no,''),
			  ps.net_pay::float8, ps.status
			from public.hr_payslips ps
			join public.hr_employees e on e.id=ps.employee_id
			where ps.tenant_id=$1 and ps.pay_period_id=$2 and ps.status='posted'
			order by e.employee_no`, tu.TenantID, periodID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load payslips.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="bank_payout_%d_%s.csv"`, periodID, format))
		cw := csv.NewWriter(w)
		switch format {
		case "bdo_style":
			_ = cw.Write([]string{"AccountNumber", "Amount", "Particulars", "EmployeeNo", "EmployeeName", "BankName"})
		case "bpi_style":
			_ = cw.Write([]string{"PayeeAccount", "Amount", "PaymentDetails", "EmployeeNo", "Name"})
		default:
			_ = cw.Write([]string{"employee_no", "employee_name", "bank_name", "bank_account_no", "net_pay", "period_label", "format_note"})
		}
		for rows.Next() {
			var no, name, bank, acct, status string
			var net float64
			_ = rows.Scan(&no, &name, &bank, &acct, &net, &status)
			particulars := fmt.Sprintf("Payroll %s", label)
			switch format {
			case "bdo_style":
				_ = cw.Write([]string{acct, fmt.Sprintf("%.2f", net), particulars, no, name, bank})
			case "bpi_style":
				_ = cw.Write([]string{acct, fmt.Sprintf("%.2f", net), particulars, no, name})
			default:
				_ = cw.Write([]string{no, name, bank, acct, fmt.Sprintf("%.2f", net), label, "generic_csv — map columns per your bank template guide"})
			}
		}
		cw.Flush()
	}
}

func previewChecklist(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		periodID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || periodID <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		type issue struct {
			EmployeeID   int64  `json:"employee_id"`
			EmployeeNo   string `json:"employee_no"`
			EmployeeName string `json:"employee_name"`
			Code         string `json:"code"`
			Message      string `json:"message"`
		}
		issues := []issue{}
		rows, err := pool.Query(r.Context(), `
			select e.id, e.employee_no, e.full_name, coalesce(e.tin,''), coalesce(e.bank_account_no,''),
			  coalesce(ps.net_pay, e.base_salary)::float8
			from public.hr_employees e
			left join public.hr_payslips ps on ps.employee_id=e.id and ps.pay_period_id=$2
			where e.tenant_id=$1 and e.status='active'`, tu.TenantID, periodID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed checklist.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		for rows.Next() {
			var eid int64
			var no, name, tin, bank string
			var net float64
			_ = rows.Scan(&eid, &no, &name, &tin, &bank, &net)
			if strings.TrimSpace(tin) == "" {
				issues = append(issues, issue{eid, no, name, "missing_tin", "TIN is blank"})
			}
			if strings.TrimSpace(bank) == "" {
				issues = append(issues, issue{eid, no, name, "missing_bank", "Bank account is blank"})
			}
			if net < 0 {
				issues = append(issues, issue{eid, no, name, "negative_net", "Negative net pay"})
			}
		}
		lrows, _ := pool.Query(r.Context(), `
			select lr.employee_id, e.employee_no, e.full_name
			from public.hr_leave_requests lr
			join public.hr_employees e on e.id=lr.employee_id
			join public.hr_pay_periods pp on pp.id=$2 and pp.tenant_id=$1
			where lr.tenant_id=$1 and lr.status='submitted'
			  and lr.date_from <= pp.period_end and lr.date_to >= pp.period_start`, tu.TenantID, periodID)
		if lrows != nil {
			defer lrows.Close()
			for lrows.Next() {
				var eid int64
				var no, name string
				_ = lrows.Scan(&eid, &no, &name)
				issues = append(issues, issue{eid, no, name, "uncleared_leave", "Submitted leave still pending approval in period"})
			}
		}
		response.OK(w, map[string]any{"period_id": periodID, "issues": issues, "ok": len(issues) == 0}, "OK")
	}
}

func taxCertificatePack(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		empID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || empID <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		year := time.Now().Year()
		if y := strings.TrimSpace(r.URL.Query().Get("year")); y != "" {
			if n, err := strconv.Atoi(y); err == nil {
				year = n
			}
		}
		var no, name, tin, taxStatus string
		if err := pool.QueryRow(r.Context(), `
			select employee_no, full_name, coalesce(tin,''), coalesce(tax_status,'')
			from public.hr_employees where id=$1 and tenant_id=$2`, empID, tu.TenantID,
		).Scan(&no, &name, &tin, &taxStatus); err != nil {
			response.Err(w, http.StatusNotFound, "Employee not found.", "ERR_NOT_FOUND")
			return
		}
		var gross, ded, net, wht float64
		_ = pool.QueryRow(r.Context(), `
			select coalesce(sum(ps.gross_pay),0)::float8, coalesce(sum(ps.deductions),0)::float8, coalesce(sum(ps.net_pay),0)::float8,
			  coalesce((select sum(pl.amount) from public.hr_payslip_lines pl
			    join public.hr_payslips p2 on p2.id=pl.payslip_id
			    join public.hr_pay_periods pp2 on pp2.id=p2.pay_period_id
			    where p2.employee_id=$1 and p2.tenant_id=$2 and p2.status='posted'
			      and extract(year from pp2.period_end)=$3 and pl.line_code in ('WHT','WITHHOLDING_TAX')),0)::float8
			from public.hr_payslips ps
			join public.hr_pay_periods pp on pp.id=ps.pay_period_id
			where ps.employee_id=$1 and ps.tenant_id=$2 and ps.status='posted'
			  and extract(year from pp.period_end)=$3`, empID, tu.TenantID, year,
		).Scan(&gross, &ded, &net, &wht)

		html := fmt.Sprintf(`<!DOCTYPE html><html><head><title>2316-style pack %d</title></head><body>
<h1>Employee annual withholding certificate data (2316-equivalent field pack)</h1>
<p><em>Not a certified BIR eFPS submission. Accountant must review before filing.</em></p>
<table border="1" cellpadding="6">
<tr><th>Tax year</th><td>%d</td></tr>
<tr><th>Employee no</th><td>%s</td></tr>
<tr><th>Name</th><td>%s</td></tr>
<tr><th>TIN</th><td>%s</td></tr>
<tr><th>Tax status</th><td>%s</td></tr>
<tr><th>Gross compensation (YTD)</th><td>%.2f</td></tr>
<tr><th>Deductions (YTD)</th><td>%.2f</td></tr>
<tr><th>Net pay (YTD)</th><td>%.2f</td></tr>
<tr><th>Withholding tax (YTD)</th><td>%.2f</td></tr>
</table>
</body></html>`, year, year, no, name, tin, taxStatus, gross, ded, net, wht)

		if r.URL.Query().Get("format") == "json" {
			response.OK(w, map[string]any{
				"profile":             "2316_field_pack_v1",
				"certified_efps":      false,
				"tax_year":            year,
				"employee_no":         no,
				"full_name":           name,
				"tin":                 tin,
				"tax_status":          taxStatus,
				"gross_ytd":           gross,
				"deductions_ytd":      ded,
				"net_ytd":             net,
				"withholding_tax_ytd": wht,
				"html":                html,
			}, "2316-equivalent pack (not certified eFPS).")
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(html))
	}
}

func export1601CPack(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		month := strings.TrimSpace(r.URL.Query().Get("month"))
		if month == "" {
			month = time.Now().Format("2006-01")
		}
		rows, err := pool.Query(r.Context(), `
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
			order by e.employee_no`, tu.TenantID, month)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to build pack.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="1601C_spreadsheet_pack_%s.csv"`, month))
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"profile", "1601-C spreadsheet pack (not certified eFPS)"})
		_ = cw.Write([]string{"month", month})
		_ = cw.Write([]string{"employee_no", "full_name", "tin", "gross", "deductions", "withholding_tax"})
		for rows.Next() {
			var no, name, tin string
			var gross, ded, wht float64
			_ = rows.Scan(&no, &name, &tin, &gross, &ded, &wht)
			_ = cw.Write([]string{no, name, tin, fmt.Sprintf("%.2f", gross), fmt.Sprintf("%.2f", ded), fmt.Sprintf("%.2f", wht)})
		}
		cw.Flush()
	}
}

func isPayPeriodLocked(r *http.Request, pool *pgxpool.Pool, tenantID, periodID int64) bool {
	var locked *time.Time
	_ = pool.QueryRow(r.Context(), `
		select locked_at from public.hr_pay_periods where id=$1 and tenant_id=$2`, periodID, tenantID).Scan(&locked)
	return locked != nil
}
