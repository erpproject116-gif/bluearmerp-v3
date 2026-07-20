package hr

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type OnboardingCase struct {
	ID           int64   `json:"id"`
	EmployeeID   int64   `json:"employee_id"`
	EmployeeNo   string  `json:"employee_no,omitempty"`
	EmployeeName string  `json:"employee_name,omitempty"`
	TemplateID   *int64  `json:"template_id,omitempty"`
	Status       string  `json:"status"`
	StartedAt    string  `json:"started_at"`
	CompletedAt  *string `json:"completed_at,omitempty"`
	PendingTasks int     `json:"pending_tasks"`
	OverdueTasks int     `json:"overdue_tasks"`
}

type OnboardingTask struct {
	ID          int64   `json:"id"`
	CaseID      int64   `json:"case_id"`
	TaskCode    string  `json:"task_code"`
	Title       string  `json:"title"`
	TaskKind    string  `json:"task_kind"`
	DueDate     *string `json:"due_date,omitempty"`
	Status      string  `json:"status"`
	CompletedAt *string `json:"completed_at,omitempty"`
	CourseID    *int64  `json:"course_id,omitempty"`
	SortOrder   int     `json:"sort_order"`
}

func registerHireOnboardingRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("hr.onboarding", auth.AccessRead)).Get("/hire-onboarding/cases", listOnboardingCases(pool))
	r.With(auth.RequirePermission("hr.onboarding", auth.AccessRead)).Get("/hire-onboarding/cases/{id}", getOnboardingCase(pool))
	r.With(auth.RequirePermission("hr.onboarding", auth.AccessWrite)).Post("/hire-onboarding/cases", spawnOnboardingCaseAPI(pool))
	r.With(auth.RequirePermission("hr.onboarding", auth.AccessWrite)).Post("/hire-onboarding/tasks/{id}/complete", completeOnboardingTask(pool))
	r.With(auth.RequirePermission("hr.onboarding", auth.AccessRead)).Get("/hire-onboarding/templates", listOnboardingTemplates(pool))
}

func listOnboardingTemplates(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, code, name, department_filter, is_active
			from public.hr_onboarding_templates where tenant_id=$1 order by code`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load templates.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id int64
			var code, name, dept string
			var active bool
			_ = rows.Scan(&id, &code, &name, &dept, &active)
			out = append(out, map[string]any{"id": id, "code": code, "name": name, "department_filter": dept, "is_active": active})
		}
		response.OK(w, out, "OK")
	}
}

func listOnboardingCases(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select c.id, c.employee_id, e.employee_no, e.full_name, c.template_id, c.status, c.started_at::text, c.completed_at::text,
			  (select count(*)::int from public.hr_onboarding_tasks t where t.case_id=c.id and t.status='pending') as pending,
			  (select count(*)::int from public.hr_onboarding_tasks t where t.case_id=c.id and t.status='pending' and t.due_date < current_date) as overdue
			from public.hr_onboarding_cases c
			join public.hr_employees e on e.id=c.employee_id
			where c.tenant_id=$1
			order by overdue desc, c.started_at desc
			limit 200`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load cases.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []OnboardingCase{}
		for rows.Next() {
			var row OnboardingCase
			if err := rows.Scan(&row.ID, &row.EmployeeID, &row.EmployeeNo, &row.EmployeeName, &row.TemplateID, &row.Status,
				&row.StartedAt, &row.CompletedAt, &row.PendingTasks, &row.OverdueTasks); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read case.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		response.OK(w, out, "OK")
	}
}

func getOnboardingCase(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var row OnboardingCase
		err = pool.QueryRow(r.Context(), `
			select c.id, c.employee_id, e.employee_no, e.full_name, c.template_id, c.status, c.started_at::text, c.completed_at::text,
			  (select count(*)::int from public.hr_onboarding_tasks t where t.case_id=c.id and t.status='pending'),
			  (select count(*)::int from public.hr_onboarding_tasks t where t.case_id=c.id and t.status='pending' and t.due_date < current_date)
			from public.hr_onboarding_cases c
			join public.hr_employees e on e.id=c.employee_id
			where c.id=$1 and c.tenant_id=$2`, id, tu.TenantID,
		).Scan(&row.ID, &row.EmployeeID, &row.EmployeeNo, &row.EmployeeName, &row.TemplateID, &row.Status,
			&row.StartedAt, &row.CompletedAt, &row.PendingTasks, &row.OverdueTasks)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Case not found.", "ERR_NOT_FOUND")
			return
		}
		trows, err := pool.Query(r.Context(), `
			select id, case_id, task_code, title, task_kind, due_date::text, status, completed_at::text, course_id, sort_order
			from public.hr_onboarding_tasks where tenant_id=$1 and case_id=$2 order by sort_order`, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load tasks.", "ERR_INTERNAL")
			return
		}
		defer trows.Close()
		tasks := []OnboardingTask{}
		for trows.Next() {
			var t OnboardingTask
			_ = trows.Scan(&t.ID, &t.CaseID, &t.TaskCode, &t.Title, &t.TaskKind, &t.DueDate, &t.Status, &t.CompletedAt, &t.CourseID, &t.SortOrder)
			tasks = append(tasks, t)
		}
		response.OK(w, map[string]any{"case": row, "tasks": tasks}, "OK")
	}
}

