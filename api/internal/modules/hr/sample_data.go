package hr

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

var (
	errSampleOpen = errors.New("an HR sample batch is already open")
	errLMSI5      = errors.New("LMSI_5 evaluation template is missing")
	errNoSample   = errors.New("no HR sample batch is open")
)

type sampleBlockedError struct {
	Table string
	ID    int64
}

func (e sampleBlockedError) Error() string {
	return fmt.Sprintf("%s %d is used outside the sample batch", e.Table, e.ID)
}

// sampleEmployeeExcludeSQL keeps an open sample batch out of a live pay run.
// alias is the hr_employees table name or its SQL alias.
func sampleEmployeeExcludeSQL(alias string) string {
	return fmt.Sprintf(` and not exists (
		  select 1 from public.hr_sample_rows sr
		  join public.hr_sample_batches sb on sb.id = sr.batch_id
		  where sr.table_name = 'hr_employees' and sr.row_id = %s.id
		    and sb.tenant_id = %s.tenant_id and sb.retracted_at is null
		)`, alias, alias)
}

type rowQuery interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func employeeInOpenSample(ctx context.Context, q rowQuery, tenantID, employeeID int64) (bool, error) {
	var exists bool
	err := q.QueryRow(ctx, `
		select exists (
		  select 1 from public.hr_sample_rows sr
		  join public.hr_sample_batches sb on sb.id = sr.batch_id
		  where sb.tenant_id = $1 and sb.retracted_at is null
		    and sr.table_name = 'hr_employees' and sr.row_id = $2
		)`, tenantID, employeeID).Scan(&exists)
	return exists, err
}

func registerSampleDataRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("hr.sample_data", auth.AccessWrite)).Post("/sample-data", postSampleData(pool))
	r.With(auth.RequirePermission("hr.sample_data", auth.AccessWrite)).Post("/sample-data/retract", postRetractSampleData(pool))
}

func postSampleData(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to add sample data.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		batchID, err := seedHRSample(r.Context(), tx, tu.TenantID)
		if err != nil {
			writeSampleErr(w, err, "Failed to add sample data.")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to add sample data.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"batch_id": batchID}, "Sample HR data added.")
	}
}

func postRetractSampleData(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to remove sample data.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		if err := retractHRSample(r.Context(), tx, tu.TenantID); err != nil {
			writeSampleErr(w, err, "Failed to remove sample data.")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to remove sample data.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"removed": true}, "Sample HR data removed.")
	}
}

func writeSampleErr(w http.ResponseWriter, err error, fallback string) {
	var blocked sampleBlockedError
	switch {
	case errors.Is(err, errSampleOpen):
		response.Err(w, http.StatusBadRequest, "Sample data is already loaded. Remove it before adding another set.", "ERR_VALIDATION")
	case errors.Is(err, errNoSample):
		response.Err(w, http.StatusBadRequest, "No sample data to remove.", "ERR_VALIDATION")
	case errors.Is(err, errLMSI5):
		response.Err(w, http.StatusBadRequest, "Migration 338 is not applied. The LMSI_5 evaluation template is missing.", "ERR_VALIDATION")
	case errors.As(err, &blocked):
		response.Err(w, http.StatusBadRequest, blocked.Error(), "ERR_VALIDATION")
	default:
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			response.Err(w, http.StatusBadRequest, "A sample name or pay date already exists. Remove the sample set or rename the existing row.", "ERR_VALIDATION")
			return
		}
		response.Err(w, http.StatusInternalServerError, fallback, "ERR_INTERNAL")
	}
}

type sampler struct {
	ctx   context.Context
	tx    pgx.Tx
	batch int64
}

func (s sampler) ins(table, sql string, args ...any) (int64, error) {
	var id int64
	if err := s.tx.QueryRow(s.ctx, sql, args...).Scan(&id); err != nil {
		return 0, fmt.Errorf("%s: %w", table, err)
	}
	_, err := s.tx.Exec(s.ctx, `
		insert into public.hr_sample_rows (batch_id, table_name, row_id) values ($1,$2,$3)`,
		s.batch, table, id)
	return id, err
}

