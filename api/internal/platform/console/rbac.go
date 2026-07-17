package console

import (
	"net/http"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func requirePlatformAccess(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok || !tu.CanAccessPlatformCommand() {
			response.Err(w, http.StatusForbidden, "Platform Command Center access required.", "ERR_FORBIDDEN")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func requirePlatformPermission(code string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tu, ok := auth.FromContext(r.Context())
			if !ok || !tu.HasPlatformPermission(code) {
				response.Err(w, http.StatusForbidden, "Missing platform permission: "+code, "ERR_FORBIDDEN")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
