package auth

import (
	"net/http"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// RequireManageUsers blocks handlers unless the caller can manage tenant users.
func RequireManageUsers(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		if !tu.CanManageUsers() {
			response.Err(w, http.StatusForbidden, "You do not have permission to manage users.", "ERR_FORBIDDEN")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// CanManageUsers reports whether the tenant user may access user-management APIs and UI.
func (tu TenantUser) CanManageUsers() bool {
	return tu.IsPlatformSuperadmin || tu.IsTenantOwner || tu.canManageUsersRole
}

// CanManageFormSettings reports whether the tenant user may edit form field settings.
func (tu TenantUser) CanManageFormSettings() bool {
	return tu.IsPlatformSuperadmin || tu.IsTenantOwner || tu.canManageFormSettingsRole
}

// RequireViewActivityLogs blocks handlers unless the caller may view activity logs.
func RequireViewActivityLogs(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		if !tu.CanViewActivityLogs() {
			response.Err(w, http.StatusForbidden, "You do not have permission to view activity logs.", "ERR_FORBIDDEN")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// CanViewActivityLogs reports whether the tenant user may access activity log APIs and UI.
func (tu TenantUser) CanViewActivityLogs() bool {
	return tu.IsPlatformSuperadmin || tu.IsTenantOwner || tu.canViewActivityLogsRole
}

// RequireViewCRM blocks handlers unless the caller may view CRM.
func RequireViewCRM(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		if !tu.CanViewCRM() {
			response.Err(w, http.StatusForbidden, "You do not have permission to view CRM.", "ERR_FORBIDDEN")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// CanViewCRM reports whether the tenant user may access CRM APIs and UI.
func (tu TenantUser) CanViewCRM() bool {
	return tu.IsPlatformSuperadmin || tu.IsTenantOwner || tu.canViewCrmRole
}

// RequireManageCrmRules blocks handlers unless the caller may manage CRM alert rules.
func RequireManageCrmRules(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		if !tu.CanManageCrmRules() {
			response.Err(w, http.StatusForbidden, "You do not have permission to manage CRM rules.", "ERR_FORBIDDEN")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// CanManageCrmRules reports whether the tenant user may edit CRM alert rules.
func (tu TenantUser) CanManageCrmRules() bool {
	return tu.IsPlatformSuperadmin || tu.IsTenantOwner || tu.canManageCrmRulesRole
}
