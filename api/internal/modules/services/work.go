package services

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func listTasks(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		jobID, ok := pathID(w, r, "id")
		if !ok {
			return
		}
		rows, err := pool.Query(r.Context(), `
			select id, name, description, employee_id, status, remarks
			from public.svc_tasks where tenant_id = $1 and job_id = $2 order by id`, tu.TenantID, jobID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list tasks.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id int64
			var employeeID *int64
			var name, description, status, remarks string
			if err := rows.Scan(&id, &name, &description, &employeeID, &status, &remarks); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to list tasks.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{"id": id, "name": name, "description": description, "employee_id": employeeID, "status": status, "remarks": remarks})
		}
		response.OK(w, out, "OK")
	}
}

func createTask(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		jobID, ok := pathID(w, r, "id")
		if !ok {
			return
		}
		var body struct {
			Name        string `json:"name"`
			Description string `json:"description"`
			EmployeeID  *int64 `json:"employee_id"`
			Status      string `json:"status"`
			Remarks     string `json:"remarks"`
		}
		if !decodeJSON(w, r, &body) {
			return
		}
		if body.EmployeeID != nil {
			if err := employeeInTenant(r.Context(), pool, tu.TenantID, *body.EmployeeID); err != nil {
				response.Validation(w, map[string]string{"employee_id": "Technician must be an employee in this company."})
				return
			}
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.svc_tasks (tenant_id, job_id, name, description, employee_id, status, remarks)
			select $1, j.id, $3, $4, $5, coalesce(nullif($6,''), 'open'), $7
			from public.svc_jobs j
			where j.id = $2 and j.tenant_id = $1 and j.deleted_at is null
			returning svc_tasks.id`,
			tu.TenantID, jobID, body.Name, body.Description, int64OrNil(body.EmployeeID), body.Status, body.Remarks).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Job not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Created.")
	}
}

func patchTask(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r, "id")
		if !ok {
			return
		}
		var body struct {
			Status  string `json:"status"`
			Remarks string `json:"remarks"`
		}
		if !decodeJSON(w, r, &body) {
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.svc_tasks set status = $3, remarks = $4, updated_at = now()
			where id = $1 and tenant_id = $2`, id, tu.TenantID, body.Status, body.Remarks)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Task not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Saved.")
	}
}

func listJobAssignments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		jobID, ok := pathID(w, r, "id")
		if !ok {
			return
		}
		rows, err := pool.Query(r.Context(), `
			select a.id, a.employee_id, e.full_name, a.scheduled_start, a.scheduled_end, a.notes
			from public.svc_assignments a
			join public.hr_employees e on e.id = a.employee_id
			where a.tenant_id = $1 and a.job_id = $2
			order by a.scheduled_start nulls last, a.id`, tu.TenantID, jobID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list assignments.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		response.OK(w, scanAssignments(rows), "OK")
	}
}

func createAssignment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		jobID, ok := pathID(w, r, "id")
		if !ok {
			return
		}
		var body struct {
			EmployeeID     int64  `json:"employee_id"`
			ScheduledStart string `json:"scheduled_start"`
			ScheduledEnd   string `json:"scheduled_end"`
			Notes          string `json:"notes"`
		}
		if !decodeJSON(w, r, &body) {
			return
		}
		if err := employeeInTenant(r.Context(), pool, tu.TenantID, body.EmployeeID); err != nil {
			response.Validation(w, map[string]string{"employee_id": "Technician must be an employee in this company."})
			return
		}
		start, end := parseTimePtr(body.ScheduledStart), parseTimePtr(body.ScheduledEnd)
		var warnings []string
		if start != nil && end != nil {
			var n int
			_ = pool.QueryRow(r.Context(), `
				select count(*) from public.svc_assignments
				where tenant_id = $1 and employee_id = $2
				  and scheduled_start < $4 and scheduled_end > $3`,
				tu.TenantID, body.EmployeeID, *start, *end).Scan(&n)
			if n > 0 {
				warnings = append(warnings, "This technician already has an overlapping assignment.")
			}
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.svc_assignments (tenant_id, job_id, employee_id, scheduled_start, scheduled_end, notes)
			select $1, j.id, $3, $4, $5, $6
			from public.svc_jobs j
			where j.id = $2 and j.tenant_id = $1 and j.deleted_at is null
			returning svc_assignments.id`,
			tu.TenantID, jobID, body.EmployeeID, start, end, body.Notes).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Job not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id, "warnings": warnings}, "Assigned.")
	}
}

func createTimeEntry(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		jobID, ok := pathID(w, r, "id")
		if !ok {
			return
		}
		var body struct {
			EmployeeID int64  `json:"employee_id"`
			StartedAt  string `json:"started_at"`
			EndedAt    string `json:"ended_at"`
			Minutes    int    `json:"minutes"`
			Notes      string `json:"notes"`
		}
		if !decodeJSON(w, r, &body) {
			return
		}
		if err := employeeInTenant(r.Context(), pool, tu.TenantID, body.EmployeeID); err != nil {
			response.Validation(w, map[string]string{"employee_id": "Technician must be an employee in this company."})
			return
		}
		start := parseTimePtr(body.StartedAt)
		if start == nil {
			now := time.Now().UTC()
			start = &now
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.svc_time_entries (tenant_id, job_id, employee_id, started_at, ended_at, minutes, notes)
			select $1, j.id, $3, $4, $5, $6, $7
			from public.svc_jobs j where j.id = $2 and j.tenant_id = $1
			returning svc_time_entries.id`,
			tu.TenantID, jobID, body.EmployeeID, *start, parseTimePtr(body.EndedAt), body.Minutes, body.Notes).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Job not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Time recorded. Payroll was not updated.")
	}
}

