package usermgmt

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/tenantmodules"
)

type tenantModuleRow struct {
	ModuleCode   string   `json:"module_code"`
	ModuleName   string   `json:"module_name"`
	ModuleType   string   `json:"module_type"`
	IsEnabled    bool     `json:"is_enabled"`
	DependsOn    []string `json:"depends_on"`
	CanToggle    bool     `json:"can_toggle"`
	ParentModule string   `json:"parent_module,omitempty"`
}

type patchTenantModulesBody struct {
	Modules []struct {
		ModuleCode string `json:"module_code"`
		IsEnabled  bool   `json:"is_enabled"`
	} `json:"modules"`
	ApplyPolicySync bool   `json:"apply_policy_sync"`
	Preset          string `json:"preset,omitempty"`
}

func registerTenantModuleRoutes(ur chi.Router, pool *pgxpool.Pool) {
	ur.Get("/tenant-modules", getTenantModules(pool))
	ur.Post("/tenant-modules/preview", previewTenantModules(pool))
	ur.Patch("/tenant-modules", patchTenantModules(pool))
}

func getTenantModules(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		rows, err := listTenantModuleRows(r.Context(), pool, tu)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load modules.", "ERR_INTERNAL")
			return
		}
		canManage := tu.HasPermission("settings.tenant_modules", auth.AccessWrite) ||
			tu.IsStoreAdmin || tu.IsTenantOwner || tu.IsPlatformSuperadmin
		response.OK(w, map[string]any{
			"modules":    rows,
			"can_manage": canManage,
		}, "OK")
	}
}

func canManageTenantModules(tu auth.TenantUser) bool {
	return tu.HasPermission("settings.tenant_modules", auth.AccessWrite) ||
		tu.IsStoreAdmin || tu.IsTenantOwner || tu.IsPlatformSuperadmin
}

func previewTenantModules(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		if !canManageTenantModules(tu) {
			response.Err(w, http.StatusForbidden, "Not allowed.", "ERR_FORBIDDEN")
			return
		}
		var body patchTenantModulesBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		prev, err := buildPreview(r.Context(), pool, tu, body)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to preview.", "ERR_INTERNAL")
			return
		}
		response.OK(w, prev, "OK")
	}
}

func buildPreview(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, body patchTenantModulesBody) (policySyncPreview, error) {
	current, err := listTenantModuleRows(ctx, pool, tu)
	if err != nil {
		return policySyncPreview{}, err
	}
	nextMap := map[string]bool{}
	for _, row := range current {
		nextMap[row.ModuleCode] = row.IsEnabled
	}

	preset := strings.TrimSpace(strings.ToLower(body.Preset))
	var presetPatch processpolicy.Patch
	var presetMsgs []string
	if preset != "" {
		presetMods, pp, msgs := applyPresetModules(preset)
		presetPatch = pp
		presetMsgs = msgs
		for code, on := range presetMods {
			nextMap[code] = on
		}
	}
	for _, m := range body.Modules {
		nextMap[m.ModuleCode] = m.IsEnabled
	}

	var modulesDelta []moduleToggle
	for _, row := range current {
		want, ok := nextMap[row.ModuleCode]
		if !ok || want == row.IsEnabled {
			continue
		}
		modulesDelta = append(modulesDelta, moduleToggle{ModuleCode: row.ModuleCode, IsEnabled: want})
	}
	// New codes from preset not in current list (shouldn't happen for registry rows)
	for code, want := range nextMap {
		found := false
		for _, row := range current {
			if row.ModuleCode == code {
				found = true
				break
			}
		}
		if !found {
			modulesDelta = append(modulesDelta, moduleToggle{ModuleCode: code, IsEnabled: want})
		}
	}

	syncPatch, _, syncMsgs := buildPolicyPatchFromDisabled(nextMap)
	merged := mergePolicyPatches(syncPatch, presetPatch)
	deltas := policyDeltaList(merged)

	msgs := append([]string{}, presetMsgs...)
	if body.ApplyPolicySync || preset != "" {
		seen := map[string]bool{}
		for _, m := range msgs {
			seen[m] = true
		}
		for _, d := range deltas {
			if d.Message != "" && !seen[d.Message] {
				msgs = append(msgs, d.Message)
				seen[d.Message] = true
			}
		}
		for _, m := range syncMsgs {
			if !seen[m] {
				msgs = append(msgs, m)
				seen[m] = true
			}
		}
	} else {
		msgs = syncMsgs
		deltas = nil
	}

	if modulesDelta == nil {
		modulesDelta = []moduleToggle{}
	}
	if deltas == nil {
		deltas = []policyDeltaMsg{}
	}
	if msgs == nil {
		msgs = []string{}
	}

	return policySyncPreview{
		ModulesDelta: modulesDelta,
		PolicyDelta:  deltas,
		Messages:     msgs,
		Preset:       preset,
	}, nil
}

