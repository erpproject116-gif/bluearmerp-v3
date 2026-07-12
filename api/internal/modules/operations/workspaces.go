package operations

import (
	"context"
	"encoding/json"
	"fmt"
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

type Workspace struct {
	ID                int64   `json:"id"`
	WorkspaceCode     string  `json:"workspace_code"`
	WorkspaceName     string  `json:"workspace_name"`
	IndustryPack      *string `json:"industry_pack,omitempty"`
	InvProjectID      *int64  `json:"inv_project_id,omitempty"`
	JobCostProjectID  *int64  `json:"job_cost_project_id,omitempty"`
	InvProjectCode    string  `json:"inv_project_code,omitempty"`
	JobCostProjectCode string `json:"job_cost_project_code,omitempty"`
	Status            string  `json:"status"`
}

type workspaceBody struct {
	WorkspaceCode string  `json:"workspace_code"`
	WorkspaceName string  `json:"workspace_name"`
	IndustryPack  *string `json:"industry_pack"`
	PackID        *int64  `json:"pack_id"`
	Status        string  `json:"status"`
}

type workspacePatchBody struct {
	WorkspaceName *string `json:"workspace_name"`
	Status        *string `json:"status"`
}

func registerWorkspaceRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/industry-packs", listIndustryPacksHandler(pool))
	r.Get("/workspaces", listWorkspaces(pool))
	r.With(auth.RequirePermission("operations.workspaces_new", auth.AccessWrite)).Post("/workspaces", createWorkspace(pool))
	r.Get("/workspaces/{id}", getWorkspace(pool))
	r.With(auth.RequirePermission("operations.workspaces", auth.AccessWrite)).Patch("/workspaces/{id}", patchWorkspace(pool))
	r.Get("/workspaces/{id}/columns", listColumns(pool))
	registerColumnRoutes(r, pool)
	registerPackRoutes(r, pool)
}

