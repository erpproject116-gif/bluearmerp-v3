package operations

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type Dashboard struct {
	ID            int64  `json:"id"`
	WorkspaceID   *int64 `json:"workspace_id,omitempty"`
	DashboardName string `json:"dashboard_name"`
	IsDefault     bool   `json:"is_default"`
}

type DashboardWidget struct {
	ID         int64          `json:"id"`
	DashboardID int64         `json:"dashboard_id"`
	WidgetType string         `json:"widget_type"`
	Title      string         `json:"title"`
	Config     map[string]any `json:"config"`
	GridX      int            `json:"grid_x"`
	GridY      int            `json:"grid_y"`
	GridW      int            `json:"grid_w"`
	GridH      int            `json:"grid_h"`
	SortOrder  int            `json:"sort_order"`
}

type WidgetData struct {
	WidgetID   int64  `json:"widget_id"`
	WidgetType string `json:"widget_type"`
	Title      string `json:"title"`
	Data       any    `json:"data"`
}

type JobCostBVAData struct {
	ProjectID      int64              `json:"project_id"`
	ProjectCode    string             `json:"project_code"`
	ProjectName    string             `json:"project_name"`
	TotalBudget    float64            `json:"total_budget"`
	TotalActual    float64            `json:"total_actual"`
	Variance       float64            `json:"variance"`
	TimesheetTotal float64            `json:"timesheet_total"`
	ByCategory     []CategoryVariance `json:"by_category"`
}

type CategoryVariance struct {
	Category string  `json:"category"`
	Budget   float64 `json:"budget"`
	Actual   float64 `json:"actual"`
	Variance float64 `json:"variance"`
}

type WorkItemSummaryData struct {
	Open       int `json:"open"`
	InProgress int `json:"in_progress"`
	Done       int `json:"done"`
	Blocked    int `json:"blocked"`
}

type WorkItemRiskData struct {
	Overdue int `json:"overdue"`
	Blocked int `json:"blocked"`
	Due7d   int `json:"due_7d"`
}

type WorkItemCompletionData struct {
	PercentComplete float64 `json:"percent_complete"`
	Done            int     `json:"done"`
	Total           int     `json:"total"`
}

func registerDashboardRoutes(r chi.Router, pool *pgxpool.Pool) {
	dr := r.With(auth.RequirePermission("operations.dashboard", auth.AccessRead))
	dr.Get("/dashboards", listDashboards(pool))
	dr.Get("/dashboards/tasks-summary", tasksDashboardSummaryHandler(pool))
	dr.Get("/dashboards/{id}", getDashboard(pool))
	dr.Get("/dashboards/{id}/widgets", listDashboardWidgets(pool))
	dr.Get("/dashboards/{id}/widget-data", dashboardWidgetData(pool))
}

