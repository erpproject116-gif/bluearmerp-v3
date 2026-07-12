package operations

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

var columnKeyRe = regexp.MustCompile(`^[a-z][a-z0-9_]{0,48}$`)

type columnBody struct {
	ColumnKey   string  `json:"column_key"`
	ColumnName  string  `json:"column_name"`
	SortOrder   *int    `json:"sort_order"`
	ColumnColor *string `json:"column_color"`
	IsDone      *bool   `json:"is_done"`
	WipLimit    *int    `json:"wip_limit"`
}

type columnPatchBody struct {
	ColumnName  *string `json:"column_name"`
	SortOrder   *int    `json:"sort_order"`
	ColumnColor *string `json:"column_color"`
	IsDone      *bool   `json:"is_done"`
	WipLimit    *int    `json:"wip_limit"`
	Archived    *bool   `json:"archived"`
}

type reorderBody struct {
	Columns []struct {
		ID        int64 `json:"id"`
		SortOrder int   `json:"sort_order"`
	} `json:"columns"`
}

func registerColumnRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("operations.board_config", auth.AccessWrite)).
		Post("/workspaces/{id}/columns", createColumn(pool))
	r.With(auth.RequirePermission("operations.board_config", auth.AccessWrite)).
		Patch("/workspaces/{id}/columns/{columnId}", patchColumn(pool))
	r.With(auth.RequirePermission("operations.board_config", auth.AccessWrite)).
		Post("/workspaces/{id}/columns/reorder", reorderColumns(pool))
	r.With(auth.RequirePermission("operations.board_config", auth.AccessWrite)).
		Delete("/workspaces/{id}/columns/{columnId}", deleteColumn(pool))
}

func createColumn(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		workspaceID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || workspaceID <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid workspace id."})
			return
		}
		if !workspaceBelongsToTenant(r.Context(), pool, tu.TenantID, workspaceID) {
			response.Err(w, http.StatusNotFound, "Workspace not found.", "ERR_NOT_FOUND")
			return
		}
		var body columnBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		key := strings.ToLower(strings.TrimSpace(body.ColumnKey))
		name := strings.TrimSpace(body.ColumnName)
		errs := map[string]string{}
		if !columnKeyRe.MatchString(key) {
			errs["column_key"] = "Use lowercase letters, numbers, and underscores (e.g. in_progress)."
		}
		if name == "" {
			errs["column_name"] = "Column name is required."
		}
		if len(errs) > 0 {
			response.Validation(w, errs)
			return
		}
		sortOrder := 0
		if body.SortOrder != nil {
			sortOrder = *body.SortOrder
		} else {
			_ = pool.QueryRow(r.Context(), `
				select coalesce(max(sort_order), -10) + 10 from public.wm_columns
				where workspace_id = $1 and archived_at is null`, workspaceID).Scan(&sortOrder)
		}
		isDone := false
		if body.IsDone != nil {
			isDone = *body.IsDone
		}
		var id int64
		err = pool.QueryRow(r.Context(), `
			insert into public.wm_columns (
			  workspace_id, column_key, column_name, sort_order, column_color, is_done, wip_limit
			) values ($1,$2,$3,$4,$5,$6,$7)
			returning id`,
			workspaceID, key, name, sortOrder, body.ColumnColor, isDone, body.WipLimit,
		).Scan(&id)
		if err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "unique") {
				response.Validation(w, map[string]string{"column_key": "Column key already exists on this board."})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to create column.", "ERR_INTERNAL")
			return
		}
		cols, _ := loadColumns(r.Context(), pool, workspaceID)
		var created Column
		for _, c := range cols {
			if c.ID == id {
				created = c
				break
			}
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "operations.column.create", "wm_column", &id, nil, body)
		response.OK(w, created, "Created.")
	}
}