func seedHRSample(ctx context.Context, tx pgx.Tx, tenantID int64) (int64, error) {
	var openID int64
	err := tx.QueryRow(ctx, `
		select id from public.hr_sample_batches
		where tenant_id = $1 and retracted_at is null`, tenantID).Scan(&openID)
	if err == nil {
		return 0, errSampleOpen
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}
	var templateID int64
	err = tx.QueryRow(ctx, `
		select id from public.hr_review_templates
		where tenant_id = $1 and code = 'LMSI_5'`, tenantID).Scan(&templateID)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, errLMSI5
	}
	if err != nil {
		return 0, err
	}

	var batchID int64
	if err := tx.QueryRow(ctx, `
		insert into public.hr_sample_batches (tenant_id) values ($1) returning id`, tenantID).Scan(&batchID); err != nil {
		return 0, err
	}
	s := sampler{ctx: ctx, tx: tx, batch: batchID}

	deptNames := []struct{ code, name string }{
		{"SAMPLE-OFFICE", "Sample Office"},
		{"SAMPLE-PLANT", "Sample Plant"},
		{"SAMPLE-SITE", "Sample Site"},
	}
	depts := make([]int64, len(deptNames))
	for i, d := range deptNames {
		id, err := s.ins("hr_departments", `
			insert into public.hr_departments (tenant_id, department_code, department_name, status)
			values ($1,$2,$3,'active') returning id`, tenantID, d.code, d.name)
		if err != nil {
			return 0, err
		}
		depts[i] = id
	}

	type person struct {
		name, title, status string
		dept                int
		salary              float64
	}
	people := []person{
		{"Sample Ana Cruz", "Clerk", "active", 0, 20000},
		{"Sample Ben Santos", "Operator", "active", 1, 22000},
		{"Sample Cara Diaz", "Aide", "active", 2, 18000},
		{"Sample Dan Reyes", "Lead", "active", 0, 25000},
		{"Sample Eva Lim", "Technician", "active", 1, 21000},
		{"Sample Finn Cruz", "Aide", "terminated", 2, 19000},
	}
	emps := make([]int64, len(people))
	for i, p := range people {
		no := fmt.Sprintf("SEEDHR-%d-%02d", batchID, i+1)
		id, err := s.ins("hr_employees", `
			insert into public.hr_employees (
			  tenant_id, employee_no, full_name, department, department_id, job_title, hire_date, status, base_salary, notes
			) values ($1,$2,$3,$4,$5,$6,'2024-01-15',$7,$8,'Sample HR data') returning id`,
			tenantID, no, p.name, deptNames[p.dept].name, depts[p.dept], p.title, p.status, p.salary)
		if err != nil {
			return 0, err
		}
		emps[i] = id
	}
	if _, err := s.ins("hr_compensation_history", `
		insert into public.hr_compensation_history (tenant_id, employee_id, pay_rate, effective_end)
		values ($1,$2,10000,'2025-12-31') returning id`, tenantID, emps[0]); err != nil {
		return 0, err
	}

	if err := seedSampleApplicants(s, tenantID); err != nil {
		return 0, err
	}
	if err := seedSamplePeopleOps(s, tenantID, emps, templateID); err != nil {
		return 0, err
	}
	if err := seedSamplePay(s, tenantID); err != nil {
		return 0, err
	}
	return batchID, nil
}