func patchTenantModules(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		if !canManageTenantModules(tu) {
			response.Err(w, http.StatusForbidden, "Not allowed.", "ERR_FORBIDDEN")
			return
		}
		var body patchTenantModulesBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		preset := strings.TrimSpace(strings.ToLower(body.Preset))
		if len(body.Modules) == 0 && preset == "" {
			response.Validation(w, map[string]string{"modules": "At least one module entry or preset is required."})
			return
		}

		before, _ := listTenantModuleRows(r.Context(), pool, tu)
		beforeMap := map[string]bool{}
		for _, row := range before {
			beforeMap[row.ModuleCode] = row.IsEnabled
		}

		// Build intended enable map
		nextMap := map[string]bool{}
		for _, row := range before {
			nextMap[row.ModuleCode] = row.IsEnabled
		}
		var presetPatch processpolicy.Patch
		if preset != "" {
			presetMods, pp, _ := applyPresetModules(preset)
			presetPatch = pp
			for code, on := range presetMods {
				nextMap[code] = on
			}
		}
		for _, m := range body.Modules {
			nextMap[m.ModuleCode] = m.IsEnabled
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		// Upsert all codes we intend to change (or full body list)
		upsertCodes := map[string]bool{}
		for _, m := range body.Modules {
			upsertCodes[m.ModuleCode] = m.IsEnabled
		}
		if preset != "" {
			for code, on := range nextMap {
				// Only touch codes the preset cares about + body
				presetMods, _, _ := applyPresetModules(preset)
				if _, ok := presetMods[code]; ok {
					upsertCodes[code] = on
				}
			}
		}
		for code, on := range upsertCodes {
			if err := upsertTenantModule(r.Context(), tx, tu.TenantID, code, on); err != nil {
				response.Validation(w, map[string]string{code: err.Error()})
				return
			}
		}

		// When a parent module is turned back on, revive direct feature children that
		// cascade-disabled left off (e.g. finance → finance.acct_i / acct_ii).
		for code, on := range upsertCodes {
			if !on || beforeMap[code] {
				continue
			}
			if err := enableDirectFeatureChildren(r.Context(), tx, tu.TenantID, code); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to enable dependent features.", "ERR_INTERNAL")
				return
			}
		}

		if err := cascadeModuleDependencies(r.Context(), tx, tu.TenantID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to apply dependencies.", "ERR_INTERNAL")
			return
		}

		applySync := body.ApplyPolicySync || preset != ""
		if applySync {
			// Re-read enabled state after cascade for accurate sync
			afterCascade := map[string]bool{}
			for code, on := range nextMap {
				afterCascade[code] = on
			}
			// Load actual from tx
			rows, qerr := tx.Query(r.Context(), `
				select module_code, is_enabled from public.tenant_modules where tenant_id = $1`, tu.TenantID)
			if qerr == nil {
				defer rows.Close()
				for rows.Next() {
					var code string
					var on bool
					if rows.Scan(&code, &on) == nil {
						afterCascade[code] = on
					}
				}
			}
			syncPatch, _, _ := buildPolicyPatchFromDisabled(afterCascade)
			merged := mergePolicyPatches(syncPatch, presetPatch)
			if patchHasAny(merged) {
				if _, err := processpolicy.UpdateTx(r.Context(), tx, tu.TenantID, tu.AppUserID, merged); err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to sync process policies.", "ERR_INTERNAL")
					return
				}
			}
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}

		// The module gate caches answers per tenant; a toggle must bite immediately.
		tenantmodules.InvalidateTenant(tu.TenantID)

		after, _ := listTenantModuleRows(r.Context(), pool, tu)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "settings.tenant_modules.update", "tenant_modules", &tu.TenantID, before, after)
		response.OK(w, map[string]any{"modules": after}, "Saved.")
	}
}

