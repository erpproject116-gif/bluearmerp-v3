package hr

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/fiscalyear"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/ledger"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type PayPeriod struct {
	ID          int64  `json:"id"`
	PeriodLabel string `json:"period_label"`
	PeriodStart string `json:"period_start"`
	PeriodEnd   string `json:"period_end"`
	Status      string `json:"status"`
}

type Payslip struct {
	ID             int64          `json:"id"`
	PayPeriodID    int64          `json:"pay_period_id"`
	PeriodLabel    string         `json:"period_label,omitempty"`
	EmployeeID     int64          `json:"employee_id"`
	EmployeeNo     string         `json:"employee_no,omitempty"`
	EmployeeName   string         `json:"employee_name,omitempty"`
	GrossPay       float64        `json:"gross_pay"`
	Deductions     float64        `json:"deductions"`
	NetPay         float64        `json:"net_pay"`
	Status         string         `json:"status"`
	JournalEntryID *int64         `json:"journal_entry_id,omitempty"`
	Lines          []PayslipLine  `json:"lines,omitempty"`
}

type PayslipLine struct {
	ID          int64   `json:"id"`
	LineNo      int     `json:"line_no"`
	LineType    string  `json:"line_type"`
	LineCode    string  `json:"line_code,omitempty"`
	Description string  `json:"description"`
	Amount      float64 `json:"amount"`
}

type payrollRunBody struct {
	PeriodStart string `json:"period_start"`
	PeriodEnd   string `json:"period_end"`
	PeriodLabel string `json:"period_label"`
	PayPeriodID *int64 `json:"pay_period_id"`
}

type payrollRunResult struct {
	PayPeriodID    int64     `json:"pay_period_id"`
	PayslipCount   int       `json:"payslip_count"`
	TotalGross     float64   `json:"total_gross"`
	TotalNet       float64   `json:"total_net"`
	JournalEntryID *int64    `json:"journal_entry_id,omitempty"`
	Payslips       []Payslip `json:"payslips,omitempty"`
}

func registerPayrollRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("hr.payroll_runs", auth.AccessRead)).Get("/pay-periods", listPayPeriods(pool))
	r.With(auth.RequirePermission("hr.payroll_runs", auth.AccessRead)).Get("/payslips", listPayslips(pool))
	r.With(auth.RequirePermission("hr.payroll_runs", auth.AccessRead)).Post("/payroll-runs/preview", previewPayroll(pool))
	r.With(auth.RequirePermission("hr.payroll_runs", auth.AccessWrite)).Post("/payroll-runs", runPayroll(pool))
	registerPayrollCSVRoutes(r, pool)
}

