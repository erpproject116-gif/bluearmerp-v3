package hr

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func registerESSRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/ess/me", essMe(pool))
	r.Get("/ess/payslips", essMyPayslips(pool))
	r.Get("/ess/leave-balances", essLeaveBalances(pool))
	r.Get("/ess/leave-types", essLeaveTypes(pool))
	r.Get("/ess/leave-requests", essLeaveRequests(pool))
	r.Post("/ess/leave-requests", essCreateLeaveRequest(pool))
	r.Get("/ess/discipline", essDiscipline(pool))
	r.Post("/ess/discipline/{id}/acknowledge", essAckDiscipline(pool))
	r.Get("/ess/onboarding", essOnboarding(pool))
	r.Get("/ess/learning", essLearning(pool))
	r.Post("/ess/learning/{id}/attempt", submitQuizAttempt(pool))
	r.Get("/ess/reviews", essReviews(pool))
	r.Patch("/ess/reviews/{id}", essPatchReview(pool))
	r.Get("/ess/documents", essDocuments(pool))
	r.Get("/ess/tax-certificate", essTaxCertificate(pool))
}

func essLinkedEmployeeID(w http.ResponseWriter, r *http.Request, pool *pgxpool.Pool) (int64, bool) {
	tu, _ := auth.FromContext(r.Context())
	var empID int64
	if err := pool.QueryRow(r.Context(), `
		select id from public.hr_employees where tenant_id=$1 and user_id=$2 limit 1`,
		tu.TenantID, tu.AppUserID).Scan(&empID); err != nil {
		response.Err(w, http.StatusNotFound, "No employee profile linked to your user.", "ERR_NOT_FOUND")
		return 0, false
	}
	return empID, true
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
		empID, ok := essLinkedEmployeeID(w, r, pool)
		if !ok {
			return
		}
		tu, _ := auth.FromContext(r.Context())
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
		out := []Payslip{}
		for rows.Next() {
			var row Payslip
			if err := rows.Scan(&row.ID, &row.PayPeriodID, &row.PeriodLabel, &row.EmployeeID, &row.EmployeeNo, &row.EmployeeName,
				&row.GrossPay, &row.Deductions, &row.NetPay, &row.Status, &row.JournalEntryID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read payslip.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		response.OK(w, out, "OK")
	}
}

func essLeaveBalances(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		empID, ok := essLinkedEmployeeID(w, r, pool)
		if !ok {
			return
		}
		tu, _ := auth.FromContext(r.Context())
		year := time.Now().Year()
		rows, err := pool.Query(r.Context(), `
			select b.id, b.employee_id, b.leave_type_id, lt.code, lt.name, lt.is_cashable, b.balance_year,
			  b.opening_balance::float8, b.accrued::float8, b.used::float8, b.reserved::float8, b.adjusted::float8
			from public.hr_leave_balances b
			join public.hr_leave_types lt on lt.id=b.leave_type_id
			where b.tenant_id=$1 and b.employee_id=$2 and b.balance_year=$3
			order by lt.sort_order`, tu.TenantID, empID, year)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load balances.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []LeaveBalance{}
		for rows.Next() {
			var row LeaveBalance
			_ = rows.Scan(&row.ID, &row.EmployeeID, &row.LeaveTypeID, &row.LeaveCode, &row.LeaveName, &row.IsCashable,
				&row.BalanceYear, &row.Opening, &row.Accrued, &row.Used, &row.Reserved, &row.Adjusted)
			row.Available = availableDays(row)
			out = append(out, row)
		}
		response.OK(w, out, "OK")
	}
}