func listChecklistResults(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		jobID, ok := pathID(w, r, "id")
		if !ok {
			return
		}
		rows, err := pool.Query(r.Context(), `
			select id, item_key, label, is_done, remarks
			from public.svc_checklist_results
			where tenant_id = $1 and job_id = $2 order by id`, tu.TenantID, jobID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list the checklist.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id int64
			var key, label, remarks string
			var done bool
			if err := rows.Scan(&id, &key, &label, &done, &remarks); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to list the checklist.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{"id": id, "item_key": key, "label": label, "is_done": done, "remarks": remarks})
		}
		response.OK(w, out, "OK")
	}
}

func patchChecklistResult(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r, "id")
		if !ok {
			return
		}
		var body struct {
			IsDone  bool   `json:"is_done"`
			Remarks string `json:"remarks"`
		}
		if !decodeJSON(w, r, &body) {
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.svc_checklist_results set is_done = $3, remarks = $4
			where id = $1 and tenant_id = $2`, id, tu.TenantID, body.IsDone, body.Remarks)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Checklist item not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Saved.")
	}
}

func listMaterials(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		jobID, ok := pathID(w, r, "id")
		if !ok {
			return
		}
		rows, err := pool.Query(r.Context(), `
			select id, item_code, description, required_qty::float8, used_qty::float8, returned_qty::float8, posting_status
			from public.svc_materials where tenant_id = $1 and job_id = $2 order by id`, tu.TenantID, jobID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list materials.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id int64
			var code, description, posting string
			var req, used, ret float64
			if err := rows.Scan(&id, &code, &description, &req, &used, &ret, &posting); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to list materials.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{
				"id": id, "item_code": code, "description": description,
				"required_qty": req, "used_qty": used, "returned_qty": ret, "posting_status": posting,
			})
		}
		response.OK(w, out, "OK")
	}
}

func createMaterial(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		jobID, ok := pathID(w, r, "id")
		if !ok {
			return
		}
		var body struct {
			ItemCode    string  `json:"item_code"`
			Description string  `json:"description"`
			RequiredQty float64 `json:"required_qty"`
			UsedQty     float64 `json:"used_qty"`
			ReturnedQty float64 `json:"returned_qty"`
		}
		if !decodeJSON(w, r, &body) {
			return
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.svc_materials (
			  tenant_id, job_id, item_code, description, required_qty, used_qty, returned_qty, posting_status
			)
			select $1, j.id, $3, $4, $5, $6, $7, 'not_posted'
			from public.svc_jobs j where j.id = $2 and j.tenant_id = $1
			returning svc_materials.id`,
			tu.TenantID, jobID, body.ItemCode, body.Description, body.RequiredQty, body.UsedQty, body.ReturnedQty).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Job not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id, "posting_status": "not_posted"}, "Recorded. Company stock was not changed.")
	}
}

func listSchedule(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		from := strings.TrimSpace(r.URL.Query().Get("from"))
		to := strings.TrimSpace(r.URL.Query().Get("to"))
		args := []any{tu.TenantID}
		where := "a.tenant_id = $1"
		n := 2
		if from != "" {
			where += " and a.scheduled_start >= $" + strconv.Itoa(n) + "::timestamptz"
			args = append(args, from)
			n++
		}
		if to != "" {
			where += " and a.scheduled_start < $" + strconv.Itoa(n) + "::timestamptz"
			args = append(args, to)
		}
		rows, err := pool.Query(r.Context(), `
			select a.id, a.job_id, j.job_no, a.employee_id, e.full_name, a.scheduled_start, a.scheduled_end, a.notes, j.location_id
			from public.svc_assignments a
			join public.svc_jobs j on j.id = a.job_id and j.tenant_id = a.tenant_id
			join public.hr_employees e on e.id = a.employee_id
			where `+where+`
			order by a.scheduled_start nulls last`, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load the schedule.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		response.OK(w, scanSchedule(rows), "OK")
	}
}

func parseTimePtr(s string) *time.Time {
	if s == "" {
		return nil
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		t, err = time.Parse("2006-01-02T15:04", s)
		if err != nil {
			return nil
		}
	}
	return &t
}