func listDashboards(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "dashboard_name", map[string]string{"dashboard_name": "d.dashboard_name"})
		offset := httputil.Offset(p)
		where := "d.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if wsID, err := strconv.ParseInt(r.URL.Query().Get("workspace_id"), 10, 64); err == nil && wsID > 0 {
			where += fmt.Sprintf(" and d.workspace_id = $%d", n)
			args = append(args, wsID)
			n++
		}
		q := fmt.Sprintf(`
			select d.id, d.workspace_id, d.dashboard_name, d.is_default, count(*) over()
			from public.wm_dashboards d
			where %s
			order by d.is_default desc, d.dashboard_name asc
			limit $%d offset $%d`, where, n, n+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list dashboards.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []Dashboard
		var total int64
		for rows.Next() {
			var row Dashboard
			if err := rows.Scan(&row.ID, &row.WorkspaceID, &row.DashboardName, &row.IsDefault, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read dashboards.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []Dashboard{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getDashboard(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		row, err := loadDashboard(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Dashboard not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, row, "OK")
	}
}

func listDashboardWidgets(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dashboardID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid dashboard id."})
			return
		}
		if !dashboardBelongsToTenant(r.Context(), pool, tu.TenantID, dashboardID) {
			response.Err(w, http.StatusNotFound, "Dashboard not found.", "ERR_NOT_FOUND")
			return
		}
		widgets, err := loadDashboardWidgets(r.Context(), pool, dashboardID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load widgets.", "ERR_INTERNAL")
			return
		}
		response.OK(w, widgets, "OK")
	}
}

func dashboardWidgetData(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dashboardID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid dashboard id."})
			return
		}
		dash, err := loadDashboard(r.Context(), pool, tu.TenantID, dashboardID)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Dashboard not found.", "ERR_NOT_FOUND")
			return
		}
		widgets, err := loadDashboardWidgets(r.Context(), pool, dashboardID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load widgets.", "ERR_INTERNAL")
			return
		}
		var jobCostProjectID *int64
		if dash.WorkspaceID != nil {
			var jcID *int64
			_ = pool.QueryRow(r.Context(), `
				select job_cost_project_id from public.wm_workspaces where id = $1 and tenant_id = $2`,
				*dash.WorkspaceID, tu.TenantID).Scan(&jcID)
			jobCostProjectID = jcID
		}

		if dash.WorkspaceID != nil {
			_ = ensureDefaultDashboardWidgets(r.Context(), pool, dash.ID)
			widgets, err = loadDashboardWidgets(r.Context(), pool, dashboardID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load widgets.", "ERR_INTERNAL")
				return
			}
		}

		var out []WidgetData
		var bvaCache any
		var bvaLoaded bool
		var summaryCache any
		var summaryLoaded bool
		var riskCache any
		var riskLoaded bool
		var completionCache any
		var completionLoaded bool
		for _, widget := range widgets {
			var data any
			var err error
			switch widget.WidgetType {
			case "job_cost_bva":
				if !bvaLoaded {
					bvaLoaded = true
					if jobCostProjectID == nil || *jobCostProjectID <= 0 {
						bvaCache = JobCostBVAData{}
					} else {
						bvaCache, err = loadJobCostBVA(r.Context(), pool, tu.TenantID, *jobCostProjectID)
						if err != nil {
							continue
						}
					}
				}
				data = bvaCache
			case "work_item_summary":
				if !summaryLoaded {
					summaryLoaded = true
					if dash.WorkspaceID == nil {
						summaryCache = WorkItemSummaryData{}
					} else {
						summaryCache, err = loadWorkItemSummary(r.Context(), pool, tu.TenantID, *dash.WorkspaceID)
						if err != nil {
							continue
						}
					}
				}
				data = summaryCache
			case "work_item_risk":
				if !riskLoaded {
					riskLoaded = true
					if dash.WorkspaceID == nil {
						riskCache = WorkItemRiskData{}
					} else {
						riskCache, err = loadWorkItemRisk(r.Context(), pool, tu.TenantID, *dash.WorkspaceID)
						if err != nil {
							continue
						}
					}
				}
				data = riskCache
			case "work_item_completion":
				if !completionLoaded {
					completionLoaded = true
					if dash.WorkspaceID == nil {
						completionCache = WorkItemCompletionData{}
					} else {
						completionCache, err = loadWorkItemCompletion(r.Context(), pool, tu.TenantID, *dash.WorkspaceID)
						if err != nil {
							continue
						}
					}
				}
				data = completionCache
			default:
				data = map[string]any{}
			}
			out = append(out, WidgetData{
				WidgetID: widget.ID, WidgetType: widget.WidgetType, Title: widget.Title, Data: data,
			})
		}
		if out == nil {
			out = []WidgetData{}
		}
		response.OK(w, out, "OK")
	}
}

