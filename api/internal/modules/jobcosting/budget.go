package jobcosting

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type BudgetLine struct {
	ID           int64   `json:"id"`
	ProjectID    int64   `json:"project_id"`
	LineNo       int     `json:"line_no"`
	Category     string  `json:"category"`
	Description  string  `json:"description"`
	BudgetAmount float64 `json:"budget_amount"`
}

type budgetLineBody struct {
	LineNo       int     `json:"line_no"`
	Category     string  `json:"category"`
	Description  string  `json:"description"`
	BudgetAmount float64 `json:"budget_amount"`
}

type BudgetVsActual struct {
	ProjectID      int64              `json:"project_id"`
	ProjectCode    string             `json:"project_code"`
	ProjectName    string             `json:"project_name"`
	TotalBudget    float64            `json:"total_budget"`
	TotalActual    float64            `json:"total_actual"`
	Variance       float64            `json:"variance"`
	BudgetLines    []BudgetLine       `json:"budget_lines"`
	TimesheetTotal float64            `json:"timesheet_total"`
	ByCategory     []CategoryVariance `json:"by_category"`
}

type CategoryVariance struct {
	Category  string  `json:"category"`
	Budget    float64 `json:"budget"`
	Actual    float64 `json:"actual"`
	Variance  float64 `json:"variance"`
}

func registerBudgetRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("job_costing.budget", auth.AccessRead)).Get("/projects/{id}/budget-lines", listBudgetLines(pool))
	r.With(auth.RequirePermission("job_costing.budget", auth.AccessWrite)).Post("/projects/{id}/budget-lines", createBudgetLine(pool))
	r.With(auth.RequirePermission("job_costing.budget", auth.AccessWrite)).Patch("/budget-lines/{id}", patchBudgetLine(pool))
	r.With(auth.RequirePermission("job_costing.budget", auth.AccessWrite)).Delete("/budget-lines/{id}", deleteBudgetLine(pool))
}

func listBudgetLines(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		projectID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid project id."})
			return
		}
		if !projectBelongsToTenant(r.Context(), pool, tu.TenantID, projectID) {
			response.Err(w, http.StatusNotFound, "Project not found.", "ERR_NOT_FOUND")
			return
		}
		lines, err := loadBudgetLines(r.Context(), pool, projectID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load budget lines.", "ERR_INTERNAL")
			return
		}
		response.OK(w, lines, "OK")
	}
}

func createBudgetLine(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		projectID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid project id."})
			return
		}
		if !projectBelongsToTenant(r.Context(), pool, tu.TenantID, projectID) {
			response.Err(w, http.StatusNotFound, "Project not found.", "ERR_NOT_FOUND")
			return
		}
		var body budgetLineBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateBudgetLineBody(body); errs != nil {
			response.Validation(w, errs)
			return
		}
		lineNo := body.LineNo
		if lineNo <= 0 {
			_ = pool.QueryRow(r.Context(), `
				select coalesce(max(line_no), 0) + 1 from public.job_cost_budget_lines where project_id = $1`, projectID).Scan(&lineNo)
		}
		var id int64
		err = pool.QueryRow(r.Context(), `
			insert into public.job_cost_budget_lines (project_id, line_no, category, description, budget_amount)
			values ($1, $2, $3, $4, $5)
			returning id`,
			projectID, lineNo, defaultCategory(body.Category), strings.TrimSpace(body.Description), body.BudgetAmount,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create budget line.", "ERR_INTERNAL")
			return
		}
		line, _ := loadBudgetLine(r.Context(), pool, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "job_costing.budget_line.create", "job_cost_budget_line", &id, nil, body)
		response.OK(w, line, "Created.")
	}
}

