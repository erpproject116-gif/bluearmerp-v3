package operations

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

var packCodeRe = regexp.MustCompile(`^[a-z][a-z0-9_-]{1,78}$`)

type packSummary struct {
	ID          int64  `json:"id"`
	PackCode    string `json:"pack_code"`
	PackName    string `json:"pack_name"`
	Description string `json:"description,omitempty"`
	IsSystem    bool   `json:"is_system"`
	Summary     string `json:"summary,omitempty"`
	SourcePack  string `json:"source_pack_code,omitempty"`
}

type packWriteBody struct {
	PackCode    string                    `json:"pack_code"`
	PackName    string                    `json:"pack_name"`
	Description string                    `json:"description"`
	Columns     []IndustryColumn          `json:"columns"`
	SampleItems []IndustryWorkItem        `json:"sample_work_items"`
	Rules       []IndustryAutomationRule  `json:"automation_rules"`
	Widgets     []IndustryDashboardWidget `json:"dashboard_widgets"`
}

type clonePackBody struct {
	PackCode string `json:"pack_code"`
	PackName string `json:"pack_name"`
}

type saveAsPackBody struct {
	PackCode    string `json:"pack_code"`
	PackName    string `json:"pack_name"`
	Description string `json:"description"`
}

type applyPackBody struct {
	PackID int64  `json:"pack_id"`
	Mode   string `json:"mode"` // add_missing_columns | replace_empty_only
}

func registerPackRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/packs", listPacks(pool))
	r.Get("/packs/{id}", getPack(pool))
	r.With(auth.RequirePermission("operations.packs", auth.AccessWrite)).Post("/packs", createPack(pool))
	r.With(auth.RequirePermission("operations.packs", auth.AccessWrite)).Post("/packs/{id}/clone", clonePack(pool))
	r.With(auth.RequirePermission("operations.packs", auth.AccessWrite)).Patch("/packs/{id}", patchPack(pool))
	r.With(auth.RequirePermission("operations.packs", auth.AccessWrite)).Delete("/packs/{id}", deletePack(pool))
	r.With(auth.RequirePermission("operations.packs", auth.AccessWrite)).
		Post("/workspaces/{id}/save-as-pack", saveWorkspaceAsPack(pool))
	r.With(auth.RequirePermission("operations.board_config", auth.AccessWrite)).
		Post("/workspaces/{id}/apply-pack", applyPackToWorkspace(pool))
}

func listIndustryPacksHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.OK(w, listIndustryPacks(), "OK")
			return
		}
		_ = ensurePlatformPacks(r.Context(), pool)
		rows, err := pool.Query(r.Context(), `
			select p.pack_code, p.pack_name,
			  (select count(*) from public.ops_pack_columns c where c.pack_id = p.id),
			  (select count(*) from public.ops_pack_sample_items s where s.pack_id = p.id)
			from public.ops_packs p
			where p.deleted_at is null
			  and (p.tenant_id is null or p.tenant_id = $1)
			order by p.is_system desc, p.pack_name asc`, tu.TenantID)
		if err != nil {
			response.OK(w, listIndustryPacks(), "OK")
			return
		}
		defer rows.Close()
		var out []map[string]string
		for rows.Next() {
			var code, name string
			var colCount, itemCount int
			if err := rows.Scan(&code, &name, &colCount, &itemCount); err != nil {
				continue
			}
			summary := fmt.Sprintf("%d Kanban columns", colCount)
			if itemCount > 0 {
				summary += fmt.Sprintf(", %d starter tasks", itemCount)
			}
			out = append(out, map[string]string{
				"pack_code": code,
				"pack_name": name,
				"summary":   summary,
			})
		}
		if len(out) == 0 {
			response.OK(w, listIndustryPacks(), "OK")
			return
		}
		response.OK(w, out, "OK")
	}
}

