package auth

import (
	"context"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const (
	AccessDeny  = "deny"
	AccessRead  = "read"
	AccessWrite = "write"
)

// PermissionLevel returns the effective access level for a permission code.
func (tu TenantUser) PermissionLevel(code string) string {
	if tu.IsPlatformSuperadmin || tu.IsTenantOwner {
		return AccessWrite
	}
	if tu.permissions == nil {
		return tu.legacyPermissionLevel(code)
	}
	if lvl, ok := tu.permissions[code]; ok {
		return lvl
	}
	// Module-level fallback: inventory.partners inherits inventory when feature unset.
	if i := strings.LastIndex(code, "."); i > 0 {
		if lvl, ok := tu.permissions[code[:i]]; ok && lvl != AccessDeny {
			return lvl
		}
	}
	return AccessDeny
}

// HasPermission reports whether the user meets the minimum access level.
func (tu TenantUser) HasPermission(code, minLevel string) bool {
	lvl := tu.PermissionLevel(code)
	switch minLevel {
	case AccessWrite:
		return lvl == AccessWrite
	case AccessRead:
		return lvl == AccessRead || lvl == AccessWrite
	default:
		return lvl != AccessDeny
	}
}

// HasModuleRead reports read access to any feature in a module or the module itself.
func (tu TenantUser) HasModuleRead(moduleCode string) bool {
	if tu.IsPlatformSuperadmin || tu.IsTenantOwner {
		return true
	}
	if tu.HasPermission(moduleCode, AccessRead) {
		return true
	}
	if tu.permissions != nil {
		prefix := moduleCode + "."
		for code, lvl := range tu.permissions {
			if strings.HasPrefix(code, prefix) && lvl != AccessDeny {
				return true
			}
		}
	}
	return tu.legacyModuleRead(moduleCode)
}

func loadEffectivePermissions(ctx context.Context, pool *pgxpool.Pool, tu *TenantUser) error {
	if tu.IsPlatformSuperadmin || tu.IsTenantOwner {
		return nil
	}
	perms := map[string]string{}

	roleRows, err := pool.Query(ctx, `
		select rp.permission_code, rp.access_level
		from public.tenant_role_permissions rp
		where rp.tenant_id = $1 and rp.role_code = $2`,
		tu.TenantID, tu.TenantRole)
	if err != nil {
		return err
	}
	for roleRows.Next() {
		var code, lvl string
		if err := roleRows.Scan(&code, &lvl); err != nil {
			roleRows.Close()
			return err
		}
		perms[code] = lvl
	}
	roleRows.Close()
	if err := roleRows.Err(); err != nil {
		return err
	}

	groupRows, err := pool.Query(ctx, `
		select gp.permission_code, gp.access_level
		from public.tenant_user_group_members gm
		join public.tenant_user_group_permissions gp
		  on gp.group_id = gm.group_id and gp.tenant_id = gm.tenant_id
		join public.tenant_user_groups g on g.id = gm.group_id and g.is_active = true
		where gm.tenant_id = $1 and gm.user_id = $2`,
		tu.TenantID, tu.AppUserID)
	if err != nil {
		return err
	}
	for groupRows.Next() {
		var code, lvl string
		if err := groupRows.Scan(&code, &lvl); err != nil {
			groupRows.Close()
			return err
		}
		perms[code] = mergeAccess(perms[code], lvl)
	}
	groupRows.Close()
	if err := groupRows.Err(); err != nil {
		return err
	}

	ovRows, err := pool.Query(ctx, `
		select permission_code, access_level
		from public.user_permission_overrides
		where tenant_id = $1 and user_id = $2`,
		tu.TenantID, tu.AppUserID)
	if err != nil {
		return err
	}
	for ovRows.Next() {
		var code, lvl string
		if err := ovRows.Scan(&code, &lvl); err != nil {
			ovRows.Close()
			return err
		}
		perms[code] = lvl
	}
	ovRows.Close()
	if err := ovRows.Err(); err != nil {
		return err
	}
	if len(perms) > 0 {
		tu.permissions = perms
	}
	return nil
}

func accessRank(level string) int {
	switch level {
	case AccessWrite:
		return 2
	case AccessRead:
		return 1
	default:
		return 0
	}
}

func mergeAccess(current, next string) string {
	if accessRank(next) > accessRank(current) {
		return next
	}
	return current
}

func (tu TenantUser) legacyPermissionLevel(code string) string {
	switch code {
	case "user_management.users", "user_management.roles", "user_management":
		if tu.CanManageUsers() {
			return AccessWrite
		}
	case "settings.form_fields":
		if tu.CanManageFormSettings() {
			return AccessWrite
		}
	case "activity_logs.logs", "activity_logs.changes", "activity_logs":
		if tu.CanViewActivityLogs() {
			return AccessRead
		}
	}
	if strings.HasPrefix(code, "crm") {
		if tu.CanViewCRM() {
			if strings.Contains(code, "reports") || strings.Contains(code, "settings_alert") {
				if tu.CanViewCrmAnalytics() || tu.CanManageCrmRules() {
					return AccessRead
				}
				return AccessDeny
			}
			return AccessRead
		}
	}
	// Default for legacy tenants without matrix rows: operational read.
	if code == "inventory" || strings.HasPrefix(code, "inventory.") ||
		code == "quotation" || strings.HasPrefix(code, "quotation.") ||
		code == "sales" || strings.HasPrefix(code, "sales.") ||
		code == "sales_order" || strings.HasPrefix(code, "sales_order.") {
		return AccessRead
	}
	return AccessDeny
}

func (tu TenantUser) legacyModuleRead(moduleCode string) bool {
	return tu.legacyPermissionLevel(moduleCode) != AccessDeny
}

// PermissionsMap returns a copy of effective permissions for /auth/me.
func (tu TenantUser) PermissionsMap() map[string]string {
	if tu.IsPlatformSuperadmin || tu.IsTenantOwner {
		return nil
	}
	if tu.permissions == nil {
		return map[string]string{}
	}
	out := make(map[string]string, len(tu.permissions))
	for k, v := range tu.permissions {
		out[k] = v
	}
	return out
}

// RequirePermission blocks handlers unless the caller has the required access.
func RequirePermission(code, minLevel string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tu, ok := FromContext(r.Context())
			if !ok {
				response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
				return
			}
			if !tu.HasPermission(code, minLevel) {
				response.Err(w, http.StatusForbidden, "You do not have permission for this action.", "ERR_FORBIDDEN")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