func seedSampleApplicants(s sampler, tenantID int64) error {
	industries := []string{"Sample Industry A", "Sample Industry B", "Sample Industry C"}
	industryIDs := make([]int64, len(industries))
	for i, name := range industries {
		id, err := s.ins("hr_applicant_segments", `
			insert into public.hr_applicant_segments (tenant_id, kind, name)
			values ($1,'industry',$2) returning id`, tenantID, name)
		if err != nil {
			return err
		}
		industryIDs[i] = id
	}
	workplaces := []string{"Sample Workplace A", "Sample Workplace B"}
	workplaceIDs := make([]int64, len(workplaces))
	for i, name := range workplaces {
		id, err := s.ins("hr_applicant_segments", `
			insert into public.hr_applicant_segments (tenant_id, kind, name)
			values ($1,'workplace',$2) returning id`, tenantID, name)
		if err != nil {
			return err
		}
		workplaceIDs[i] = id
	}
	statuses := []string{
		"pooling", "initial_interview", "exam", "final_interview",
		"onboarding", "hired", "rejected", "terminated", "resigned",
	}
	for i, status := range statuses {
		fullName := "Sample Applicant " + status
		if status == "hired" {
			fullName = "Sample Applicant Hired"
		}
		personID, err := s.ins("hr_applicant_people", `
			insert into public.hr_applicant_people (tenant_id, full_name, email, mobile)
			values ($1,$2,$3,$4) returning id`,
			tenantID, fullName, fmt.Sprintf("sample.%s.%d@example.test", status, s.batch), fmt.Sprintf("0900000%04d", i))
		if err != nil {
			return err
		}
		appID, err := s.ins("hr_applications", `
			insert into public.hr_applications (
			  tenant_id, person_id, status, position_desired, email, cellphone,
			  industry_id, workplace_type_id, certified
			) values ($1,$2,$3,'Sample role',$4,$5,$6,$7,true) returning id`,
			tenantID, personID, status,
			fmt.Sprintf("sample.%s.%d@example.test", status, s.batch),
			fmt.Sprintf("0900000%04d", i),
			industryIDs[i%len(industryIDs)], workplaceIDs[i%len(workplaceIDs)])
		if err != nil {
			return err
		}
		if i == 0 {
			if _, err := s.ins("hr_application_children", `
				insert into public.hr_application_children (application_id, child_name, birth_date)
				values ($1,'Sample Child','2018-04-02') returning id`, appID); err != nil {
				return err
			}
			if _, err := s.ins("hr_application_jobs", `
				insert into public.hr_application_jobs (application_id, company_name, position, started_on, ended_on)
				values ($1,'Sample Previous Co','Helper','2022-01-01','2023-12-31') returning id`, appID); err != nil {
				return err
			}
			if _, err := s.ins("hr_application_references", `
				insert into public.hr_application_references (application_id, ref_name, position, company_name, contact_no)
				values ($1,'Sample Reference','Supervisor','Sample Previous Co','09001112222') returning id`, appID); err != nil {
				return err
			}
			if _, err := s.ins("hr_application_comments", `
				insert into public.hr_application_comments (tenant_id, application_id, body)
				values ($1,$2,'Sample comment') returning id`, tenantID, appID); err != nil {
				return err
			}
		}
	}
	return nil
}