func listPacks(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		_ = ensurePlatformPacks(r.Context(), pool)
		rows, err := pool.Query(r.Context(), `
			select p.id, p.pack_code, p.pack_name, coalesce(p.description, ''), p.is_system,
			  coalesce(p.source_pack_code, ''),
			  (select count(*) from public.ops_pack_columns c where c.pack_id = p.id),
			  (select count(*) from public.ops_pack_sample_items s where s.pack_id = p.id)
			from public.ops_packs p
			where p.deleted_at is null
			  and (p.tenant_id is null or p.tenant_id = $1)
			order by p.is_system desc, p.pack_name asc`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list packs.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []packSummary
		for rows.Next() {
			var s packSummary
			var colCount, itemCount int
			if err := rows.Scan(&s.ID, &s.PackCode, &s.PackName, &s.Description, &s.IsSystem, &s.SourcePack, &colCount, &itemCount); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read packs.", "ERR_INTERNAL")
				return
			}
			s.Summary = fmt.Sprintf("%d Kanban columns", colCount)
			if itemCount > 0 {
				s.Summary += fmt.Sprintf(", %d starter tasks", itemCount)
			}
			out = append(out, s)
		}
		if out == nil {
			out = []packSummary{}
		}
		response.OK(w, out, "OK")
	}
}

func getPack(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid pack id."})
			return
		}
		pack, err := loadPackDefinition(r.Context(), pool, tu.TenantID, id, "")
		if err != nil {
			response.Err(w, http.StatusNotFound, "Pack not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, pack, "OK")
	}
}

func createPack(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body packWriteBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validatePackWrite(body, true); len(errs) > 0 {
			response.Validation(w, errs)
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start transaction.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.ops_packs (tenant_id, pack_code, pack_name, description, is_system)
			values ($1, $2, $3, $4, false)
			returning id`,
			tu.TenantID, body.PackCode, body.PackName, nullIfBlank(body.Description),
		).Scan(&id)
		if err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "unique") {
				response.Validation(w, map[string]string{"pack_code": "Pack code already exists."})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to create pack.", "ERR_INTERNAL")
			return
		}
		if err := replacePackChildrenTx(r.Context(), tx, id, body); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save pack details.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create pack.", "ERR_INTERNAL")
			return
		}
		pack, _ := loadPackDefinition(r.Context(), pool, tu.TenantID, id, "")
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "operations.pack.create", "ops_pack", &id, nil, body)
		response.OK(w, pack, "Created.")
	}
}

func clonePack(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		srcID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || srcID <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid pack id."})
			return
		}
		src, err := loadPackDefinition(r.Context(), pool, tu.TenantID, srcID, "")
		if err != nil {
			response.Err(w, http.StatusNotFound, "Pack not found.", "ERR_NOT_FOUND")
			return
		}
		var body clonePackBody
		_ = json.NewDecoder(r.Body).Decode(&body)
		code := strings.TrimSpace(body.PackCode)
		name := strings.TrimSpace(body.PackName)
		if code == "" {
			code = src.PackCode + "_copy"
		}
		if name == "" {
			name = src.PackName + " (copy)"
		}
		if !packCodeRe.MatchString(code) {
			response.Validation(w, map[string]string{"pack_code": "Invalid pack code."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start transaction.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.ops_packs (tenant_id, pack_code, pack_name, description, source_pack_code, is_system)
			values ($1, $2, $3, $4, $5, false)
			returning id`,
			tu.TenantID, code, name, nullIfBlank(src.Description), src.PackCode,
		).Scan(&id)
		if err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "unique") {
				response.Validation(w, map[string]string{"pack_code": "Pack code already exists."})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to clone pack.", "ERR_INTERNAL")
			return
		}
		write := packWriteBody{
			Columns: src.Columns, SampleItems: src.SampleWorkItems,
			Rules: src.AutomationRules, Widgets: src.DashboardWidgets,
		}
		if err := replacePackChildrenTx(r.Context(), tx, id, write); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to clone pack details.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to clone pack.", "ERR_INTERNAL")
			return
		}
		pack, _ := loadPackDefinition(r.Context(), pool, tu.TenantID, id, "")
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "operations.pack.clone", "ops_pack", &id, nil, body)
		response.OK(w, pack, "Cloned.")
	}
}