func listTenantModuleRows(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser) ([]tenantModuleRow, error) {
	rows, err := pool.Query(ctx, `
		select mr.module_code, mr.module_name, mr.module_type,
		  coalesce(
		    tm.is_enabled,
		    (
		      select bool_and(coalesce(ptm.is_enabled, false))
		      from public.module_dependencies md
		      left join public.tenant_modules ptm
		        on ptm.module_code = md.depends_on_module_code and ptm.tenant_id = $1
		      where md.module_code = mr.module_code
		    ),
		    false
		  ),
		  coalesce(mr.tenant_enableable, true)
		from public.module_registry mr
		left join public.tenant_modules tm
		  on tm.module_code = mr.module_code and tm.tenant_id = $1
		where mr.is_core = false and mr.module_code <> 'core'
		  and mr.module_code <> 'data_center'
		order by mr.sort_order, mr.module_code`, tu.TenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	deps, err := loadModuleDependencies(ctx, pool)
	if err != nil {
		return nil, err
	}

	var out []tenantModuleRow
	for rows.Next() {
		var row tenantModuleRow
		var enableable bool
		if err := rows.Scan(&row.ModuleCode, &row.ModuleName, &row.ModuleType, &row.IsEnabled, &enableable); err != nil {
			return nil, err
		}
		row.DependsOn = deps[row.ModuleCode]
		if tu.IsPlatformSuperadmin || tu.IsTenantOwner || tu.IsStoreAdmin {
			row.CanToggle = enableable
		} else {
			row.CanToggle = enableable && tu.HasPermission("settings.tenant_modules", auth.AccessWrite)
		}
		if row.ModuleType == "feature" && len(row.DependsOn) > 0 {
			row.ParentModule = row.DependsOn[0]
		}
		out = append(out, row)
	}
	if out == nil {
		out = []tenantModuleRow{}
	}
	return out, nil
}

func loadModuleDependencies(ctx context.Context, pool *pgxpool.Pool) (map[string][]string, error) {
	rows, err := pool.Query(ctx, `
		select module_code, depends_on_module_code
		from public.module_dependencies
		order by module_code`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[string][]string)
	for rows.Next() {
		var code, dep string
		if err := rows.Scan(&code, &dep); err != nil {
			return nil, err
		}
		out[code] = append(out[code], dep)
	}
	return out, nil
}

func upsertTenantModule(ctx context.Context, tx pgx.Tx, tenantID int64, moduleCode string, enabled bool) error {
	var exists bool
	err := tx.QueryRow(ctx, `
		select exists(
		  select 1 from public.module_registry
		  where module_code = $1 and is_core = false and tenant_enableable = true
		)`, moduleCode).Scan(&exists)
	if err != nil || !exists {
		return errNotToggleable(moduleCode)
	}

	if enabled {
		_, err = tx.Exec(ctx, `
			insert into public.tenant_modules (tenant_id, module_code, is_enabled, enabled_at, disabled_at)
			values ($1, $2, true, now(), null)
			on conflict (tenant_id, module_code) do update
			set is_enabled = true, enabled_at = now(), disabled_at = null`,
			tenantID, moduleCode)
		return err
	}

	_, err = tx.Exec(ctx, `
		insert into public.tenant_modules (tenant_id, module_code, is_enabled, disabled_at)
		values ($1, $2, false, now())
		on conflict (tenant_id, module_code) do update
		set is_enabled = false, disabled_at = now()`,
		tenantID, moduleCode)
	return err
}

type simpleErr string

func (e simpleErr) Error() string { return string(e) }

func errNotToggleable(code string) error {
	return simpleErr("Module cannot be toggled: " + code)
}

// enableDirectFeatureChildren turns on registry features that depend on parentCode.
// Used when the parent itself was just flipped from off → on so Acct. I / II etc. return with it.
func enableDirectFeatureChildren(ctx context.Context, tx pgx.Tx, tenantID int64, parentCode string) error {
	_, err := tx.Exec(ctx, `
		insert into public.tenant_modules (tenant_id, module_code, is_enabled, enabled_at, disabled_at)
		select $1, md.module_code, true, now(), null
		from public.module_dependencies md
		join public.module_registry mr on mr.module_code = md.module_code
		where md.depends_on_module_code = $2
		  and mr.module_type = 'feature'
		  and coalesce(mr.tenant_enableable, true) = true
		on conflict (tenant_id, module_code) do update
		set is_enabled = true, enabled_at = now(), disabled_at = null`,
		tenantID, parentCode)
	return err
}

func cascadeModuleDependencies(ctx context.Context, tx pgx.Tx, tenantID int64) error {
	// Disable children when parent is disabled (repeat for shallow multi-level trees).
	// Note: UPDATE target alias cannot appear in FROM join ON — use WHERE only.
	for i := 0; i < 5; i++ {
		tag, err := tx.Exec(ctx, `
			update public.tenant_modules as child
			set is_enabled = false, disabled_at = now()
			from public.module_dependencies md,
			     public.tenant_modules as parent
			where child.tenant_id = $1
			  and child.module_code = md.module_code
			  and parent.tenant_id = child.tenant_id
			  and parent.module_code = md.depends_on_module_code
			  and parent.is_enabled = false
			  and child.is_enabled = true`, tenantID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			break
		}
	}

	// Collect parents to enable first — pgx cannot Exec while rows from the same tx are open.
	rows, err := tx.Query(ctx, `
		select distinct md.depends_on_module_code
		from public.tenant_modules child
		join public.module_dependencies md on md.module_code = child.module_code
		left join public.tenant_modules parent
		  on parent.tenant_id = child.tenant_id and parent.module_code = md.depends_on_module_code
		where child.tenant_id = $1
		  and child.is_enabled = true
		  and coalesce(parent.is_enabled, false) = false`, tenantID)
	if err != nil {
		return err
	}
	var parents []string
	for rows.Next() {
		var parentCode string
		if err := rows.Scan(&parentCode); err != nil {
			rows.Close()
			return err
		}
		parents = append(parents, parentCode)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	for _, parentCode := range parents {
		_, err = tx.Exec(ctx, `
			insert into public.tenant_modules (tenant_id, module_code, is_enabled, enabled_at, disabled_at)
			values ($1, $2, true, now(), null)
			on conflict (tenant_id, module_code) do update
			set is_enabled = true, enabled_at = now(), disabled_at = null`,
			tenantID, parentCode)
		if err != nil {
			return err
		}
	}
	return nil
}
