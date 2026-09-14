package auth

import (
	"context"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/config"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/day1commercial"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/entitlement"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/supportaccess"
)

type ModuleRow struct {
	ModuleCode string `json:"module_code"`
	ModuleName string `json:"module_name"`
	IsEnabled  bool   `json:"is_enabled"`
}

type Membership struct {
	TenantID    int64  `json:"tenant_id"`
	CompanyName string `json:"company_name"`
	CompanyCode string `json:"company_code"`
	TenantRole  string `json:"tenant_role"`
	Status      string `json:"status"`
}

type MePayload struct {
	User               map[string]any        `json:"user"`
	Tenant             map[string]any        `json:"tenant"`
	ActiveTenantID     int64                 `json:"active_tenant_id"`
	Memberships        []Membership          `json:"memberships"`
	EnabledModuleCodes []string              `json:"enabled_module_codes"`
	Modules            []ModuleRow           `json:"modules"`
	Entitlement        *entitlement.Snapshot `json:"entitlement,omitempty"`
	Commercial         *day1commercial.Commercial `json:"commercial,omitempty"`
	SupportSession     map[string]any        `json:"support_session,omitempty"`
}

func fullModuleAccess(tu TenantUser) bool {
	// Platform operators and tenants with auto_enable_all_modules see every module as on.
	// Tenant owners otherwise respect tenant_modules so Simple store / feature hide works for admins too.
	applyBootstrapOwnerFlags(&tu)
	return tu.IsPlatformSuperadmin || tu.AutoEnableAllModules
}

func MeHandler(pool *pgxpool.Pool, cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}

		payload, err := buildMe(r.Context(), pool, tu, cfg)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load session.", "ERR_INTERNAL")
			return
		}
		response.OK(w, payload, "OK")
	}
}