func patchPack(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid pack id."})
			return
		}
		var isSystem bool
		var owner *int64
		err = pool.QueryRow(r.Context(), `
			select is_system, tenant_id from public.ops_packs
			where id = $1 and deleted_at is null`, id).Scan(&isSystem, &owner)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Pack not found.", "ERR_NOT_FOUND")
			return
		}
		if isSystem || owner == nil || *owner != tu.TenantID {
			response.Err(w, http.StatusForbidden, "System packs cannot be edited. Clone them first.", "ERR_FORBIDDEN")
			return
		}
		var body packWriteBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validatePackWrite(body, false); len(errs) > 0 {
			response.Validation(w, errs)
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start transaction.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		name := strings.TrimSpace(body.PackName)
		if name == "" {
			response.Validation(w, map[string]string{"pack_name": "Pack name is required."})
			return
		}
		if _, err := tx.Exec(r.Context(), `
			update public.ops_packs
			set pack_name = $1, description = $2, updated_at = now()
			where id = $3 and tenant_id = $4`,
			name, nullIfBlank(body.Description), id, tu.TenantID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update pack.", "ERR_INTERNAL")
			return
		}
		if body.Columns != nil || body.SampleItems != nil || body.Rules != nil || body.Widgets != nil {
			if err := replacePackChildrenTx(r.Context(), tx, id, body); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to update pack details.", "ERR_INTERNAL")
				return
			}
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update pack.", "ERR_INTERNAL")
			return
		}
		pack, _ := loadPackDefinition(r.Context(), pool, tu.TenantID, id, "")
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "operations.pack.update", "ops_pack", &id, nil, body)
		response.OK(w, pack, "Updated.")
	}
}

func deletePack(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid pack id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.ops_packs set deleted_at = now(), updated_at = now()
			where id = $1 and tenant_id = $2 and is_system = false and deleted_at is null`,
			id, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to delete pack.", "ERR_INTERNAL")
			return
		}
		if tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Pack not found or cannot be deleted.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "operations.pack.delete", "ops_pack", &id, nil, nil)
		response.OK(w, nil, "Deleted.")
	}
}

func saveWorkspaceAsPack(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		workspaceID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || workspaceID <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid workspace id."})
			return
		}
		ws, err := loadWorkspace(r.Context(), pool, tu.TenantID, workspaceID)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Workspace not found.", "ERR_NOT_FOUND")
			return
		}
		var body saveAsPackBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		code := strings.ToLower(strings.TrimSpace(body.PackCode))
		name := strings.TrimSpace(body.PackName)
		if name == "" {
			name = ws.WorkspaceName + " pack"
		}
		if code == "" {
			code = "ws_" + strings.ToLower(regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(strings.ToLower(ws.WorkspaceCode), "_"))
		}
		if !packCodeRe.MatchString(code) {
			response.Validation(w, map[string]string{"pack_code": "Invalid pack code."})
			return
		}
		cols, err := loadColumns(r.Context(), pool, workspaceID)
		if err != nil || len(cols) == 0 {
			response.Validation(w, map[string]string{"id": "Workspace has no active columns to save."})
			return
		}
		write := packWriteBody{PackName: name, Description: body.Description}
		for _, c := range cols {
			col := IndustryColumn{
				Key: c.ColumnKey, Name: c.ColumnName, SortOrder: c.SortOrder,
				IsDone: c.IsDone, WipLimit: c.WipLimit,
			}
			if c.ColumnColor != nil {
				col.Color = *c.ColumnColor
			}
			write.Columns = append(write.Columns, col)
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start transaction.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		src := ""
		if ws.IndustryPack != nil {
			src = *ws.IndustryPack
		}
		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.ops_packs (tenant_id, pack_code, pack_name, description, source_pack_code, is_system)
			values ($1, $2, $3, $4, $5, false)
			returning id`,
			tu.TenantID, code, name, nullIfBlank(body.Description), nullIfBlank(src),
		).Scan(&id)
		if err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "unique") {
				response.Validation(w, map[string]string{"pack_code": "Pack code already exists."})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to save pack.", "ERR_INTERNAL")
			return
		}
		if err := replacePackChildrenTx(r.Context(), tx, id, write); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save pack columns.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save pack.", "ERR_INTERNAL")
			return
		}
		pack, _ := loadPackDefinition(r.Context(), pool, tu.TenantID, id, "")
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "operations.pack.save_as", "ops_pack", &id, nil, body)
		response.OK(w, pack, "Saved as pack.")
	}
}

