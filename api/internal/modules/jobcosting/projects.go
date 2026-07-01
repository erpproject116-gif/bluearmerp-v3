package jobcosting

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type Project struct {
	ID           int64   `json:"id"`
	ProjectCode  string  `json:"project_code"`
	ProjectName  string  `json:"project_name"`
	PartnerID    *int64  `json:"partner_id,omitempty"`
	PartnerName  string  `json:"partner_name,omitempty"`
	InvProjectID *int64  `json:"inv_project_id,omitempty"`
	Status       string  `json:"status"`
	StartDate    *string `json:"start_date,omitempty"`
	EndDate      *string `json:"end_date,omitempty"`
	Notes        *string `json:"notes,omitempty"`
}

type projectBody struct {
	ProjectCode  string  `json:"project_code"`
	ProjectName  string  `json:"project_name"`
	PartnerID    *int64  `json:"partner_id"`
	InvProjectID *int64  `json:"inv_project_id"`
	Status       string  `json:"status"`
	StartDate    *string `json:"start_date"`
	EndDate      *string `json:"end_date"`
	Notes        *string `json:"notes"`
}

type projectPatchBody struct {
	ProjectName  *string `json:"project_name"`
	PartnerID    *int64  `json:"partner_id"`
	InvProjectID *int64  `json:"inv_project_id"`
	Status       *string `json:"status"`
	StartDate    *string `json:"start_date"`
	EndDate      *string `json:"end_date"`
	Notes        *string `json:"notes"`
}

func registerProjectRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/projects", listProjects(pool))
	r.With(auth.RequirePermission("job_costing.projects_new", auth.AccessWrite)).Post("/projects", createProject(pool))
	r.Get("/projects/{id}", getProject(pool))
	r.With(auth.RequirePermission("job_costing.projects", auth.AccessWrite)).Patch("/projects/{id}", patchProject(pool))
	r.With(auth.RequirePermission("job_costing.budget_vs_actual", auth.AccessRead)).Get("/projects/{id}/budget-vs-actual", budgetVsActual(pool))
}