func patchBudgetLine(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body budgetLineBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		var projectID int64
		err = pool.QueryRow(r.Context(), `
			select bl.project_id from public.job_cost_budget_lines bl
			join public.job_cost_projects p on p.id = bl.project_id
			where bl.id = $1 and p.tenant_id = $2`, id, tu.TenantID).Scan(&projectID)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Budget line not found.", "ERR_NOT_FOUND")
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.job_cost_budget_lines set
			  category = $1, description = $2, budget_amount = $3, updated_at = now()
			where id = $4`,
			defaultCategory(body.Category), strings.TrimSpace(body.Description), body.BudgetAmount, id)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Budget line not found.", "ERR_NOT_FOUND")
			return
		}
		line, _ := loadBudgetLine(r.Context(), pool, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "job_costing.budget_line.update", "job_cost_budget_line", &id, nil, line)
		response.OK(w, line, "Updated.")
	}
}

func deleteBudgetLine(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			delete from public.job_cost_budget_lines bl
			using public.job_cost_projects p
			where bl.id = $1 and bl.project_id = p.id and p.tenant_id = $2`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Budget line not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "job_costing.budget_line.delete", "job_cost_budget_line", &id, nil, nil)
		response.OK(w, map[string]any{"id": id}, "Deleted.")
	}
}

func budgetVsActual(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		projectID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid project id."})
			return
		}
		project, err := loadProject(r.Context(), pool, tu.TenantID, projectID)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Project not found.", "ERR_NOT_FOUND")
			return
		}
		lines, err := loadBudgetLines(r.Context(), pool, projectID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load budget.", "ERR_INTERNAL")
			return
		}
		var timesheetTotal float64
		if err := pool.QueryRow(r.Context(), `
			select coalesce(sum(cost_amount), 0)::float8
			from public.job_cost_timesheets
			where tenant_id = $1 and project_id = $2`, tu.TenantID, projectID).Scan(&timesheetTotal); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load actuals.", "ERR_INTERNAL")
			return
		}
		var totalBudget float64
		catBudget := map[string]float64{}
		for _, ln := range lines {
			totalBudget += ln.BudgetAmount
			catBudget[ln.Category] += ln.BudgetAmount
		}
		byCategory := []CategoryVariance{}
		categories := []string{"labor", "materials", "overhead", "other"}
		for _, cat := range categories {
			budget := catBudget[cat]
			actual := 0.0
			if cat == "labor" {
				actual = timesheetTotal
			}
			byCategory = append(byCategory, CategoryVariance{
				Category: cat, Budget: budget, Actual: actual, Variance: budget - actual,
			})
		}
		out := BudgetVsActual{
			ProjectID: project.ID, ProjectCode: project.ProjectCode, ProjectName: project.ProjectName,
			TotalBudget: totalBudget, TotalActual: timesheetTotal, Variance: totalBudget - timesheetTotal,
			BudgetLines: lines, TimesheetTotal: timesheetTotal, ByCategory: byCategory,
		}
		response.OK(w, out, "OK")
	}
}

func loadBudgetLines(ctx context.Context, pool *pgxpool.Pool, projectID int64) ([]BudgetLine, error) {
	rows, err := pool.Query(ctx, `
		select id, project_id, line_no, category, description, budget_amount::float8
		from public.job_cost_budget_lines
		where project_id = $1
		order by line_no`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []BudgetLine
	for rows.Next() {
		var ln BudgetLine
		if err := rows.Scan(&ln.ID, &ln.ProjectID, &ln.LineNo, &ln.Category, &ln.Description, &ln.BudgetAmount); err != nil {
			return nil, err
		}
		out = append(out, ln)
	}
	if out == nil {
		out = []BudgetLine{}
	}
	return out, nil
}

func loadBudgetLine(ctx context.Context, pool *pgxpool.Pool, id int64) (BudgetLine, error) {
	var ln BudgetLine
	err := pool.QueryRow(ctx, `
		select id, project_id, line_no, category, description, budget_amount::float8
		from public.job_cost_budget_lines where id = $1`, id).Scan(
		&ln.ID, &ln.ProjectID, &ln.LineNo, &ln.Category, &ln.Description, &ln.BudgetAmount)
	return ln, err
}

func validateBudgetLineBody(body budgetLineBody) map[string]string {
	if body.BudgetAmount < 0 {
		return map[string]string{"budget_amount": "Budget amount cannot be negative."}
	}
	return nil
}

func defaultCategory(c string) string {
	c = strings.TrimSpace(c)
	if c == "" {
		return "other"
	}
	return c
}

func projectBelongsToTenant(ctx context.Context, pool *pgxpool.Pool, tenantID, projectID int64) bool {
	var exists bool
	_ = pool.QueryRow(ctx, `
		select exists(select 1 from public.job_cost_projects where id = $1 and tenant_id = $2)`,
		projectID, tenantID).Scan(&exists)
	return exists
}