func applyPackToWorkspace(pool *pgxpool.Pool) http.HandlerFunc {
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
		var body applyPackBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.PackID <= 0 {
			response.Validation(w, map[string]string{"pack_id": "pack_id is required."})
			return
		}
		mode := strings.TrimSpace(body.Mode)
		if mode == "" {
			mode = "add_missing_columns"
		}
		if mode != "add_missing_columns" && mode != "replace_empty_only" {
			response.Validation(w, map[string]string{"mode": "Supported modes: add_missing_columns, replace_empty_only."})
			return
		}
		pack, err := loadPackDefinition(r.Context(), pool, tu.TenantID, body.PackID, "")
		if err != nil {
			response.Validation(w, map[string]string{"pack_id": "Unknown pack."})
			return
		}

		existing, _ := loadColumns(r.Context(), pool, workspaceID)
		if mode == "replace_empty_only" {
			var itemCount int64
			_ = pool.QueryRow(r.Context(), `
				select count(*) from public.wm_work_items where workspace_id = $1`, workspaceID).Scan(&itemCount)
			if itemCount > 0 {
				response.Validation(w, map[string]string{"mode": "Board has work items; use add_missing_columns instead."})
				return
			}
			if _, err := pool.Exec(r.Context(), `
				update public.wm_columns set archived_at = now()
				where workspace_id = $1 and archived_at is null`, workspaceID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to clear columns.", "ERR_INTERNAL")
				return
			}
			existing = nil
		}

		existingKeys := map[string]bool{}
		for _, c := range existing {
			existingKeys[c.ColumnKey] = true
		}
		added := 0
		for _, col := range pack.Columns {
			if existingKeys[col.Key] {
				continue
			}
			isDone := col.IsDone
			if _, err := pool.Exec(r.Context(), `
				insert into public.wm_columns (
				  workspace_id, column_key, column_name, sort_order, column_color, is_done, wip_limit
				) values ($1,$2,$3,$4,$5,$6,$7)
				on conflict (workspace_id, column_key) do update
				  set archived_at = null, column_name = excluded.column_name,
				      sort_order = excluded.sort_order, column_color = excluded.column_color,
				      is_done = excluded.is_done, wip_limit = excluded.wip_limit`,
				workspaceID, col.Key, col.Name, col.SortOrder, nullIfBlank(col.Color), isDone, col.WipLimit,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to apply pack columns.", "ERR_INTERNAL")
				return
			}
			added++
		}
		cols, _ := loadColumns(r.Context(), pool, workspaceID)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "operations.pack.apply", "wm_workspace", &workspaceID, nil, body)
		response.OK(w, map[string]any{"added_columns": added, "columns": cols}, "Pack applied.")
	}
}

func validatePackWrite(body packWriteBody, requireCode bool) map[string]string {
	errs := map[string]string{}
	if requireCode {
		code := strings.TrimSpace(body.PackCode)
		if !packCodeRe.MatchString(code) {
			errs["pack_code"] = "Pack code must be lowercase letters, numbers, underscore, or hyphen."
		}
	}
	if strings.TrimSpace(body.PackName) == "" {
		errs["pack_name"] = "Pack name is required."
	}
	if requireCode && len(body.Columns) == 0 {
		errs["columns"] = "Add at least one column."
	}
	return errs
}