func resolveWidgetData(ctx context.Context, pool *pgxpool.Pool, tenantID int64, w DashboardWidget, workspaceID *int64, jobCostProjectID *int64) (any, error) {
	switch w.WidgetType {
	case "job_cost_bva":
		if jobCostProjectID == nil || *jobCostProjectID <= 0 {
			return JobCostBVAData{}, nil
		}
		return loadJobCostBVA(ctx, pool, tenantID, *jobCostProjectID)
	case "work_item_summary":
		if workspaceID == nil {
			return WorkItemSummaryData{}, nil
		}
		return loadWorkItemSummary(ctx, pool, tenantID, *workspaceID)
	case "work_item_risk":
		if workspaceID == nil {
			return WorkItemRiskData{}, nil
		}
		return loadWorkItemRisk(ctx, pool, tenantID, *workspaceID)
	case "work_item_completion":
		if workspaceID == nil {
			return WorkItemCompletionData{}, nil
		}
		return loadWorkItemCompletion(ctx, pool, tenantID, *workspaceID)
	default:
		return map[string]any{}, nil
	}
}

func loadJobCostBVA(ctx context.Context, pool *pgxpool.Pool, tenantID, projectID int64) (JobCostBVAData, error) {
	var out JobCostBVAData
	err := pool.QueryRow(ctx, `
		select id, project_code, project_name
		from public.job_cost_projects
		where id = $1 and tenant_id = $2`, projectID, tenantID).Scan(&out.ProjectID, &out.ProjectCode, &out.ProjectName)
	if err != nil {
		return out, err
	}
	rows, err := pool.Query(ctx, `
		select category, budget_amount::float8
		from public.job_cost_budget_lines
		where project_id = $1`, projectID)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	catBudget := map[string]float64{}
	for rows.Next() {
		var cat string
		var amt float64
		if err := rows.Scan(&cat, &amt); err != nil {
			return out, err
		}
		out.TotalBudget += amt
		catBudget[cat] += amt
	}
	if err := pool.QueryRow(ctx, `
		select coalesce(sum(cost_amount), 0)::float8
		from public.job_cost_timesheets
		where tenant_id = $1 and project_id = $2`, tenantID, projectID).Scan(&out.TimesheetTotal); err != nil {
		return out, err
	}
	out.TotalActual = out.TimesheetTotal
	out.Variance = out.TotalBudget - out.TotalActual
	categories := []string{"labor", "materials", "overhead", "other"}
	for _, cat := range categories {
		budget := catBudget[cat]
		actual := 0.0
		if cat == "labor" {
			actual = out.TimesheetTotal
		}
		out.ByCategory = append(out.ByCategory, CategoryVariance{
			Category: cat, Budget: budget, Actual: actual, Variance: budget - actual,
		})
	}
	return out, nil
}

func loadWorkItemSummary(ctx context.Context, pool *pgxpool.Pool, tenantID, workspaceID int64) (WorkItemSummaryData, error) {
	var out WorkItemSummaryData
	rows, err := pool.Query(ctx, `
		select status, count(*)::int
		from public.wm_work_items
		where tenant_id = $1 and workspace_id = $2
		group by status`, tenantID, workspaceID)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var status string
		var count int
		if err := rows.Scan(&status, &count); err != nil {
			return out, err
		}
		switch status {
		case "open":
			out.Open = count
		case "in_progress":
			out.InProgress = count
		case "done":
			out.Done = count
		case "blocked":
			out.Blocked = count
		}
	}
	return out, nil
}

func loadWorkItemRisk(ctx context.Context, pool *pgxpool.Pool, tenantID, workspaceID int64) (WorkItemRiskData, error) {
	var out WorkItemRiskData
	err := pool.QueryRow(ctx, `
		select
		  count(*) filter (
		    where status <> 'done' and end_date is not null and end_date < current_date
		  )::int as overdue,
		  count(*) filter (where status = 'blocked')::int as blocked,
		  count(*) filter (
		    where status <> 'done'
		      and end_date is not null
		      and end_date >= current_date
		      and end_date < (current_date + interval '7 days')::date
		  )::int as due_7d
		from public.wm_work_items
		where tenant_id = $1 and workspace_id = $2`, tenantID, workspaceID).Scan(
		&out.Overdue, &out.Blocked, &out.Due7d,
	)
	return out, err
}