func listWorkspaces(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"workspace_code": "w.workspace_code", "workspace_name": "w.workspace_name", "status": "w.status",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "workspace_name", allowed)
		if p.Order == "" {
			p.Order = "asc"
		}
		offset := httputil.Offset(p)
		where := "w.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
			where += fmt.Sprintf(" and (w.workspace_code ilike $%d or w.workspace_name ilike $%d)", n, n)
			args = append(args, "%"+q+"%")
			n++
		}
		sortCol := allowed[p.Sort]
		if sortCol == "" {
			sortCol = "w.workspace_name"
		}
		q := fmt.Sprintf(`
			select w.id, w.workspace_code, w.workspace_name, w.industry_pack,
			  w.inv_project_id, w.job_cost_project_id,
			  coalesce(ip.project_code, ''), coalesce(jp.project_code, ''),
			  w.status, count(*) over()
			from public.wm_workspaces w
			left join public.inv_projects ip on ip.id = w.inv_project_id
			left join public.job_cost_projects jp on jp.id = w.job_cost_project_id
			where %s
			order by %s %s
			limit $%d offset $%d`, where, sortCol, orderSQL(p.Order), n, n+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list workspaces.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []Workspace
		var total int64
		for rows.Next() {
			var row Workspace
			if err := rows.Scan(
				&row.ID, &row.WorkspaceCode, &row.WorkspaceName, &row.IndustryPack,
				&row.InvProjectID, &row.JobCostProjectID,
				&row.InvProjectCode, &row.JobCostProjectCode,
				&row.Status, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read workspaces.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []Workspace{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getWorkspace(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		row, err := loadWorkspace(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Workspace not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, row, "OK")
	}
}

func createWorkspace(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body workspaceBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateWorkspaceBody(body); errs != nil {
			response.Validation(w, errs)
			return
		}

		var pack IndustryPack
		var hasPack bool
		var packLabel *string
		if body.PackID != nil && *body.PackID > 0 {
			var err error
			pack, err = loadPackDefinition(r.Context(), pool, tu.TenantID, *body.PackID, "")
			if err != nil {
				response.Validation(w, map[string]string{"pack_id": "Unknown industry pack."})
				return
			}
			hasPack = true
			code := pack.PackCode
			packLabel = &code
		} else if body.IndustryPack != nil && strings.TrimSpace(*body.IndustryPack) != "" {
			code := strings.TrimSpace(*body.IndustryPack)
			var err error
			pack, err = loadPackDefinition(r.Context(), pool, tu.TenantID, 0, code)
			if err != nil {
				response.Validation(w, map[string]string{"industry_pack": "Unknown industry pack."})
				return
			}
			hasPack = true
			packLabel = &code
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start transaction.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var invProjectID int64
		invProjectID, _, err = allocateInventoryProject(r.Context(), tx, tu.TenantID, strings.TrimSpace(body.WorkspaceName))
		if err != nil {
			response.Err(w, http.StatusInternalServerError, inventoryProjectErrorMessage(err), "ERR_INTERNAL")
			return
		}

		jcCode := strings.TrimSpace(body.WorkspaceCode)
		jobCostProjectID, err := createJobCostProject(r.Context(), tx, tu.TenantID, jcCode, strings.TrimSpace(body.WorkspaceName), invProjectID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create job cost project.", "ERR_INTERNAL")
			return
		}

		status := strings.TrimSpace(body.Status)
		if status == "" {
			status = "active"
		}
		var workspaceID int64
		if err := tx.QueryRow(r.Context(), `
			insert into public.wm_workspaces (
			  tenant_id, workspace_code, workspace_name, industry_pack,
			  inv_project_id, job_cost_project_id, status
			) values ($1, $2, $3, $4, $5, $6, $7)
			returning id`,
			tu.TenantID, jcCode, strings.TrimSpace(body.WorkspaceName), packLabel,
			invProjectID, jobCostProjectID, status,
		).Scan(&workspaceID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create workspace.", "ERR_INTERNAL")
			return
		}

		columnIDs := map[string]int64{}
		if hasPack {
			if err := applyPackToWorkspaceTx(r.Context(), tx, tu.TenantID, workspaceID, pack, &columnIDs); err != nil {
				response.Err(w, http.StatusInternalServerError, err.Error(), "ERR_INTERNAL")
				return
			}
		} else {
			defaultCols := []IndustryColumn{
				{Key: "todo", Name: "To Do", SortOrder: 0},
				{Key: "doing", Name: "In Progress", SortOrder: 10},
				{Key: "done", Name: "Done", SortOrder: 20, IsDone: true},
			}
			for _, col := range defaultCols {
				var colID int64
				if err := tx.QueryRow(r.Context(), `
					insert into public.wm_columns (workspace_id, column_key, column_name, sort_order, is_done)
					values ($1, $2, $3, $4, $5)
					returning id`,
					workspaceID, col.Key, col.Name, col.SortOrder, col.IsDone,
				).Scan(&colID); err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to create columns.", "ERR_INTERNAL")
					return
				}
				columnIDs[col.Key] = colID
			}
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create workspace.", "ERR_INTERNAL")
			return
		}

		row, _ := loadWorkspace(r.Context(), pool, tu.TenantID, workspaceID)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "operations.workspace.create", "wm_workspace", &workspaceID, nil, body)
		EmitERPEvent(r.Context(), pool, tu.TenantID, "workspace.created", map[string]any{
			"workspace_id": workspaceID, "industry_pack": packLabel,
		})
		response.OK(w, row, "Created.")
	}
}

func patchWorkspace(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid workspace id."})
			return
		}
		existing, err := loadWorkspace(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Workspace not found.", "ERR_NOT_FOUND")
			return
		}
		var body workspacePatchBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		name := existing.WorkspaceName
		if body.WorkspaceName != nil {
			name = strings.TrimSpace(*body.WorkspaceName)
			if name == "" {
				response.Validation(w, map[string]string{"workspace_name": "Workspace name is required."})
				return
			}
		}
		status := existing.Status
		if body.Status != nil {
			status = strings.TrimSpace(*body.Status)
			if status != "active" && status != "archived" {
				response.Validation(w, map[string]string{"status": "Status must be active or archived."})
				return
			}
		}
		if _, err := pool.Exec(r.Context(), `
			update public.wm_workspaces
			set workspace_name = $1, status = $2, updated_at = now()
			where id = $3 and tenant_id = $4`,
			name, status, id, tu.TenantID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update workspace.", "ERR_INTERNAL")
			return
		}
		row, _ := loadWorkspace(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "operations.workspace.update", "wm_workspace", &id, nil, body)
		response.OK(w, row, "Updated.")
	}
}