func replacePackChildrenTx(ctx context.Context, tx pgx.Tx, packID int64, body packWriteBody) error {
	if body.Columns != nil {
		if _, err := tx.Exec(ctx, `delete from public.ops_pack_columns where pack_id = $1`, packID); err != nil {
			return err
		}
		for _, col := range body.Columns {
			key := strings.TrimSpace(col.Key)
			if key == "" {
				continue
			}
			isDone := col.IsDone || key == "done" || key == "closed"
			if _, err := tx.Exec(ctx, `
				insert into public.ops_pack_columns (
				  pack_id, column_key, column_name, sort_order, column_color, is_done, wip_limit
				) values ($1,$2,$3,$4,$5,$6,$7)`,
				packID, key, col.Name, col.SortOrder, nullIfBlank(col.Color), isDone, col.WipLimit,
			); err != nil {
				return err
			}
		}
	}
	if body.SampleItems != nil {
		if _, err := tx.Exec(ctx, `delete from public.ops_pack_sample_items where pack_id = $1`, packID); err != nil {
			return err
		}
		for i, sample := range body.SampleItems {
			prio := sample.Priority
			if prio == "" {
				prio = "normal"
			}
			if _, err := tx.Exec(ctx, `
				insert into public.ops_pack_sample_items (
				  pack_id, title, column_key, priority, start_date_offset_days, end_date_offset_days, sort_order
				) values ($1,$2,$3,$4,$5,$6,$7)`,
				packID, sample.Title, sample.ColumnKey, prio, sample.StartDateOffsetDays, sample.EndDateOffsetDays, i*10,
			); err != nil {
				return err
			}
		}
	}
	if body.Rules != nil {
		if _, err := tx.Exec(ctx, `delete from public.ops_pack_automation_rules where pack_id = $1`, packID); err != nil {
			return err
		}
		for i, rule := range body.Rules {
			trig, _ := json.Marshal(rule.TriggerConfig)
			act, _ := json.Marshal(rule.ActionConfig)
			if _, err := tx.Exec(ctx, `
				insert into public.ops_pack_automation_rules (
				  pack_id, rule_name, trigger_event, trigger_config, action_type, action_config, sort_order
				) values ($1,$2,$3,$4,$5,$6,$7)`,
				packID, rule.RuleName, rule.TriggerEvent, trig, rule.ActionType, act, i*10,
			); err != nil {
				return err
			}
		}
	}
	if body.Widgets != nil {
		if _, err := tx.Exec(ctx, `delete from public.ops_pack_dashboard_widgets where pack_id = $1`, packID); err != nil {
			return err
		}
		for _, widget := range body.Widgets {
			cfg := widget.Config
			if cfg == nil {
				cfg = map[string]any{}
			}
			cfgJSON, _ := json.Marshal(cfg)
			if _, err := tx.Exec(ctx, `
				insert into public.ops_pack_dashboard_widgets (
				  pack_id, widget_type, title, config, grid_x, grid_y, grid_w, grid_h, sort_order
				) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
				packID, widget.WidgetType, widget.Title, cfgJSON,
				widget.GridX, widget.GridY, widget.GridW, widget.GridH, widget.SortOrder,
			); err != nil {
				return err
			}
		}
	}
	return nil
}

func loadPackDefinition(ctx context.Context, pool *pgxpool.Pool, tenantID, packID int64, packCode string) (IndustryPack, error) {
	_ = ensurePlatformPacks(ctx, pool)
	var pack IndustryPack
	var desc *string
	var err error
	if packID > 0 {
		err = pool.QueryRow(ctx, `
			select id, pack_code, pack_name, description, is_system, tenant_id
			from public.ops_packs
			where id = $1 and deleted_at is null
			  and (tenant_id is null or tenant_id = $2)`, packID, tenantID).Scan(
			&pack.ID, &pack.PackCode, &pack.PackName, &desc, &pack.IsSystem, &pack.TenantID,
		)
	} else {
		err = pool.QueryRow(ctx, `
			select id, pack_code, pack_name, description, is_system, tenant_id
			from public.ops_packs
			where pack_code = $1 and deleted_at is null
			  and (tenant_id = $2 or tenant_id is null)
			order by tenant_id nulls last
			limit 1`, packCode, tenantID).Scan(
			&pack.ID, &pack.PackCode, &pack.PackName, &desc, &pack.IsSystem, &pack.TenantID,
		)
	}
	if err != nil {
		if packCode != "" {
			return loadEmbedPack(packCode)
		}
		return IndustryPack{}, err
	}
	if desc != nil {
		pack.Description = *desc
	}
	cols, err := pool.Query(ctx, `
		select column_key, column_name, sort_order, coalesce(column_color, ''), is_done, wip_limit
		from public.ops_pack_columns where pack_id = $1 order by sort_order, id`, pack.ID)
	if err != nil {
		return IndustryPack{}, err
	}
	defer cols.Close()
	for cols.Next() {
		var c IndustryColumn
		var color string
		if err := cols.Scan(&c.Key, &c.Name, &c.SortOrder, &color, &c.IsDone, &c.WipLimit); err != nil {
			return IndustryPack{}, err
		}
		c.Color = color
		pack.Columns = append(pack.Columns, c)
	}
	items, err := pool.Query(ctx, `
		select title, column_key, priority, start_date_offset_days, end_date_offset_days
		from public.ops_pack_sample_items where pack_id = $1 order by sort_order, id`, pack.ID)
	if err != nil {
		return IndustryPack{}, err
	}
	defer items.Close()
	for items.Next() {
		var s IndustryWorkItem
		if err := items.Scan(&s.Title, &s.ColumnKey, &s.Priority, &s.StartDateOffsetDays, &s.EndDateOffsetDays); err != nil {
			return IndustryPack{}, err
		}
		pack.SampleWorkItems = append(pack.SampleWorkItems, s)
	}
	rules, err := pool.Query(ctx, `
		select rule_name, trigger_event, trigger_config, action_type, action_config
		from public.ops_pack_automation_rules where pack_id = $1 order by sort_order, id`, pack.ID)
	if err != nil {
		return IndustryPack{}, err
	}
	defer rules.Close()
	for rules.Next() {
		var rule IndustryAutomationRule
		var trig, act []byte
		if err := rules.Scan(&rule.RuleName, &rule.TriggerEvent, &trig, &rule.ActionType, &act); err != nil {
			return IndustryPack{}, err
		}
		_ = json.Unmarshal(trig, &rule.TriggerConfig)
		_ = json.Unmarshal(act, &rule.ActionConfig)
		pack.AutomationRules = append(pack.AutomationRules, rule)
	}
	widgets, err := pool.Query(ctx, `
		select widget_type, title, config, grid_x, grid_y, grid_w, grid_h, sort_order
		from public.ops_pack_dashboard_widgets where pack_id = $1 order by sort_order, id`, pack.ID)
	if err != nil {
		return IndustryPack{}, err
	}
	defer widgets.Close()
	for widgets.Next() {
		var wid IndustryDashboardWidget
		var cfg []byte
		if err := widgets.Scan(&wid.WidgetType, &wid.Title, &cfg, &wid.GridX, &wid.GridY, &wid.GridW, &wid.GridH, &wid.SortOrder); err != nil {
			return IndustryPack{}, err
		}
		_ = json.Unmarshal(cfg, &wid.Config)
		pack.DashboardWidgets = append(pack.DashboardWidgets, wid)
	}
	return pack, nil
}

func applyPackToWorkspaceTx(ctx context.Context, tx pgx.Tx, tenantID, workspaceID int64, pack IndustryPack, columnIDs *map[string]int64) error {
	for _, col := range pack.Columns {
		var colID int64
		isDone := col.IsDone || col.Key == "done" || col.Key == "closed"
		if err := tx.QueryRow(ctx, `
			insert into public.wm_columns (
			  workspace_id, column_key, column_name, sort_order, column_color, is_done, wip_limit
			) values ($1, $2, $3, $4, $5, $6, $7)
			returning id`,
			workspaceID, col.Key, col.Name, col.SortOrder, nullIfBlank(col.Color), isDone, col.WipLimit,
		).Scan(&colID); err != nil {
			return errors.New("Failed to create columns.")
		}
		(*columnIDs)[col.Key] = colID
	}
	for _, sample := range pack.SampleWorkItems {
		colID, ok := (*columnIDs)[sample.ColumnKey]
		if !ok {
			continue
		}
		priority := sample.Priority
		if priority == "" {
			priority = "normal"
		}
		var startDate, endDate *time.Time
		if sample.StartDateOffsetDays != 0 || sample.EndDateOffsetDays != 0 {
			startDate = offsetDate(sample.StartDateOffsetDays)
			endDate = offsetDate(sample.EndDateOffsetDays)
		}
		if _, err := tx.Exec(ctx, `
			insert into public.wm_work_items (
			  tenant_id, workspace_id, column_id, title, status, priority, start_date, end_date
			) values ($1, $2, $3, $4, 'open', $5, $6, $7)`,
			tenantID, workspaceID, colID, sample.Title, priority, startDate, endDate,
		); err != nil {
			return errors.New("Failed to seed work items.")
		}
	}
	for _, rule := range pack.AutomationRules {
		triggerCfg, _ := json.Marshal(rule.TriggerConfig)
		actionCfg, _ := json.Marshal(rule.ActionConfig)
		if _, err := tx.Exec(ctx, `
			insert into public.wm_automation_rules (
			  tenant_id, workspace_id, rule_name, trigger_event, trigger_config,
			  action_type, action_config, is_active
			) values ($1, $2, $3, $4, $5, $6, $7, true)`,
			tenantID, workspaceID, rule.RuleName, rule.TriggerEvent, triggerCfg,
			rule.ActionType, actionCfg,
		); err != nil {
			return errors.New("Failed to seed automation rules.")
		}
	}
	if len(pack.DashboardWidgets) == 0 {
		return nil
	}
	var dashboardID int64
	if err := tx.QueryRow(ctx, `
		insert into public.wm_dashboards (tenant_id, workspace_id, dashboard_name, is_default)
		values ($1, $2, 'Operations Dashboard', true)
		returning id`,
		tenantID, workspaceID,
	).Scan(&dashboardID); err != nil {
		return errors.New("Failed to create dashboard.")
	}
	for _, widget := range pack.DashboardWidgets {
		cfg := widget.Config
		if cfg == nil {
			cfg = map[string]any{}
		}
		cfgJSON, _ := json.Marshal(cfg)
		if _, err := tx.Exec(ctx, `
			insert into public.wm_dashboard_widgets (
			  dashboard_id, widget_type, title, config, grid_x, grid_y, grid_w, grid_h, sort_order
			) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			dashboardID, widget.WidgetType, widget.Title, cfgJSON,
			widget.GridX, widget.GridY, widget.GridW, widget.GridH, widget.SortOrder,
		); err != nil {
			return errors.New("Failed to create dashboard widgets.")
		}
	}
	return nil
}

func ensurePlatformPacks(ctx context.Context, pool *pgxpool.Pool) error {
	if pool == nil {
		return nil
	}
	var n int
	if err := pool.QueryRow(ctx, `
		select count(*)::int from public.ops_packs where tenant_id is null and deleted_at is null`).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	for _, code := range embedPackCodes() {
		pack, err := loadEmbedPack(code)
		if err != nil {
			continue
		}
		tx, err := pool.Begin(ctx)
		if err != nil {
			return err
		}
		var id int64
		err = tx.QueryRow(ctx, `
			insert into public.ops_packs (tenant_id, pack_code, pack_name, description, is_system)
			select null, $1, $2, $3, true
			where not exists (
			  select 1 from public.ops_packs
			  where tenant_id is null and pack_code = $1 and deleted_at is null
			)
			returning id`, pack.PackCode, pack.PackName, nullIfBlank(pack.Description)).Scan(&id)
		if err != nil {
			_ = tx.Rollback(ctx)
			continue
		}
		write := packWriteBody{
			Columns: pack.Columns, SampleItems: pack.SampleWorkItems,
			Rules: pack.AutomationRules, Widgets: pack.DashboardWidgets,
		}
		if err := replacePackChildrenTx(ctx, tx, id, write); err != nil {
			_ = tx.Rollback(ctx)
			continue
		}
		if err := tx.Commit(ctx); err != nil {
			continue
		}
	}
	return nil
}
