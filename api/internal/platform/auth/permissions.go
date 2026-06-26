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
	if tu.IsPlatformSuperadmin || tu.IsTenantOwner {
		return true
	}
	if tu.permissions != nil {
		return tu.HasPermission("user_management.users", AccessWrite)
	}
	return tu.canManageUsersRole
}

// CanManageFormSettings reports whether the tenant user may edit form field settings.
func (tu TenantUser) CanManageFormSettings() bool {
	if tu.IsPlatformSuperadmin || tu.IsTenantOwner {
		return true
	}
	if tu.permissions != nil {
		return tu.HasPermission("settings.form_fields", AccessWrite)
	}
	return tu.canManageFormSettingsRole
}

// CanManageBranding reports whether the tenant user may edit tenant branding (colors, receipt header, labels).
func (tu TenantUser) CanManageBranding() bool {
	return tu.CanManageFormSettings()
}

// CanViewChangeLogs reports whether the tenant user may access change log APIs and UI.
func (tu TenantUser) CanViewChangeLogs() bool {
	if tu.IsPlatformSuperadmin || tu.IsTenantOwner {
		return true
	}
	if tu.permissions != nil {
		if tu.HasPermission("activity_logs.changes", AccessRead) {
			return true
		}
		return tu.HasPermission("activity_logs.logs", AccessRead)
	}
	return tu.canViewActivityLogsRole
}

// RequireViewChangeLogs blocks handlers unless the caller may view change logs.
func RequireViewChangeLogs(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		if !tu.CanViewChangeLogs() {
			response.Err(w, http.StatusForbidden, "You do not have permission to view change logs.", "ERR_FORBIDDEN")
			return
		}
		next.ServeHTTP(w, r)
	})
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
	if tu.IsPlatformSuperadmin || tu.IsTenantOwner {
		return true
	}
	if tu.permissions != nil {
		return tu.HasPermission("activity_logs.logs", AccessRead)
	}
	return tu.canViewActivityLogsRole
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
	if tu.IsPlatformSuperadmin || tu.IsTenantOwner {
		return true
	}
	if tu.permissions != nil {
		return tu.HasModuleRead("crm")
	}
	return tu.canViewCrmRole
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
	if tu.IsPlatformSuperadmin || tu.IsTenantOwner {
		return true
	}
	if tu.permissions != nil {
		return tu.HasPermission("crm.settings_alert_rules", AccessWrite)
	}
	return tu.canManageCrmRulesRole
}

// RequireCrmAnalytics blocks handlers unless the caller may view CRM analytics.
func RequireCrmAnalytics(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		if !tu.CanViewCrmAnalytics() {
			response.Err(w, http.StatusForbidden, "You do not have permission to view CRM analytics.", "ERR_FORBIDDEN")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RequireManageSalesTeam blocks handlers unless the caller may assign sales team work.
func RequireManageSalesTeam(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		if !tu.CanManageSalesTeam() {
			response.Err(w, http.StatusForbidden, "You do not have permission to manage the sales team.", "ERR_FORBIDDEN")
			return
		}
		next.ServeHTTP(w, r)
	})
}