func listPayPeriods(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "period_start", map[string]string{"period_start": "pp.period_start"})
		offset := httputil.Offset(p)
		rows, err := pool.Query(r.Context(), `
			select id, period_label, period_start::text, period_end::text, status, count(*) over()
			from public.hr_pay_periods
			where tenant_id = $1
			order by period_start desc
			limit $2 offset $3`, tu.TenantID, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list pay periods.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []PayPeriod
		var total int64
		for rows.Next() {
			var row PayPeriod
			if err := rows.Scan(&row.ID, &row.PeriodLabel, &row.PeriodStart, &row.PeriodEnd, &row.Status, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read pay period.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []PayPeriod{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func listPayslips(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "id", map[string]string{"id": "ps.id"})
		offset := httputil.Offset(p)
		where := "ps.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if pid := strings.TrimSpace(r.URL.Query().Get("pay_period_id")); pid != "" {
			where += fmt.Sprintf(" and ps.pay_period_id = $%d", n)
			args = append(args, pid)
			n++
		}
		q := fmt.Sprintf(`
			select ps.id, ps.pay_period_id, pp.period_label, ps.employee_id, e.employee_no, e.full_name,
			  ps.gross_pay::float8, ps.deductions::float8, ps.net_pay::float8, ps.status, ps.journal_entry_id,
			  count(*) over()
			from public.hr_payslips ps
			join public.hr_pay_periods pp on pp.id = ps.pay_period_id
			join public.hr_employees e on e.id = ps.employee_id
			where %s order by e.full_name asc limit $%d offset $%d`, where, n, n+1)
		args = append(args, p.PageSize, offset)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list payslips.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []Payslip
		var total int64
		for rows.Next() {
			var row Payslip
			if err := rows.Scan(&row.ID, &row.PayPeriodID, &row.PeriodLabel, &row.EmployeeID, &row.EmployeeNo, &row.EmployeeName,
				&row.GrossPay, &row.Deductions, &row.NetPay, &row.Status, &row.JournalEntryID, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read payslip.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []Payslip{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

type payrollPreviewRow struct {
	EmployeeID     int64   `json:"employee_id"`
	EmployeeNo     string  `json:"employee_no"`
	EmployeeName   string  `json:"employee_name"`
	BaseSalary     float64 `json:"base_salary"`
	PremiumTotal   float64 `json:"premium_total"`
	DTRDays        int     `json:"dtr_days"`
	GrossPay       float64 `json:"gross_pay"`
	Deductions     float64 `json:"deductions"`
	NetPay         float64 `json:"net_pay"`
}

type payrollPreviewResult struct {
	PeriodStart  string              `json:"period_start"`
	PeriodEnd    string              `json:"period_end"`
	EmployeeCount int                `json:"employee_count"`
	TotalGross   float64             `json:"total_gross"`
	TotalNet     float64             `json:"total_net"`
	Employees    []payrollPreviewRow `json:"employees"`
}

func previewPayroll(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body payrollRunBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		start, err := parseDate(body.PeriodStart)
		if err != nil {
			response.Validation(w, map[string]string{"period_start": "Invalid period start."})
			return
		}
		end, err := parseDate(body.PeriodEnd)
		if err != nil {
			response.Validation(w, map[string]string{"period_end": "Invalid period end."})
			return
		}
		if end.Before(start) {
			response.Validation(w, map[string]string{"period_end": "Period end must be on or after start."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to preview payroll.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		empRows, err := tx.Query(r.Context(), `
			select id, employee_no, full_name, base_salary::float8
			from public.hr_employees
			where tenant_id = $1 and status = 'active' and base_salary > 0
			order by full_name`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load employees.", "ERR_INTERNAL")
			return
		}
		defer empRows.Close()

		var rows []payrollPreviewRow
		var totalGross, totalNet float64
		for empRows.Next() {
			var empID int64
			var empNo, empName string
			var baseSalary float64
			if err := empRows.Scan(&empID, &empNo, &empName, &baseSalary); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read employee.", "ERR_INTERNAL")
				return
			}
			draft, err := buildEmployeePayslipDraft(r.Context(), tx, tu.TenantID, empID, empNo, empName, baseSalary, start, end)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to compute payslip preview.", "ERR_INTERNAL")
				return
			}
			rows = append(rows, payrollPreviewRow{
				EmployeeID: empID, EmployeeNo: empNo, EmployeeName: empName,
				BaseSalary: baseSalary, PremiumTotal: draft.PremiumTotal, DTRDays: draft.DTRDays,
				GrossPay: draft.GrossPay, Deductions: draft.Deductions, NetPay: draft.NetPay,
			})
			totalGross += draft.GrossPay
			totalNet += draft.NetPay
		}
		if rows == nil {
			rows = []payrollPreviewRow{}
		}
		response.OK(w, payrollPreviewResult{
			PeriodStart: start.Format("2006-01-02"), PeriodEnd: end.Format("2006-01-02"),
			EmployeeCount: len(rows), TotalGross: roundMoney(totalGross), TotalNet: roundMoney(totalNet),
			Employees: rows,
		}, "Payroll preview (includes DTR OT, night diff, and holiday premiums).")
	}
}

func runPayroll(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body payrollRunBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to run payroll.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var periodID int64
		if body.PayPeriodID != nil && *body.PayPeriodID > 0 {
			periodID = *body.PayPeriodID
			var status string
			var lockedAt *time.Time
			if err := tx.QueryRow(r.Context(), `select status, locked_at from public.hr_pay_periods where id=$1 and tenant_id=$2`, periodID, tu.TenantID).Scan(&status, &lockedAt); err != nil {
				response.Err(w, http.StatusNotFound, "Pay period not found.", "ERR_NOT_FOUND")
				return
			}
			if lockedAt != nil {
				response.Err(w, http.StatusConflict, "Pay period is locked. Unlock before re-running.", "ERR_CONFLICT")
				return
			}
			if status == "processed" {
				response.Validation(w, map[string]string{"pay_period_id": "Pay period already processed."})
				return
			}
		} else {
			start, err := parseDate(body.PeriodStart)
			if err != nil {
				response.Validation(w, map[string]string{"period_start": "Invalid period start."})
				return
			}
			end, err := parseDate(body.PeriodEnd)
			if err != nil {
				response.Validation(w, map[string]string{"period_end": "Invalid period end."})
				return
			}
			if end.Before(start) {
				response.Validation(w, map[string]string{"period_end": "Period end must be on or after start."})
				return
			}
			label := strings.TrimSpace(body.PeriodLabel)
			if label == "" {
				label = fmt.Sprintf("%s – %s", start.Format("Jan 2, 2006"), end.Format("Jan 2, 2006"))
			}
			if err := tx.QueryRow(r.Context(), `
				insert into public.hr_pay_periods (tenant_id, period_label, period_start, period_end)
				values ($1,$2,$3,$4) returning id`,
				tu.TenantID, label, start, end).Scan(&periodID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to create pay period.", "ERR_INTERNAL")
				return
			}
		}

		empRows, err := tx.Query(r.Context(), `
			select id, employee_no, full_name, base_salary::float8
			from public.hr_employees
			where tenant_id = $1 and status = 'active' and base_salary > 0
			order by full_name`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load employees.", "ERR_INTERNAL")
			return
		}
		defer empRows.Close()

		var payslips []Payslip
		var totalGross, totalNet, totalEmployer float64
		var periodStart, periodEnd time.Time
		_ = tx.QueryRow(r.Context(), `select period_start, period_end from public.hr_pay_periods where id=$1`, periodID).Scan(&periodStart, &periodEnd)
		if periodEnd.IsZero() {
			periodEnd = time.Now()
		}
		if periodStart.IsZero() {
			periodStart = periodEnd
		}

		for empRows.Next() {
			var empID int64
			var empNo, empName string
			var baseSalary float64
			if err := empRows.Scan(&empID, &empNo, &empName, &baseSalary); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read employee.", "ERR_INTERNAL")
				return
			}
			draft, err := buildEmployeePayslipDraft(r.Context(), tx, tu.TenantID, empID, empNo, empName, baseSalary, periodStart, periodEnd)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to compute payslip.", "ERR_INTERNAL")
				return
			}
			grossPay := draft.GrossPay
			deduction := draft.Deductions
			net := draft.NetPay
			var payslipID int64
			if err := tx.QueryRow(r.Context(), `
				insert into public.hr_payslips (tenant_id, pay_period_id, employee_id, gross_pay, deductions, net_pay, status)
				values ($1,$2,$3,$4,$5,$6,'draft') returning id`,
				tu.TenantID, periodID, empID, grossPay, deduction, net).Scan(&payslipID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to create payslip.", "ERR_INTERNAL")
				return
			}
			var psLines []PayslipLine
			for _, ln := range draft.Lines {
				var lineID int64
				if err := tx.QueryRow(r.Context(), `
					insert into public.hr_payslip_lines (payslip_id, line_no, line_type, line_code, description, amount)
					values ($1,$2,$3,$4,$5,$6) returning id`,
					payslipID, ln.LineNo, ln.LineType, ln.LineCode, ln.Description, ln.Amount).Scan(&lineID); err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to create payslip line.", "ERR_INTERNAL")
					return
				}
				psLines = append(psLines, PayslipLine{
					ID: lineID, LineNo: ln.LineNo, LineType: ln.LineType, LineCode: ln.LineCode, Description: ln.Description, Amount: ln.Amount,
				})
			}
			payslips = append(payslips, Payslip{
				ID: payslipID, PayPeriodID: periodID, EmployeeID: empID, EmployeeNo: empNo, EmployeeName: empName,
				GrossPay: grossPay, Deductions: deduction, NetPay: net, Status: "draft", Lines: psLines,
			})
			totalGross += grossPay
			totalNet += net
			totalEmployer += draft.EmployerShare
		}
		if len(payslips) == 0 {
			response.Validation(w, map[string]string{"employees": "No active employees with base salary."})
			return
		}
		totalGross = roundMoney(totalGross)
		totalNet = roundMoney(totalNet)

		var journalEntryID int64
		if journalEntryID, err = postPayrollAccrualJE(r.Context(), tx, tu.TenantID, periodID, totalGross, totalEmployer, totalNet, tu.AppUserID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to post payroll accrual.", "ERR_INTERNAL")
			return
		}

		if _, err := tx.Exec(r.Context(), `
			update public.hr_payslips set status = 'posted', journal_entry_id = $3, updated_at = now()
			where pay_period_id = $1 and tenant_id = $2`, periodID, tu.TenantID, journalEntryID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update payslips.", "ERR_INTERNAL")
			return
		}
		if _, err := tx.Exec(r.Context(), `
			update public.hr_pay_periods set status = 'processed', updated_at = now()
			where id = $1 and tenant_id = $2`, periodID, tu.TenantID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update pay period.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save payroll run.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "hr.payroll_run", "hr_pay_period", &periodID, nil, body)
		for i := range payslips {
			payslips[i].Status = "posted"
			payslips[i].JournalEntryID = &journalEntryID
		}
		response.OK(w, payrollRunResult{
			PayPeriodID: periodID, PayslipCount: len(payslips), TotalGross: totalGross, TotalNet: totalNet,
			JournalEntryID: &journalEntryID, Payslips: payslips,
		}, "Payroll run complete.")
	}
}

func postPayrollAccrualJE(ctx context.Context, tx pgx.Tx, tenantID, periodID int64, totalGross, totalEmployer, totalNet float64, userID int64) (int64, error) {
	eeDeductions := roundMoney(totalGross - totalNet)
	// Prefer splitting EE statutory (2050) vs WHT (2051) when chart accounts exist.
	var wht float64
	_ = tx.QueryRow(ctx, `
		select coalesce(sum(pl.amount),0)::float8
		from public.hr_payslip_lines pl
		join public.hr_payslips ps on ps.id = pl.payslip_id
		where ps.tenant_id=$1 and ps.pay_period_id=$2 and pl.line_code in ('WHT','WITHHOLDING_TAX')`,
		tenantID, periodID).Scan(&wht)
	if wht < 0 {
		wht = 0
	}
	if wht > eeDeductions {
		wht = eeDeductions
	}
	statEE := roundMoney(eeDeductions - wht)

	has2051 := false
	var dummy int64
	if err := tx.QueryRow(ctx, `
		select id from public.fin_accounts where tenant_id=$1 and account_code='2051' and deleted_at is null`, tenantID).Scan(&dummy); err == nil {
		has2051 = true
	}

	lines := []ledger.PostingLine{
		{AccountCode: "5210", Debit: totalGross, Remarks: "Payroll salaries"},
	}
	if totalEmployer > 0 {
		lines = append(lines, ledger.PostingLine{AccountCode: "5110", Debit: totalEmployer, Remarks: "Employer SSS/PHIC/HDMF"})
		lines = append(lines, ledger.PostingLine{AccountCode: "2050", Credit: totalEmployer, Remarks: "Employer contributions payable"})
	}
	if has2051 && wht > 0 {
		if statEE > 0 {
			lines = append(lines, ledger.PostingLine{AccountCode: "2050", Credit: statEE, Remarks: "EE statutory payable"})
		}
		lines = append(lines, ledger.PostingLine{AccountCode: "2051", Credit: wht, Remarks: "Withholding tax payable"})
	} else if eeDeductions > 0 {
		lines = append(lines, ledger.PostingLine{AccountCode: "2050", Credit: eeDeductions, Remarks: "EE statutory + WHT payable"})
	}
	lines = append(lines, ledger.PostingLine{AccountCode: "2120", Credit: totalNet, Remarks: "Net salaries payable"})

	var deb, cred float64
	for _, ln := range lines {
		deb += ln.Debit
		cred += ln.Credit
	}
	diff := roundMoney(deb - cred)
	if math.Abs(diff) >= 0.01 {
		if diff > 0 {
			lines = append(lines, ledger.PostingLine{AccountCode: "2120", Credit: diff, Remarks: "Payroll rounding"})
		} else {
			lines = append(lines, ledger.PostingLine{AccountCode: "5210", Debit: -diff, Remarks: "Payroll rounding"})
		}
	}

	ev := ledger.PostingEvent{TenantID: tenantID, SourceType: "payroll_run", SourceID: periodID, Lines: lines}
	if err := (ledger.AuditPoster{}).Post(ctx, tx, ev); err != nil {
		return 0, err
	}
	runDate := time.Now().UTC().Truncate(24 * time.Hour)
	if err := fiscalyear.ErrIfClosed(ctx, tx, tenantID, runDate); err != nil {
		return 0, err
	}
	var dateSeq int
	if err := tx.QueryRow(ctx, `
		select coalesce(max(date_seq), 0) + 1 from public.fin_journal_entries
		where tenant_id = $1 and entry_date = $2`, tenantID, runDate.Format("2006-01-02")).Scan(&dateSeq); err != nil {
		return 0, err
	}
	entryNo := fmt.Sprintf("PAY-%d-%03d", periodID, dateSeq)
	remarks := fmt.Sprintf("Payroll accrual period %d", periodID)
	var entryID int64
	if err := tx.QueryRow(ctx, `
		insert into public.fin_journal_entries (tenant_id, entry_date, date_seq, entry_no, status, remarks, posted_at, created_by_user_id)
		values ($1,$2,$3,$4,'posted',$5,now(),$6) returning id`,
		tenantID, runDate, dateSeq, entryNo, remarks, userID).Scan(&entryID); err != nil {
		return 0, err
	}
	lineNo := 1
	for _, ln := range lines {
		var accountID int64
		if err := tx.QueryRow(ctx, `select id from public.fin_accounts where tenant_id=$1 and account_code=$2 and deleted_at is null`, tenantID, ln.AccountCode).Scan(&accountID); err != nil {
			return 0, fmt.Errorf("account %s not found", ln.AccountCode)
		}
		if _, err := tx.Exec(ctx, `
			insert into public.fin_journal_entry_lines (journal_entry_id, line_no, account_id, debit, credit, remarks)
			values ($1,$2,$3,$4,$5,$6)`, entryID, lineNo, accountID, ln.Debit, ln.Credit, ln.Remarks); err != nil {
			return 0, err
		}
		lineNo++
	}
	return entryID, nil
}

func roundMoney(v float64) float64 {
	return float64(int64(v*10000+0.5)) / 10000
}
