package inventory

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

type Project struct {
	ID          int64  `json:"id"`
	ProjectCode string `json:"project_code"`
	ProjectName string `json:"project_name"`
	Status       string         `json:"status"`
	CustomValues map[string]any `json:"custom_values,omitempty"`
}

type projectBody struct {
	ProjectName  string         `json:"project_name"`
	Status       string         `json:"status"`
	CustomValues map[string]any `json:"custom_values"`
}

func registerProjectRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/projects/next-code", nextCodeHandler(pool, "project"))
	r.Get("/projects", listProjects(pool))
	r.Post("/projects", createProject(pool))
	r.Patch("/projects/{id}", updateProject(pool))
	r.Delete("/projects/{id}", deleteProject(pool))
}

func listProjects(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"project_code": "project_code",
		"project_name": "project_name",
		"status":       "status",
		"created_at":   "created_at",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "project_code", allowed)
		offset := httputil.Offset(p)
		where, args := buildWhere(tu.TenantID, p, "project_name", "project_code")
		q := fmt.Sprintf(`select id, project_code, project_name, status, count(*) over() from public.inv_projects where %s order by %s %s limit $%d offset $%d`,
			where, p.Sort, orderSQL(p.Order), len(args)+1, len(args)+2)
		args = append(args, p.PageSize, offset)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []Project
		var total int64
		for rows.Next() {
			var row Project
			if err := rows.Scan(&row.ID, &row.ProjectCode, &row.ProjectName, &row.Status, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []Project{}
		}
		attachListCustom(r.Context(), pool, tu.TenantID, entityProject, out, func(p Project) int64 { return p.ID }, func(p *Project, v map[string]any) { p.CustomValues = v })
		response.OKList(w, out, p.Page, p.PageSize, total)
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
		if strings.TrimSpace(body.ProjectName) == "" {
			response.Validation(w, map[string]string{"project_name": "Project name is required."})
			return
		}
		id, row, err := createWithCode(r.Context(), pool, tu, "project", func(ctx context.Context, tx pgxpoolConn, code string) (int64, Project, error) {
			var row Project
			err := tx.QueryRow(ctx, `insert into public.inv_projects (tenant_id, project_code, project_name, status) values ($1,$2,$3,$4)
				returning id, project_code, project_name, status`, tu.TenantID, code, strings.TrimSpace(body.ProjectName), defaultStatus(body.Status)).
				Scan(&row.ID, &row.ProjectCode, &row.ProjectName, &row.Status)
			return row.ID, row, err
		})
		if err != nil {
			if isUniqueViolation(err) {
				response.Err(w, http.StatusConflict, "A project with that code already exists. Try again.", "ERR_CONFLICT")
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to create project.", "ERR_INTERNAL")
			return
		}
		if errs := persistCustom(r.Context(), pool, tu.TenantID, entityProject, id, body.CustomValues); errs != nil {
			response.Validation(w, errs)
			return
		}
		row.CustomValues = attachCustom(r.Context(), pool, tu.TenantID, entityProject, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.project.create", "inv_project", &id, nil, body)
		response.OK(w, row, "Created.")
	}
}

func updateProject(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		var body projectBody
		_ = json.NewDecoder(r.Body).Decode(&body)
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		tag, err := tx.Exec(r.Context(), `update public.inv_projects set project_name=$1, status=$2, updated_at=now() where id=$3 and tenant_id=$4 and deleted_at is null`,
			strings.TrimSpace(body.ProjectName), defaultStatus(body.Status), id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
			return
		}
		if errs := saveCustom(r.Context(), tx, tu.TenantID, entityProject, id, body.CustomValues); errs != nil {
			response.Validation(w, errs)
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.project.update", "inv_project", &id, nil, body)
		response.OK(w, map[string]any{"id": id, "custom_values": attachCustom(r.Context(), pool, tu.TenantID, entityProject, id)}, "Updated.")
	}
}

func deleteProject(pool *pgxpool.Pool) http.HandlerFunc {
	return softDeleteHandler(pool, "inv_projects", "inventory.project.delete", "inv_project")
}
