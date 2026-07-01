package jobcosting

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type Timesheet struct {
	ID          int64   `json:"id"`
	ProjectID   int64   `json:"project_id"`
	ProjectCode string  `json:"project_code,omitempty"`
	ProjectName string  `json:"project_name,omitempty"`
	UserID      *int64  `json:"user_id,omitempty"`
	WorkerName  string  `json:"worker_name"`
	WorkDate    string  `json:"work_date"`
	Hours       float64 `json:"hours"`
	HourlyRate  float64 `json:"hourly_rate"`
	CostAmount  float64 `json:"cost_amount"`
	Description *string `json:"description,omitempty"`
}

type timesheetBody struct {
	ProjectID   int64   `json:"project_id"`
	UserID      *int64  `json:"user_id"`
	WorkerName  string  `json:"worker_name"`
	WorkDate    string  `json:"work_date"`
	Hours       float64 `json:"hours"`
	HourlyRate  float64 `json:"hourly_rate"`
	Description *string `json:"description"`
}

func registerTimesheetRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("job_costing.timesheets", auth.AccessRead)).Get("/timesheets", listTimesheets(pool))
	r.With(auth.RequirePermission("job_costing.timesheets", auth.AccessWrite)).Post("/timesheets", createTimesheet(pool))
}

func listTimesheets(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{"work_date": "t.work_date", "project_code": "p.project_code"}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "work_date", allowed)
		if p.Order == "" {
			p.Order = "desc"
		}
		offset := httputil.Offset(p)
		where := "t.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if pid := strings.TrimSpace(r.URL.Query().Get("project_id")); pid != "" {
			where += fmt.Sprintf(" and t.project_id = $%d", n)
			id, err := strconv.ParseInt(pid, 10, 64)
			if err != nil {
				response.Validation(w, map[string]string{"project_id": "Invalid project id."})
				return
			}
			args = append(args, id)
			n++
		}
		sortCol := allowed[p.Sort]
		if sortCol == "" {
			sortCol = "t.work_date"
		}
		q := fmt.Sprintf(`
			select t.id, t.project_id, p.project_code, p.project_name,
			  t.user_id, t.worker_name, t.work_date::text,
			  t.hours::float8, t.hourly_rate::float8, t.cost_amount::float8, t.description,
			  count(*) over()
			from public.job_cost_timesheets t
			join public.job_cost_projects p on p.id = t.project_id
			where %s
			order by %s %s
			limit $%d offset $%d`, where, sortCol, orderSQL(p.Order), n, n+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list timesheets.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []Timesheet
		var total int64
		for rows.Next() {
			var row Timesheet
			if err := rows.Scan(
				&row.ID, &row.ProjectID, &row.ProjectCode, &row.ProjectName,
				&row.UserID, &row.WorkerName, &row.WorkDate,
				&row.Hours, &row.HourlyRate, &row.CostAmount, &row.Description, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read timesheets.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []Timesheet{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func createTimesheet(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body timesheetBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateTimesheetBody(body); errs != nil {
			response.Validation(w, errs)
			return
		}
		if !projectBelongsToTenant(r.Context(), pool, tu.TenantID, body.ProjectID) {
			response.Err(w, http.StatusNotFound, "Project not found.", "ERR_NOT_FOUND")
			return
		}
		workDate, err := parseDate(body.WorkDate)
		if err != nil {
			response.Validation(w, map[string]string{"work_date": "Invalid date. Use YYYY-MM-DD."})
			return
		}
		cost := roundMoney(body.Hours * body.HourlyRate)
		workerName := strings.TrimSpace(body.WorkerName)
		if workerName == "" && body.UserID != nil {
			_ = pool.QueryRow(r.Context(), `select coalesce(full_name, '') from public.users where id = $1`, *body.UserID).Scan(&workerName)
		}
		var id int64
		err = pool.QueryRow(r.Context(), `
			insert into public.job_cost_timesheets (
			  tenant_id, project_id, user_id, worker_name, work_date, hours, hourly_rate, cost_amount, description
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
			returning id`,
			tu.TenantID, body.ProjectID, body.UserID, workerName, workDate,
			body.Hours, body.HourlyRate, cost, body.Description,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create timesheet.", "ERR_INTERNAL")
			return
		}
		ts, _ := loadTimesheet(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "job_costing.timesheet.create", "job_cost_timesheet", &id, nil, body)
		response.OK(w, ts, "Created.")
	}
}

func loadTimesheet(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (Timesheet, error) {
	var row Timesheet
	err := pool.QueryRow(ctx, `
		select t.id, t.project_id, p.project_code, p.project_name,
		  t.user_id, t.worker_name, t.work_date::text,
		  t.hours::float8, t.hourly_rate::float8, t.cost_amount::float8, t.description
		from public.job_cost_timesheets t
		join public.job_cost_projects p on p.id = t.project_id
		where t.id = $1 and t.tenant_id = $2`, id, tenantID).Scan(
		&row.ID, &row.ProjectID, &row.ProjectCode, &row.ProjectName,
		&row.UserID, &row.WorkerName, &row.WorkDate,
		&row.Hours, &row.HourlyRate, &row.CostAmount, &row.Description,
	)
	return row, err
}

func validateTimesheetBody(body timesheetBody) map[string]string {
	errs := map[string]string{}
	if body.ProjectID <= 0 {
		errs["project_id"] = "Project is required."
	}
	if body.Hours <= 0 {
		errs["hours"] = "Hours must be greater than zero."
	}
	if body.HourlyRate < 0 {
		errs["hourly_rate"] = "Hourly rate cannot be negative."
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func roundMoney(v float64) float64 {
	return math.Round(v*10000) / 10000
}