func spawnOnboardingCaseAPI(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body struct {
			EmployeeID int64  `json:"employee_id"`
			TemplateID *int64 `json:"template_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.EmployeeID <= 0 {
			response.Validation(w, map[string]string{"employee_id": "Required."})
			return
		}
		caseID, err := spawnHireOnboarding(r.Context(), pool, tu.TenantID, body.EmployeeID, body.TemplateID)
		if err != nil {
			response.Err(w, http.StatusConflict, err.Error(), "ERR_CONFLICT")
			return
		}
		response.OK(w, map[string]any{"id": caseID}, "Onboarding case created.")
	}
}

func spawnHireOnboarding(ctx context.Context, pool *pgxpool.Pool, tenantID, empID int64, templateID *int64) (int64, error) {
	var exists bool
	_ = pool.QueryRow(ctx, `select exists(select 1 from public.hr_onboarding_cases where tenant_id=$1 and employee_id=$2)`, tenantID, empID).Scan(&exists)
	if exists {
		return 0, fmt.Errorf("onboarding case already exists for employee")
	}
	var tmplID int64
	if templateID != nil && *templateID > 0 {
		tmplID = *templateID
	} else {
		err := pool.QueryRow(ctx, `
			select id from public.hr_onboarding_templates
			where tenant_id=$1 and is_active order by case when code='DEFAULT' then 0 else 1 end, id limit 1`, tenantID).Scan(&tmplID)
		if err != nil {
			return 0, fmt.Errorf("no onboarding template available")
		}
	}
	var caseID int64
	err := pool.QueryRow(ctx, `
		insert into public.hr_onboarding_cases (tenant_id, employee_id, template_id, status)
		values ($1,$2,$3,'open') returning id`, tenantID, empID, tmplID).Scan(&caseID)
	if err != nil {
		return 0, err
	}
	trows, err := pool.Query(ctx, `
		select task_code, title, task_kind, due_offset_days, sort_order, course_id
		from public.hr_onboarding_template_tasks where tenant_id=$1 and template_id=$2 order by sort_order`, tenantID, tmplID)
	if err != nil {
		return caseID, err
	}
	defer trows.Close()
	today := time.Now()
	for trows.Next() {
		var code, title, kind string
		var offset, sort int
		var courseID *int64
		_ = trows.Scan(&code, &title, &kind, &offset, &sort, &courseID)
		due := today.AddDate(0, 0, offset).Format("2006-01-02")
		var taskID int64
		_ = pool.QueryRow(ctx, `
			insert into public.hr_onboarding_tasks
			  (tenant_id, case_id, task_code, title, task_kind, due_date, course_id, sort_order)
			values ($1,$2,$3,$4,$5,$6::date,$7,$8) returning id`,
			tenantID, caseID, code, title, kind, due, courseID, sort).Scan(&taskID)
		if kind == "complete_course" && courseID != nil && *courseID > 0 {
			dueDate := due
			_, _ = pool.Exec(ctx, `
				insert into public.hr_learning_assignments (tenant_id, course_id, employee_id, due_date, status)
				values ($1,$2,$3,$4::date,'assigned')
				on conflict (tenant_id, course_id, employee_id) do nothing`,
				tenantID, *courseID, empID, dueDate)
		}
	}
	_ = audit.Log(ctx, pool, tenantID, 0, "hr.onboarding.spawn", "hr_onboarding_case", &caseID, nil, map[string]any{"employee_id": empID})
	return caseID, nil
}

func completeOnboardingTask(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var caseID int64
		err = pool.QueryRow(r.Context(), `
			update public.hr_onboarding_tasks
			set status='done', completed_at=now()
			where id=$1 and tenant_id=$2 and status='pending'
			returning case_id`, id, tu.TenantID).Scan(&caseID)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Task not found or already done.", "ERR_NOT_FOUND")
			return
		}
		_, _ = pool.Exec(r.Context(), `
			update public.hr_onboarding_cases set status='in_progress'
			where id=$1 and tenant_id=$2 and status='open'`, caseID, tu.TenantID)
		var pending int
		_ = pool.QueryRow(r.Context(), `
			select count(*)::int from public.hr_onboarding_tasks where case_id=$1 and status='pending'`, caseID).Scan(&pending)
		if pending == 0 {
			_, _ = pool.Exec(r.Context(), `
				update public.hr_onboarding_cases set status='completed', completed_at=now() where id=$1 and tenant_id=$2`, caseID, tu.TenantID)
		}
		response.OK(w, map[string]any{"task_id": id, "case_id": caseID, "pending": pending}, "Task completed.")
	}
}
