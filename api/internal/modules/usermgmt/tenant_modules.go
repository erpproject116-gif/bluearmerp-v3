package usermgmt

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
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
}

func registerTenantModuleRoutes(ur chi.Router, pool *pgxpool.Pool) {
	ur.Get("/tenant-modules", getTenantModules(pool))
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

func patchTenantModules(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		if !tu.HasPermission("settings.tenant_modules", auth.AccessWrite) &&
			!tu.IsStoreAdmin && !tu.IsTenantOwner && !tu.IsPlatformSuperadmin {
			response.Err(w, http.StatusForbidden, "Not allowed.", "ERR_FORBIDDEN")
			return
		}
		var body patchTenantModulesBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.Modules) == 0 {
			response.Validation(w, map[string]string{"modules": "At least one module entry is required."})
			return
		}

		before, _ := listTenantModuleRows(r.Context(), pool, tu)

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		for _, m := range body.Modules {
			if err := upsertTenantModule(r.Context(), tx, tu.TenantID, m.ModuleCode, m.IsEnabled); err != nil {
				response.Validation(w, map[string]string{m.ModuleCode: err.Error()})
				return
			}
		}

		if err := cascadeModuleDependencies(r.Context(), tx, tu.TenantID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to apply dependencies.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}

		after, _ := listTenantModuleRows(r.Context(), pool, tu)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "settings.tenant_modules.update", "tenant_modules", &tu.TenantID, before, after)
		response.OK(w, map[string]any{"modules": after}, "Saved.")
	}
}

func listTenantModuleRows(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser) ([]tenantModuleRow, error) {
	rows, err := pool.Query(ctx, `
		select mr.module_code, mr.module_name, mr.module_type,
		  coalesce(tm.is_enabled, false),
		  coalesce(mr.tenant_enableable, true)
		from public.module_registry mr
		left join public.tenant_modules tm
		  on tm.module_code = mr.module_code and tm.tenant_id = $1
		where mr.is_core = false and mr.module_code <> 'core'
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

func cascadeModuleDependencies(ctx context.Context, tx pgx.Tx, tenantID int64) error {
	// Disable children when parent is disabled
	_, err := tx.Exec(ctx, `
		update public.tenant_modules child
		set is_enabled = false, disabled_at = now()
		from public.module_dependencies md
		join public.tenant_modules parent
		  on parent.tenant_id = child.tenant_id
		 and parent.module_code = md.depends_on_module_code
		where child.tenant_id = $1
		  and child.module_code = md.module_code
		  and parent.is_enabled = false
		  and child.is_enabled = true`, tenantID)
	if err != nil {
		return err
	}

	// Enable required parents when child is enabled
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
	defer rows.Close()

	for rows.Next() {
		var parentCode string
		if err := rows.Scan(&parentCode); err != nil {
			return err
		}
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