func listColumns(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		workspaceID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid workspace id."})
			return
		}
		if !workspaceBelongsToTenant(r.Context(), pool, tu.TenantID, workspaceID) {
			response.Err(w, http.StatusNotFound, "Workspace not found.", "ERR_NOT_FOUND")
			return
		}
		cols, err := loadColumns(r.Context(), pool, workspaceID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load columns.", "ERR_INTERNAL")
			return
		}
		response.OK(w, cols, "OK")
	}
}

type Column struct {
	ID          int64   `json:"id"`
	WorkspaceID int64   `json:"workspace_id"`
	ColumnKey   string  `json:"column_key"`
	ColumnName  string  `json:"column_name"`
	SortOrder   int     `json:"sort_order"`
	ColumnColor *string `json:"column_color,omitempty"`
	IsDone      bool    `json:"is_done"`
	WipLimit    *int    `json:"wip_limit,omitempty"`
	Archived    bool    `json:"archived"`
}

func loadColumns(ctx context.Context, pool *pgxpool.Pool, workspaceID int64) ([]Column, error) {
	rows, err := pool.Query(ctx, `
		select id, workspace_id, column_key, column_name, sort_order, column_color,
		  coalesce(is_done, false), wip_limit, archived_at is not null
		from public.wm_columns
		where workspace_id = $1 and archived_at is null
		order by sort_order, id`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Column
	for rows.Next() {
		var c Column
		if err := rows.Scan(
			&c.ID, &c.WorkspaceID, &c.ColumnKey, &c.ColumnName, &c.SortOrder, &c.ColumnColor,
			&c.IsDone, &c.WipLimit, &c.Archived,
		); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	if out == nil {
		out = []Column{}
	}
	return out, nil
}

func loadWorkspace(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (Workspace, error) {
	var row Workspace
	err := pool.QueryRow(ctx, `
		select w.id, w.workspace_code, w.workspace_name, w.industry_pack,
		  w.inv_project_id, w.job_cost_project_id,
		  coalesce(ip.project_code, ''), coalesce(jp.project_code, ''), w.status
		from public.wm_workspaces w
		left join public.inv_projects ip on ip.id = w.inv_project_id
		left join public.job_cost_projects jp on jp.id = w.job_cost_project_id
		where w.id = $1 and w.tenant_id = $2`, id, tenantID).Scan(
		&row.ID, &row.WorkspaceCode, &row.WorkspaceName, &row.IndustryPack,
		&row.InvProjectID, &row.JobCostProjectID,
		&row.InvProjectCode, &row.JobCostProjectCode, &row.Status,
	)
	return row, err
}

func validateWorkspaceBody(body workspaceBody) map[string]string {
	errs := map[string]string{}
	if strings.TrimSpace(body.WorkspaceCode) == "" {
		errs["workspace_code"] = "Workspace code is required."
	}
	if strings.TrimSpace(body.WorkspaceName) == "" {
		errs["workspace_name"] = "Workspace name is required."
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func nullIfBlank(s string) *string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return &s
}