func buildMe(ctx context.Context, pool *pgxpool.Pool, tu TenantUser, cfg config.Config) (MePayload, error) {
	applyBootstrapOwnerFlags(&tu)
	if tu.PlatformOnly || tu.TenantID <= 0 {
		return buildPlatformOnlyMe(tu), nil
	}
	var companyName, companyCode, tenantStatus string
	var autoEnableAll, isDemo bool
	err := pool.QueryRow(ctx, `
		select company_name, company_code, status, auto_enable_all_modules, is_demo
		from public.tenants where id = $1`, tu.TenantID).
		Scan(&companyName, &companyCode, &tenantStatus, &autoEnableAll, &isDemo)
	if err != nil {
		return MePayload{}, err
	}
	tu.AutoEnableAllModules = autoEnableAll

	rows, err := pool.Query(ctx, `
		select mr.module_code, mr.module_name,
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
		  )
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
		if err := rows.Scan(&m.ModuleCode, &m.ModuleName, &m.IsEnabled); err != nil {
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

	// Every business this login belongs to, so the UI can offer a switcher.
	var memberships []Membership
	mrows, err := pool.Query(ctx, `
		select u.tenant_id, t.company_name, t.company_code, u.tenant_role, t.status
		from public.users u
		join public.tenants t on t.id = u.tenant_id
		where u.auth_user_id = (select auth_user_id from public.users where id = $1)
		  and u.status = 'active'
		  and t.status not in ('suspended', 'cancelled', 'pending_approval')
		order by t.company_name`, tu.AppUserID)
	if err != nil {
		return MePayload{}, err
	}
	for mrows.Next() {
		var m Membership
		if err := mrows.Scan(&m.TenantID, &m.CompanyName, &m.CompanyCode, &m.TenantRole, &m.Status); err != nil {
			mrows.Close()
			return MePayload{}, err
		}
		memberships = append(memberships, m)
	}
	mrows.Close()
	if err := mrows.Err(); err != nil {
		return MePayload{}, err
	}

	var avatarURL *string
	_ = pool.QueryRow(ctx, `select avatar_url from public.users where id = $1`, tu.AppUserID).Scan(&avatarURL)

	user := map[string]any{
			"id":                       tu.AppUserID,
			"email":                    tu.Email,
			"full_name":                tu.FullName,
			"tenant_role":              tu.TenantRole,
			"is_platform_superadmin":   tu.IsPlatformSuperadmin,
			"is_tenant_owner":          tu.IsTenantOwner,
			"is_store_admin":           tu.IsStoreAdmin,
			"can_manage_users":         tu.CanManageUsers(),
			"can_manage_custom_fields": tu.CanManageFormSettings(),
			"can_manage_branding":      tu.CanManageBranding(),
			"can_view_activity_logs":   tu.CanViewActivityLogs(),
			"can_view_change_logs":     tu.CanViewChangeLogs(),
			"can_view_crm":             tu.CanViewCRM(),
			"can_manage_crm_rules":     tu.CanManageCrmRules(),
			"can_view_all_crm":         tu.CanViewAllCRM(),
			"can_manage_sales_team":    tu.CanManageSalesTeam(),
			"can_view_crm_analytics":        tu.CanViewCrmAnalytics(),
			"can_manage_all_support_tickets": tu.CanManageAllSupportTickets(),
			"permissions":                   tu.PermissionsMap(),
			"can_access_platform_command":   tu.CanAccessPlatformCommand(),
			"platform_user_id":              tu.PlatformUserID,
			"platform_role":                 tu.PlatformRole,
			"platform_only":                 tu.PlatformOnly,
			"platform_permissions":          tu.PlatformPermissions,
	}
	if avatarURL != nil && strings.TrimSpace(*avatarURL) != "" {
		user["avatar_url"] = resolveBrandingAvatarURL(strings.TrimSpace(*avatarURL))
	}

	ent, _ := entitlement.LoadForTenant(ctx, pool, tu.TenantID, tu.IsPlatformSuperadmin, cfg.EntitlementGraceDays)
	commercial, _ := day1commercial.LoadForTenant(ctx, pool, tu.TenantID, tu.IsPlatformSuperadmin)

	var supportMap map[string]any
	if tu.SupportSessionID > 0 {
		if sess, err := supportaccess.GetByID(ctx, pool, tu.SupportSessionID); err == nil && sess != nil && sess.EndedAt == nil {
			supportMap = supportaccess.PublicMap(sess)
		}
	}

	return MePayload{
		User: user,
		Tenant: map[string]any{
			"id":                      tu.TenantID,
			"company_name":            companyName,
			"company_code":            companyCode,
			"status":                  tenantStatus,
			"auto_enable_all_modules": autoEnableAll,
			"is_demo":                 isDemo,
		},
		ActiveTenantID:     tu.TenantID,
		Memberships:        memberships,
		EnabledModuleCodes: enabled,
		Modules:            modules,
		Entitlement:        ent,
		Commercial:         commercial,
		SupportSession:     supportMap,
	}, nil
}

func buildPlatformOnlyMe(tu TenantUser) MePayload {
	applyBootstrapOwnerFlags(&tu)
	return MePayload{
		User: map[string]any{
			"id":                          tu.AppUserID,
			"email":                       tu.Email,
			"full_name":                   tu.FullName,
			"tenant_role":                 "platform",
			"is_platform_superadmin":      tu.IsPlatformSuperadmin,
			"is_tenant_owner":             false,
			"is_store_admin":              false,
			"can_access_platform_command": tu.CanAccessPlatformCommand(),
			"platform_user_id":            tu.PlatformUserID,
			"platform_role":               tu.PlatformRole,
			"platform_only":               true,
			"platform_permissions":        tu.PlatformPermissions,
			"permissions":                 map[string]string{},
		},
		Tenant: map[string]any{
			"id":                      0,
			"company_name":            "Platform Command",
			"company_code":            "PLATFORM",
			"status":                  "active",
			"auto_enable_all_modules": false,
			"is_demo":                 false,
		},
		ActiveTenantID:     0,
		Memberships:        []Membership{},
		EnabledModuleCodes: []string{},
		Modules:            []ModuleRow{},
	}
}

func resolveBrandingAvatarURL(ref string) string {
	if strings.HasPrefix(ref, "branding-asset:") {
		id := strings.TrimPrefix(ref, "branding-asset:")
		if id != "" {
			return "/api/v1/branding/assets/" + id + "?inline=1"
		}
	}
	return ref
}
