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