func seedSamplePeopleOps(s sampler, tenantID int64, emps []int64, templateID int64) error {
	leaveTypeID, err := reuseOrInsert(s, "hr_leave_types", `
		select id from public.hr_leave_types where tenant_id = $1 and code = 'VL'`,
		`insert into public.hr_leave_types (tenant_id, code, name) values ($1,'SAMPLE-LEAVE','Sample Leave') returning id`,
		tenantID)
	if err != nil {
		return err
	}
	if _, err := s.ins("hr_leave_balances", `
		insert into public.hr_leave_balances (tenant_id, employee_id, leave_type_id, balance_year, accrued)
		values ($1,$2,$3,2026,5) returning id`, tenantID, emps[0], leaveTypeID); err != nil {
		return err
	}
	if _, err := s.ins("hr_leave_requests", `
		insert into public.hr_leave_requests (tenant_id, employee_id, leave_type_id, date_from, date_to, days, status, reason)
		values ($1,$2,$3,'2099-01-06','2099-01-06',1,'submitted','Sample leave') returning id`,
		tenantID, emps[0], leaveTypeID); err != nil {
		return err
	}
	if _, err := s.ins("hr_dtr_entries", `
		insert into public.hr_dtr_entries (tenant_id, employee_id, work_date, source, status, hours_worked)
		values ($1,$2,'2099-01-02','manual','present',8) returning id`, tenantID, emps[0]); err != nil {
		return err
	}
	if _, err := s.ins("hr_dtr_entries", `
		insert into public.hr_dtr_entries (tenant_id, employee_id, work_date, source, status, hours_worked)
		values ($1,$2,'2099-01-03','manual','absent',0) returning id`, tenantID, emps[1]); err != nil {
		return err
	}
	if _, err := s.ins("hr_company_records", `
		insert into public.hr_company_records (tenant_id, record_kind, title, body, record_date)
		values ($1,'policy','Sample handbook','Sample policy text','2099-01-01') returning id`, tenantID); err != nil {
		return err
	}
	if _, err := s.ins("hr_absence_alerts", `
		insert into public.hr_absence_alerts (tenant_id, employee_id, message, occurrence_count, window_start, window_end, status)
		values ($1,$2,'Sample absence alert',1,'2099-01-01','2099-01-31','open') returning id`, tenantID, emps[1]); err != nil {
		return err
	}
	if _, err := s.ins("hr_discipline_cases", `
		insert into public.hr_discipline_cases (tenant_id, employee_id, case_no, case_type, subject, details)
		values ($1,$2,$3,'coaching','Sample coaching','Sample discipline note') returning id`,
		tenantID, emps[2], fmt.Sprintf("SEEDHR-%d-COACH", s.batch)); err != nil {
		return err
	}
	if _, err := s.ins("hr_workplace_problems", `
		insert into public.hr_workplace_problems (tenant_id, case_no, employee_id, category, description, next_action, target_date)
		values ($1,$2,$3,'attendance','Sample workplace problem','Call the employee','2099-01-20') returning id`,
		tenantID, fmt.Sprintf("SEEDHR-%d-WP", s.batch), emps[0]); err != nil {
		return err
	}
	if _, err := s.ins("hr_client_violation_reports", `
		insert into public.hr_client_violation_reports (tenant_id, employee_id, description)
		values ($1,$2,'Sample client report') returning id`, tenantID, emps[3]); err != nil {
		return err
	}

	var onboardTemplate *int64
	var tmpl int64
	err = s.tx.QueryRow(s.ctx, `
		select id from public.hr_onboarding_templates where tenant_id = $1 and code = 'DEFAULT'`, tenantID).Scan(&tmpl)
	if err == nil {
		onboardTemplate = &tmpl
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	caseID, err := s.ins("hr_onboarding_cases", `
		insert into public.hr_onboarding_cases (tenant_id, employee_id, template_id, status)
		values ($1,$2,$3,'open') returning id`, tenantID, emps[4], onboardTemplate)
	if err != nil {
		return err
	}
	if _, err := s.ins("hr_onboarding_tasks", `
		insert into public.hr_onboarding_tasks (tenant_id, case_id, task_code, title, status)
		values ($1,$2,'SAMPLE','Sample onboarding task','pending') returning id`, tenantID, caseID); err != nil {
		return err
	}

	scores := `{"attendance_punctuality":4,"job_performance":4,"work_attitude":4,"communication":4,"following_instructions":4}`
	cycleID, err := s.ins("hr_review_cycles", `
		insert into public.hr_review_cycles (tenant_id, name, cycle_kind, template_id, period_start, period_end, status)
		values ($1,'Sample review','annual',$2,'2020-01-01','2020-12-31','open') returning id`, tenantID, templateID)
	if err != nil {
		return err
	}
	if _, err := s.ins("hr_performance_reviews", `
		insert into public.hr_performance_reviews (
		  tenant_id, cycle_id, employee_id, status, manager_comments, overall_score, scores_json, review_source
		) values ($1,$2,$3,'manager_done','Sample agency review',4,$4::jsonb,'agency') returning id`,
		tenantID, cycleID, emps[0], scores); err != nil {
		return err
	}
	if _, err := s.ins("hr_performance_reviews", `
		insert into public.hr_performance_reviews (
		  tenant_id, cycle_id, employee_id, status, manager_comments, overall_score, scores_json, review_source
		) values ($1,$2,$3,'manager_done','Sample client review',4,$4::jsonb,'client') returning id`,
		tenantID, cycleID, emps[1], scores); err != nil {
		return err
	}

	for _, kind := range []string{"loan", "salary_advance", "pay_question", "certificate", "resignation"} {
		if _, err := s.ins("hr_worker_requests", `
			insert into public.hr_worker_requests (tenant_id, employee_id, kind, status, details)
			values ($1,$2,$3,'pending','Sample request') returning id`, tenantID, emps[0], kind); err != nil {
			return err
		}
	}
	if _, err := s.ins("hr_employee_documents", `
		insert into public.hr_employee_documents (tenant_id, employee_id, doc_type, title)
		values ($1,$2,'other','Sample 201 file') returning id`, tenantID, emps[0]); err != nil {
		return err
	}

	courseID, err := s.ins("hr_courses", `
		insert into public.hr_courses (tenant_id, code, title, summary)
		values ($1,$2,'Sample orientation','Sample course') returning id`,
		tenantID, fmt.Sprintf("SAMPLEHR%d", s.batch))
	if err != nil {
		return err
	}
	if _, err := s.ins("hr_learning_assignments", `
		insert into public.hr_learning_assignments (tenant_id, course_id, employee_id, due_date, status)
		values ($1,$2,$3,'2099-02-01','assigned') returning id`, tenantID, courseID, emps[0]); err != nil {
		return err
	}

	payTypeID, err := reuseOrInsert(s, "hr_pay_item_types", `
		select id from public.hr_pay_item_types where tenant_id = $1 and item_code = 'ALLOW_OTHER'`,
		`insert into public.hr_pay_item_types (tenant_id, item_code, item_name, item_kind)
		 values ($1,'SAMPLE-ALLOW','Sample allowance','earning') returning id`, tenantID)
	if err != nil {
		return err
	}
	_, err = s.ins("hr_employee_pay_items", `
		insert into public.hr_employee_pay_items (tenant_id, employee_id, pay_item_type_id, amount, effective_from)
		values ($1,$2,$3,500,'2099-01-01') returning id`, tenantID, emps[0], payTypeID)
	return err
}

func reuseOrInsert(s sampler, table, lookup, insert string, tenantID int64) (int64, error) {
	var id int64
	err := s.tx.QueryRow(s.ctx, lookup, tenantID).Scan(&id)
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}
	return s.ins(table, insert, tenantID)
}