func loadWorkItemCompletion(ctx context.Context, pool *pgxpool.Pool, tenantID, workspaceID int64) (WorkItemCompletionData, error) {
	var out WorkItemCompletionData
	err := pool.QueryRow(ctx, `
		select
		  count(*) filter (where status = 'done')::int,
		  count(*) filter (
		    where status in ('open', 'in_progress', 'done', 'blocked')
		  )::int
		from public.wm_work_items
		where tenant_id = $1 and workspace_id = $2`, tenantID, workspaceID).Scan(&out.Done, &out.Total)
	if err != nil {
		return out, err
	}
	if out.Total > 0 {
		out.PercentComplete = float64(out.Done) * 100.0 / float64(out.Total)
	}
	return out, nil
}

// ensureDefaultDashboardWidgets inserts risk + completion widgets when missing on a default dashboard.
func ensureDefaultDashboardWidgets(ctx context.Context, pool *pgxpool.Pool, dashboardID int64) error {
	defaults := []struct {
		widgetType string
		title      string
		sortOrder  int
		gridX      int
		gridY      int
	}{
		{"job_cost_bva", "Budget vs Actual", 0, 0, 0},
		{"work_item_summary", "Work Items by Status", 10, 6, 0},
		{"work_item_risk", "Milestone risk", 20, 0, 3},
		{"work_item_completion", "% complete", 30, 6, 3},
	}
	for _, d := range defaults {
		var exists bool
		if err := pool.QueryRow(ctx, `
			select exists(
			  select 1 from public.wm_dashboard_widgets
			  where dashboard_id = $1 and widget_type = $2
			)`, dashboardID, d.widgetType).Scan(&exists); err != nil {
			return err
		}
		if exists {
			continue
		}
		if _, err := pool.Exec(ctx, `
			insert into public.wm_dashboard_widgets (
			  dashboard_id, widget_type, title, config, grid_x, grid_y, grid_w, grid_h, sort_order
			) values ($1, $2, $3, '{}'::jsonb, $4, $5, 6, 3, $6)`,
			dashboardID, d.widgetType, d.title, d.gridX, d.gridY, d.sortOrder,
		); err != nil {
			return err
		}
	}
	return nil
}

func loadDashboard(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (Dashboard, error) {
	var row Dashboard
	err := pool.QueryRow(ctx, `
		select id, workspace_id, dashboard_name, is_default
		from public.wm_dashboards
		where id = $1 and tenant_id = $2`, id, tenantID).Scan(
		&row.ID, &row.WorkspaceID, &row.DashboardName, &row.IsDefault,
	)
	return row, err
}

func loadDashboardWidgets(ctx context.Context, pool *pgxpool.Pool, dashboardID int64) ([]DashboardWidget, error) {
	rows, err := pool.Query(ctx, `
		select id, dashboard_id, widget_type, title, config, grid_x, grid_y, grid_w, grid_h, sort_order
		from public.wm_dashboard_widgets
		where dashboard_id = $1
		order by sort_order, id`, dashboardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DashboardWidget
	for rows.Next() {
		var w DashboardWidget
		var cfgRaw []byte
		if err := rows.Scan(
			&w.ID, &w.DashboardID, &w.WidgetType, &w.Title, &cfgRaw,
			&w.GridX, &w.GridY, &w.GridW, &w.GridH, &w.SortOrder,
		); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(cfgRaw, &w.Config)
		if w.Config == nil {
			w.Config = map[string]any{}
		}
		out = append(out, w)
	}
	if out == nil {
		out = []DashboardWidget{}
	}
	return out, nil
}

func dashboardBelongsToTenant(ctx context.Context, pool *pgxpool.Pool, tenantID, dashboardID int64) bool {
	var ok bool
	_ = pool.QueryRow(ctx, `
		select exists(select 1 from public.wm_dashboards where id = $1 and tenant_id = $2)`,
		dashboardID, tenantID).Scan(&ok)
	return ok
}