func essLeaveTypes(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := essLinkedEmployeeID(w, r, pool); !ok {
			return
		}
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, code, name from public.hr_leave_types
			where tenant_id=$1 and is_active order by sort_order, code`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load leave types.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id int64
			var code, name string
			_ = rows.Scan(&id, &code, &name)
			out = append(out, map[string]any{"id": id, "code": code, "name": name})
		}
		response.OK(w, out, "OK")
	}
}

func essLeaveRequests(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		empID, ok := essLinkedEmployeeID(w, r, pool)
		if !ok {
			return
		}
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select lr.id, lr.employee_id, lr.leave_type_id, lt.code, lt.name, lr.date_from::text, lr.date_to::text,
			  lr.days::float8, lr.status, lr.reason
			from public.hr_leave_requests lr
			join public.hr_leave_types lt on lt.id=lr.leave_type_id
			where lr.tenant_id=$1 and lr.employee_id=$2
			order by lr.created_at desc limit 50`, tu.TenantID, empID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load requests.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []LeaveRequest{}
		for rows.Next() {
			var row LeaveRequest
			_ = rows.Scan(&row.ID, &row.EmployeeID, &row.LeaveTypeID, &row.LeaveCode, &row.LeaveName,
				&row.DateFrom, &row.DateTo, &row.Days, &row.Status, &row.Reason)
			out = append(out, row)
		}
		response.OK(w, out, "OK")
	}
}

func essCreateLeaveRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		empID, ok := essLinkedEmployeeID(w, r, pool)
		if !ok {
			return
		}
		raw, err := io.ReadAll(r.Body)
		if err != nil {
			response.Validation(w, map[string]string{"body": "Invalid body."})
			return
		}
		var body map[string]any
		if err := json.Unmarshal(raw, &body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		body["employee_id"] = empID
		body["status"] = "submitted"
		patched, _ := json.Marshal(body)
		r.Body = io.NopCloser(bytes.NewReader(patched))
		createLeaveRequest(pool)(w, r)
	}
}

func essDiscipline(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		empID, ok := essLinkedEmployeeID(w, r, pool)
		if !ok {
			return
		}
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, case_no, case_type, status, subject, details, acknowledged_at::text, created_at::text
			from public.hr_discipline_cases
			where tenant_id=$1 and employee_id=$2 and status not in ('cancelled')
			order by created_at desc`, tu.TenantID, empID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load cases.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id int64
			var caseNo, caseType, status, subject, details string
			var ack, created *string
			_ = rows.Scan(&id, &caseNo, &caseType, &status, &subject, &details, &ack, &created)
			out = append(out, map[string]any{
				"id": id, "case_no": caseNo, "case_type": caseType, "status": status,
				"subject": subject, "details": details, "acknowledged_at": ack, "created_at": created,
			})
		}
		response.OK(w, out, "OK")
	}
}

func essAckDiscipline(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		empID, ok := essLinkedEmployeeID(w, r, pool)
		if !ok {
			return
		}
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.hr_discipline_cases
			set status='acknowledged', acknowledged_at=now(), updated_at=now()
			where id=$1 and tenant_id=$2 and employee_id=$3 and status in ('decided','awaiting_explanation','under_review','open')`,
			id, tu.TenantID, empID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Case not found.", "ERR_NOT_FOUND")
			return
		}
		_, _ = pool.Exec(r.Context(), `
			insert into public.hr_discipline_events (tenant_id, case_id, event_type, notes, actor_user_id)
			values ($1,$2,'acknowledged','Employee acknowledged via ESS',$3)`, tu.TenantID, id, tu.AppUserID)
		response.OK(w, map[string]any{"id": id}, "Acknowledged.")
	}
}

func essOnboarding(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		empID, ok := essLinkedEmployeeID(w, r, pool)
		if !ok {
			return
		}
		tu, _ := auth.FromContext(r.Context())
		var caseID int64
		var status string
		err := pool.QueryRow(r.Context(), `
			select id, status from public.hr_onboarding_cases where tenant_id=$1 and employee_id=$2`, tu.TenantID, empID,
		).Scan(&caseID, &status)
		if err != nil {
			response.OK(w, map[string]any{"case": nil, "tasks": []any{}}, "No onboarding case.")
			return
		}
		trows, _ := pool.Query(r.Context(), `
			select id, task_code, title, task_kind, due_date::text, status, course_id
			from public.hr_onboarding_tasks where tenant_id=$1 and case_id=$2 order by sort_order`, tu.TenantID, caseID)
		tasks := []map[string]any{}
		if trows != nil {
			defer trows.Close()
			for trows.Next() {
				var id int64
				var code, title, kind, st string
				var due *string
				var courseID *int64
				_ = trows.Scan(&id, &code, &title, &kind, &due, &st, &courseID)
				tasks = append(tasks, map[string]any{
					"id": id, "task_code": code, "title": title, "task_kind": kind,
					"due_date": due, "status": st, "course_id": courseID,
				})
			}
		}
		response.OK(w, map[string]any{"case": map[string]any{"id": caseID, "status": status}, "tasks": tasks}, "OK")
	}
}

