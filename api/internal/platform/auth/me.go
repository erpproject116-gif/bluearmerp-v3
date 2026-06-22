package auth

import (
	"context"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type ModuleRow struct {
	ModuleCode string `json:"module_code"`
	IsEnabled  bool   `json:"is_enabled"`
}

type MePayload struct {
	User               map[string]any `json:"user"`
	Tenant             map[string]any `json:"tenant"`
	EnabledModuleCodes []string       `json:"enabled_module_codes"`
	Modules            []ModuleRow    `json:"modules"`
}

func fullModuleAccess(tu TenantUser) bool {
	return tu.IsPlatformSuperadmin || tu.IsTenantOwner || tu.AutoEnableAllModules
}

func MeHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}

		payload, err := buildMe(r.Context(), pool, tu)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load session.", "ERR_INTERNAL")
			return
		}
		response.OK(w, payload, "OK")
	}
}

func buildMe(ctx context.Context, pool *pgxpool.Pool, tu TenantUser) (MePayload, error) {
	var companyName, companyCode, tenantStatus string
	var autoEnableAll bool
	err := pool.QueryRow(ctx, `
		select company_name, company_code, status, auto_enable_all_modules
		from public.tenants where id = $1`, tu.TenantID).
		Scan(&companyName, &companyCode, &tenantStatus, &autoEnableAll)
	if err != nil {
		return MePayload{}, err
	}
	tu.AutoEnableAllModules = autoEnableAll

	rows, err := pool.Query(ctx, `
		select mr.module_code, coalesce(tm.is_enabled, false)
		from public.module_registry mr
		left join public.tenant_modules tm
		  on tm.module_code = mr.module_code and tm.tenant_id = $1
		order by mr.sort_order`, tu.TenantID)
	if err != nil {
		return MePayload{}, err
	}
	defer rows.Close()

	var modules []ModuleRow
	var enabled []string
	allAccess := fullModuleAccess(tu)
	for rows.Next() {
		var m ModuleRow
		if err := rows.Scan(&m.ModuleCode, &m.IsEnabled); err != nil {
			return MePayload{}, err
		}
		if allAccess {
			m.IsEnabled = true
		}
		modules = append(modules, m)
		if m.IsEnabled {
			enabled = append(enabled, m.ModuleCode)
		}
	}

	return MePayload{
		User: map[string]any{
			"id":                       tu.AppUserID,
			"email":                    tu.Email,
			"full_name":                tu.FullName,
			"tenant_role":              tu.TenantRole,
			"is_platform_superadmin":   tu.IsPlatformSuperadmin,
			"is_tenant_owner":          tu.IsTenantOwner,
			"is_store_admin":           tu.IsStoreAdmin,
			"can_manage_users":         tu.CanManageUsers(),
			"can_manage_custom_fields": tu.CanManageFormSettings(),
			"can_view_activity_logs":   tu.CanViewActivityLogs(),
		},
		Tenant: map[string]any{
			"id":                       tu.TenantID,
			"company_name":             companyName,
			"company_code":             companyCode,
			"status":                   tenantStatus,
			"auto_enable_all_modules":  autoEnableAll,
		},
		EnabledModuleCodes: enabled,
		Modules:            modules,
	}, nil
}