func patchColumn(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		workspaceID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		columnID, err2 := strconv.ParseInt(chi.URLParam(r, "columnId"), 10, 64)
		if err != nil || err2 != nil || workspaceID <= 0 || columnID <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		if !workspaceBelongsToTenant(r.Context(), pool, tu.TenantID, workspaceID) {
			response.Err(w, http.StatusNotFound, "Workspace not found.", "ERR_NOT_FOUND")
			return
		}
		var body columnPatchBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}

		var existing Column
		err = pool.QueryRow(r.Context(), `
			select id, workspace_id, column_key, column_name, sort_order, column_color,
			  coalesce(is_done, false), wip_limit, archived_at is not null
			from public.wm_columns
			where id = $1 and workspace_id = $2`, columnID, workspaceID).Scan(
			&existing.ID, &existing.WorkspaceID, &existing.ColumnKey, &existing.ColumnName,
			&existing.SortOrder, &existing.ColumnColor, &existing.IsDone, &existing.WipLimit, &existing.Archived,
		)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Column not found.", "ERR_NOT_FOUND")
			return
		}

		name := existing.ColumnName
		if body.ColumnName != nil {
			name = strings.TrimSpace(*body.ColumnName)
			if name == "" {
				response.Validation(w, map[string]string{"column_name": "Column name is required."})
				return
			}
		}
		sortOrder := existing.SortOrder
		if body.SortOrder != nil {
			sortOrder = *body.SortOrder
		}
		color := existing.ColumnColor
		if body.ColumnColor != nil {
			c := strings.TrimSpace(*body.ColumnColor)
			if c == "" {
				color = nil
			} else {
				color = &c
			}
		}
		isDone := existing.IsDone
		if body.IsDone != nil {
			isDone = *body.IsDone
		}
		wip := existing.WipLimit
		if body.WipLimit != nil {
			if *body.WipLimit <= 0 {
				wip = nil
			} else {
				wip = body.WipLimit
			}
		}
		archivedSQL := "archived_at"
		if body.Archived != nil {
			if *body.Archived {
				archivedSQL = "now()"
			} else {
				archivedSQL = "null"
			}
		}

		q := fmt.Sprintf(`
			update public.wm_columns
			set column_name = $1, sort_order = $2, column_color = $3, is_done = $4, wip_limit = $5,
			  archived_at = %s
			where id = $6 and workspace_id = $7`, archivedSQL)
		if _, err := pool.Exec(r.Context(), q, name, sortOrder, color, isDone, wip, columnID, workspaceID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update column.", "ERR_INTERNAL")
			return
		}
		cols, _ := loadColumns(r.Context(), pool, workspaceID)
		var updated Column
		for _, c := range cols {
			if c.ID == columnID {
				updated = c
				break
			}
		}
		if updated.ID == 0 {
			// may have been archived — reload including archived
			_ = pool.QueryRow(r.Context(), `
				select id, workspace_id, column_key, column_name, sort_order, column_color,
				  coalesce(is_done, false), wip_limit, archived_at is not null
				from public.wm_columns where id = $1`, columnID).Scan(
				&updated.ID, &updated.WorkspaceID, &updated.ColumnKey, &updated.ColumnName,
				&updated.SortOrder, &updated.ColumnColor, &updated.IsDone, &updated.WipLimit, &updated.Archived,
			)
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "operations.column.update", "wm_column", &columnID, nil, body)
		response.OK(w, updated, "Updated.")
	}
}

func reorderColumns(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		workspaceID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || workspaceID <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid workspace id."})
			return
		}
		if !workspaceBelongsToTenant(r.Context(), pool, tu.TenantID, workspaceID) {
			response.Err(w, http.StatusNotFound, "Workspace not found.", "ERR_NOT_FOUND")
			return
		}
		var body reorderBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.Columns) == 0 {
			response.Validation(w, map[string]string{"columns": "Provide columns with id and sort_order."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start transaction.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		for _, c := range body.Columns {
			tag, err := tx.Exec(r.Context(), `
				update public.wm_columns set sort_order = $1
				where id = $2 and workspace_id = $3 and archived_at is null`,
				c.SortOrder, c.ID, workspaceID)
			if err != nil || tag.RowsAffected() == 0 {
				response.Validation(w, map[string]string{"columns": fmt.Sprintf("Invalid column id %d.", c.ID)})
				return
			}
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to reorder columns.", "ERR_INTERNAL")
			return
		}
		cols, _ := loadColumns(r.Context(), pool, workspaceID)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "operations.column.reorder", "wm_workspace", &workspaceID, nil, body)
		response.OK(w, cols, "Reordered.")
	}
}

func deleteColumn(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		workspaceID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		columnID, err2 := strconv.ParseInt(chi.URLParam(r, "columnId"), 10, 64)
		if err != nil || err2 != nil || workspaceID <= 0 || columnID <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		if !workspaceBelongsToTenant(r.Context(), pool, tu.TenantID, workspaceID) {
			response.Err(w, http.StatusNotFound, "Workspace not found.", "ERR_NOT_FOUND")
			return
		}

		var activeCount int
		_ = pool.QueryRow(r.Context(), `
			select count(*)::int from public.wm_columns
			where workspace_id = $1 and archived_at is null`, workspaceID).Scan(&activeCount)
		if activeCount <= 1 {
			response.Validation(w, map[string]string{"id": "Cannot remove the last active column."})
			return
		}

		var itemCount int64
		_ = pool.QueryRow(r.Context(), `
			select count(*) from public.wm_work_items
			where workspace_id = $1 and column_id = $2`, workspaceID, columnID).Scan(&itemCount)
		force := strings.TrimSpace(r.URL.Query().Get("force")) == "1"
		if itemCount > 0 && !force {
			response.Validation(w, map[string]string{
				"id": fmt.Sprintf("Column has %d work items. Move them first, or archive with ?force=1.", itemCount),
			})
			return
		}

		// Soft-archive (preserve history / FK integrity)
		tag, err := pool.Exec(r.Context(), `
			update public.wm_columns set archived_at = now()
			where id = $1 and workspace_id = $2 and archived_at is null`, columnID, workspaceID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to archive column.", "ERR_INTERNAL")
			return
		}
		if tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Column not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "operations.column.archive", "wm_column", &columnID, nil, nil)
		response.OK(w, nil, "Archived.")
	}
}