func essLearning(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		empID, ok := essLinkedEmployeeID(w, r, pool)
		if !ok {
			return
		}
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select a.id, a.course_id, c.code, c.title, c.body_markdown, a.due_date::text, a.status, c.pass_mark::float8
			from public.hr_learning_assignments a
			join public.hr_courses c on c.id=a.course_id
			where a.tenant_id=$1 and a.employee_id=$2
			order by a.assigned_at desc`, tu.TenantID, empID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load learning.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id, courseID int64
			var code, title, body, status string
			var due *string
			var pass float64
			_ = rows.Scan(&id, &courseID, &code, &title, &body, &due, &status, &pass)
			out = append(out, map[string]any{
				"id": id, "course_id": courseID, "course_code": code, "course_title": title,
				"body_markdown": body, "due_date": due, "status": status, "pass_mark": pass,
			})
		}
		response.OK(w, out, "OK")
	}
}

func essReviews(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		empID, ok := essLinkedEmployeeID(w, r, pool)
		if !ok {
			return
		}
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, status, self_comments, manager_comments, overall_score::float8, scores_json, acknowledged_at::text
			from public.hr_performance_reviews where tenant_id=$1 and employee_id=$2
			order by created_at desc`, tu.TenantID, empID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load reviews.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id int64
			var status, selfC, mgrC string
			var score *float64
			var scores []byte
			var ack *string
			_ = rows.Scan(&id, &status, &selfC, &mgrC, &score, &scores, &ack)
			out = append(out, map[string]any{
				"id": id, "status": status, "self_comments": selfC, "manager_comments": mgrC,
				"overall_score": score, "scores_json": json.RawMessage(scores), "acknowledged_at": ack,
			})
		}
		response.OK(w, out, "OK")
	}
}

func essPatchReview(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		empID, ok := essLinkedEmployeeID(w, r, pool)
		if !ok {
			return
		}
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body struct {
			SelfComments string `json:"self_comments"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		tag, err := pool.Exec(r.Context(), `
			update public.hr_performance_reviews
			set self_comments=$4, status='self_done', updated_at=now()
			where id=$1 and tenant_id=$2 and employee_id=$3 and status in ('assigned','self_done')`,
			id, tu.TenantID, empID, strings.TrimSpace(body.SelfComments))
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Review not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Self-review saved.")
	}
}

func essDocuments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		empID, ok := essLinkedEmployeeID(w, r, pool)
		if !ok {
			return
		}
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, doc_type, title, created_at::text
			from public.hr_employee_documents
			where tenant_id=$1 and employee_id=$2
			order by created_at desc limit 100`, tu.TenantID, empID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load documents.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id int64
			var docType, title, created string
			_ = rows.Scan(&id, &docType, &title, &created)
			out = append(out, map[string]any{"id": id, "doc_type": docType, "title": title, "created_at": created})
		}
		response.OK(w, out, "OK")
	}
}

func essTaxCertificate(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		empID, ok := essLinkedEmployeeID(w, r, pool)
		if !ok {
			return
		}
		tu, _ := auth.FromContext(r.Context())
		year := time.Now().Year()
		if y := strings.TrimSpace(r.URL.Query().Get("year")); y != "" {
			if n, err := strconv.Atoi(y); err == nil {
				year = n
			}
		}
		var no, name, tin, taxStatus string
		_ = pool.QueryRow(r.Context(), `
			select employee_no, full_name, coalesce(tin,''), coalesce(tax_status,'')
			from public.hr_employees where id=$1 and tenant_id=$2`, empID, tu.TenantID,
		).Scan(&no, &name, &tin, &taxStatus)
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
		response.OK(w, map[string]any{
			"profile": "2316_field_pack_v1", "certified_efps": false, "tax_year": year,
			"employee_no": no, "full_name": name, "tin": tin, "tax_status": taxStatus,
			"gross_ytd": gross, "deductions_ytd": ded, "net_ytd": net, "withholding_tax_ytd": wht,
		}, "Tax certificate pack (not certified eFPS).")
	}
}