func seedSamplePay(s sampler, tenantID int64) error {
	rows, err := s.tx.Query(s.ctx, `
		select e.id, e.status, e.base_salary::float8
		from public.hr_employees e
		join public.hr_sample_rows r on r.row_id = e.id and r.table_name = 'hr_employees' and r.batch_id = $1
		order by e.employee_no`, s.batch)
	if err != nil {
		return err
	}
	type empPay struct {
		id     int64
		status string
		salary float64
	}
	var emps []empPay
	for rows.Next() {
		var e empPay
		if err := rows.Scan(&e.id, &e.status, &e.salary); err != nil {
			rows.Close()
			return err
		}
		emps = append(emps, e)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	regularID, err := s.ins("hr_pay_periods", `
		insert into public.hr_pay_periods (tenant_id, period_label, period_start, period_end, status, run_type)
		values ($1,'Sample regular','2099-01-01','2099-01-15','processed','regular') returning id`, tenantID)
	if err != nil {
		return err
	}
	var terminated empPay
	for _, e := range emps {
		if e.status != "active" {
			terminated = e
			continue
		}
		slipID, err := s.ins("hr_payslips", `
			insert into public.hr_payslips (tenant_id, pay_period_id, employee_id, gross_pay, deductions, net_pay, status)
			values ($1,$2,$3,$4,0,$4,'posted') returning id`, tenantID, regularID, e.id, e.salary)
		if err != nil {
			return err
		}
		if _, err := s.ins("hr_payslip_lines", `
			insert into public.hr_payslip_lines (payslip_id, line_no, line_type, line_code, description, amount)
			values ($1,1,'earning','BASIC','Sample basic',$2) returning id`, slipID, e.salary); err != nil {
			return err
		}
	}
	thirteenthID, err := s.ins("hr_pay_periods", `
		insert into public.hr_pay_periods (tenant_id, period_label, period_start, period_end, status, run_type)
		values ($1,'Sample 13th month','2099-12-01','2099-12-31','processed','thirteenth') returning id`, tenantID)
	if err != nil {
		return err
	}
	for _, e := range emps {
		if e.status != "active" {
			continue
		}
		amount := roundMoney(e.salary / 12)
		slipID, err := s.ins("hr_payslips", `
			insert into public.hr_payslips (tenant_id, pay_period_id, employee_id, gross_pay, deductions, net_pay, status)
			values ($1,$2,$3,$4,0,$4,'posted') returning id`, tenantID, thirteenthID, e.id, amount)
		if err != nil {
			return err
		}
		if _, err := s.ins("hr_payslip_lines", `
			insert into public.hr_payslip_lines (payslip_id, line_no, line_type, line_code, description, amount)
			values ($1,1,'earning','THIRTEENTH','Sample 13th month',$2) returning id`, slipID, amount); err != nil {
			return err
		}
	}
	if terminated.id == 0 {
		return fmt.Errorf("sample terminated employee missing")
	}
	finalID, err := s.ins("hr_pay_periods", `
		insert into public.hr_pay_periods (tenant_id, period_label, period_start, period_end, status, run_type)
		values ($1,'Sample final pay','2099-02-01','2099-02-15','processed','final_pay') returning id`, tenantID)
	if err != nil {
		return err
	}
	slipID, err := s.ins("hr_payslips", `
		insert into public.hr_payslips (tenant_id, pay_period_id, employee_id, gross_pay, deductions, net_pay, status)
		values ($1,$2,$3,$4,0,$4,'posted') returning id`, tenantID, finalID, terminated.id, terminated.salary)
	if err != nil {
		return err
	}
	if _, err := s.ins("hr_payslip_lines", `
		insert into public.hr_payslip_lines (payslip_id, line_no, line_type, line_code, description, amount)
		values ($1,1,'earning','FINAL_PAY','Sample final pay',$2) returning id`, slipID, terminated.salary); err != nil {
		return err
	}
	_, err = s.ins("hr_remittance_batches", `
		insert into public.hr_remittance_batches (tenant_id, pay_period_id, agency, period_label, status)
		values ($1,$2,'sss','Sample regular','draft') returning id`, tenantID, regularID)
	return err
}

var sampleRetractOrder = []string{
	"hr_application_children",
	"hr_application_jobs",
	"hr_application_references",
	"hr_application_comments",
	"hr_payslip_lines",
	"hr_payslips",
	"hr_remittance_batches",
	"hr_pay_periods",
	"hr_dtr_entries",
	"hr_leave_requests",
	"hr_leave_balances",
	"hr_absence_alerts",
	"hr_discipline_cases",
	"hr_workplace_problems",
	"hr_client_violation_reports",
	"hr_onboarding_tasks",
	"hr_onboarding_cases",
	"hr_learning_assignments",
	"hr_employee_pay_items",
	"hr_performance_reviews",
	"hr_review_cycles",
	"hr_worker_requests",
	"hr_employee_documents",
	"hr_compensation_history",
	"hr_applications",
	"hr_applicant_people",
	"hr_employees",
	"hr_company_records",
	"hr_departments",
	"hr_leave_types",
	"hr_pay_item_types",
	"hr_applicant_segments",
	"hr_courses",
}

func retractHRSample(ctx context.Context, tx pgx.Tx, tenantID int64) error {
	var batchID int64
	err := tx.QueryRow(ctx, `
		select id from public.hr_sample_batches
		where tenant_id = $1 and retracted_at is null`, tenantID).Scan(&batchID)
	if errors.Is(err, pgx.ErrNoRows) {
		return errNoSample
	}
	if err != nil {
		return err
	}
	guards := []struct{ master, child, col string }{
		{"hr_departments", "hr_employees", "department_id"},
		{"hr_leave_types", "hr_leave_requests", "leave_type_id"},
		{"hr_leave_types", "hr_leave_balances", "leave_type_id"},
		{"hr_pay_item_types", "hr_employee_pay_items", "pay_item_type_id"},
		{"hr_applicant_segments", "hr_applications", "industry_id"},
		{"hr_applicant_segments", "hr_applications", "workplace_type_id"},
		{"hr_courses", "hr_learning_assignments", "course_id"},
	}
	for _, g := range guards {
		if err := guardSampleMaster(ctx, tx, batchID, g.master, g.child, g.col); err != nil {
			return err
		}
	}
	for _, table := range sampleRetractOrder {
		if err := deleteSampleTable(ctx, tx, batchID, table); err != nil {
			return err
		}
	}
	_, err = tx.Exec(ctx, `
		update public.hr_sample_batches set retracted_at = now()
		where id = $1 and tenant_id = $2 and retracted_at is null`, batchID, tenantID)
	return err
}

func guardSampleMaster(ctx context.Context, tx pgx.Tx, batchID int64, master, child, col string) error {
	var id int64
	err := tx.QueryRow(ctx, fmt.Sprintf(`
		select c.id from public.%s c
		where c.%s in (
		  select row_id from public.hr_sample_rows where batch_id = $1 and table_name = $2
		)
		and not exists (
		  select 1 from public.hr_sample_rows r
		  where r.batch_id = $1 and r.table_name = $3 and r.row_id = c.id
		)
		limit 1`, child, col), batchID, master, child).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	return sampleBlockedError{Table: child, ID: id}
}

func deleteSampleTable(ctx context.Context, tx pgx.Tx, batchID int64, table string) error {
	allowed := false
	for _, name := range sampleRetractOrder {
		if name == table {
			allowed = true
			break
		}
	}
	if !allowed {
		return fmt.Errorf("refusing to delete %s", table)
	}
	_, err := tx.Exec(ctx, fmt.Sprintf(`
		delete from public.%s
		where id in (
		  select row_id from public.hr_sample_rows where batch_id = $1 and table_name = $2
		)`, table), batchID, table)
	return err
}