func listProjects(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"project_code": "p.project_code", "project_name": "p.project_name", "status": "p.status",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "project_name", allowed)
		if p.Order == "" {
			p.Order = "asc"
		}
		offset := httputil.Offset(p)
		where := "p.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
			where += fmt.Sprintf(" and (p.project_code ilike $%d or p.project_name ilike $%d)", n, n)
			args = append(args, "%"+q+"%")
			n++
		}
		if st := strings.TrimSpace(r.URL.Query().Get("status")); st != "" {
			where += fmt.Sprintf(" and p.status = $%d", n)
			args = append(args, st)
			n++
		}
		sortCol := allowed[p.Sort]
		if sortCol == "" {
			sortCol = "p.project_name"
		}
		q := fmt.Sprintf(`
			select p.id, p.project_code, p.project_name, p.partner_id, coalesce(pt.company_name, ''),
			  p.inv_project_id, p.status, p.start_date::text, p.end_date::text, p.notes,
			  count(*) over()
			from public.job_cost_projects p
			left join public.inv_partners pt on pt.id = p.partner_id
			where %s
			order by %s %s
			limit $%d offset $%d`, where, sortCol, orderSQL(p.Order), n, n+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list projects.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []Project
		var total int64
		for rows.Next() {
			var row Project
			if err := rows.Scan(
				&row.ID, &row.ProjectCode, &row.ProjectName, &row.PartnerID, &row.PartnerName,
				&row.InvProjectID, &row.Status, &row.StartDate, &row.EndDate, &row.Notes, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read projects.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []Project{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getProject(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		project, err := loadProject(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Project not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, project, "OK")
	}
}

func createProject(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body projectBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateProjectBody(body); errs != nil {
			response.Validation(w, errs)
			return
		}
		startDate, endDate, errs := parseOptionalDates(body.StartDate, body.EndDate)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.job_cost_projects (
			  tenant_id, project_code, project_name, partner_id, inv_project_id,
			  status, start_date, end_date, notes
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
			returning id`,
			tu.TenantID, strings.TrimSpace(body.ProjectCode), strings.TrimSpace(body.ProjectName),
			body.PartnerID, body.InvProjectID, defaultStatus(body.Status),
			startDate, endDate, body.Notes,
		).Scan(&id)
		if err != nil {
			if strings.Contains(err.Error(), "unique") {
				response.Validation(w, map[string]string{"project_code": "Project code already exists."})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to create project.", "ERR_INTERNAL")
			return
		}
		project, _ := loadProject(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "job_costing.project.create", "job_cost_project", &id, nil, body)
		response.OK(w, project, "Created.")
	}
}

func patchProject(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		before, err := loadProject(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Project not found.", "ERR_NOT_FOUND")
			return
		}
		var body projectPatchBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		sets := []string{"updated_at = now()"}
		args := []any{id, tu.TenantID}
		n := 3
		if body.ProjectName != nil {
			sets = append(sets, fmt.Sprintf("project_name = $%d", n))
			args = append(args, strings.TrimSpace(*body.ProjectName))
			n++
		}
		if body.PartnerID != nil {
			sets = append(sets, fmt.Sprintf("partner_id = $%d", n))
			args = append(args, body.PartnerID)
			n++
		}
		if body.InvProjectID != nil {
			sets = append(sets, fmt.Sprintf("inv_project_id = $%d", n))
			args = append(args, body.InvProjectID)
			n++
		}
		if body.Status != nil {
			sets = append(sets, fmt.Sprintf("status = $%d", n))
			args = append(args, strings.TrimSpace(*body.Status))
			n++
		}
		if body.StartDate != nil {
			d, err := parseDate(*body.StartDate)
			if err != nil {
				response.Validation(w, map[string]string{"start_date": "Invalid date."})
				return
			}
			sets = append(sets, fmt.Sprintf("start_date = $%d", n))
			args = append(args, d)
			n++
		}
		if body.EndDate != nil {
			d, err := parseDate(*body.EndDate)
			if err != nil {
				response.Validation(w, map[string]string{"end_date": "Invalid date."})
				return
			}
			sets = append(sets, fmt.Sprintf("end_date = $%d", n))
			args = append(args, d)
			n++
		}
		if body.Notes != nil {
			sets = append(sets, fmt.Sprintf("notes = $%d", n))
			args = append(args, body.Notes)
			n++
		}
		q := fmt.Sprintf(`update public.job_cost_projects set %s where id = $1 and tenant_id = $2`, strings.Join(sets, ", "))
		tag, err := pool.Exec(r.Context(), q, args...)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Project not found.", "ERR_NOT_FOUND")
			return
		}
		project, _ := loadProject(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "job_costing.project.update", "job_cost_project", &id, before, project)
		response.OK(w, project, "Updated.")
	}
}

func loadProject(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (Project, error) {
	var row Project
	err := pool.QueryRow(ctx, `
		select p.id, p.project_code, p.project_name, p.partner_id, coalesce(pt.company_name, ''),
		  p.inv_project_id, p.status, p.start_date::text, p.end_date::text, p.notes
		from public.job_cost_projects p
		left join public.inv_partners pt on pt.id = p.partner_id
		where p.id = $1 and p.tenant_id = $2`, id, tenantID).Scan(
		&row.ID, &row.ProjectCode, &row.ProjectName, &row.PartnerID, &row.PartnerName,
		&row.InvProjectID, &row.Status, &row.StartDate, &row.EndDate, &row.Notes,
	)
	return row, err
}

func validateProjectBody(body projectBody) map[string]string {
	errs := map[string]string{}
	if strings.TrimSpace(body.ProjectCode) == "" {
		errs["project_code"] = "Project code is required."
	}
	if strings.TrimSpace(body.ProjectName) == "" {
		errs["project_name"] = "Project name is required."
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func defaultStatus(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "active"
	}
	return s
}

func parseDate(s string) (time.Time, error) {
	return time.Parse("2006-01-02", strings.TrimSpace(s))
}

func parseOptionalDates(start, end *string) (*time.Time, *time.Time, map[string]string) {
	var sd, ed *time.Time
	if start != nil && strings.TrimSpace(*start) != "" {
		d, err := parseDate(*start)
		if err != nil {
			return nil, nil, map[string]string{"start_date": "Invalid date."}
		}
		sd = &d
	}
	if end != nil && strings.TrimSpace(*end) != "" {
		d, err := parseDate(*end)
		if err != nil {
			return nil, nil, map[string]string{"end_date": "Invalid date."}
		}
		ed = &d
	}
	return sd, ed, nil
}
