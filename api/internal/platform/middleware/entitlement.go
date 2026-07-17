package middleware

import (
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/entitlement"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// Entitlement blocks mutating API calls when subscription/trial is expired.
func Entitlement(pool *pgxpool.Pool, graceDays int) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if isEntitlementExempt(r.Method, r.URL.Path) {
				next.ServeHTTP(w, r)
				return
			}
			tu, ok := auth.FromContext(r.Context())
			isConsole := strings.Contains(strings.ToLower(r.URL.Path), "/platform/console")
			if !ok || tu.IsPlatformSuperadmin || tu.PlatformOnly || (tu.CanAccessPlatformCommand() && isConsole) {
				next.ServeHTTP(w, r)
				return
			}
			snap, err := entitlement.LoadForTenant(r.Context(), pool, tu.TenantID, false, graceDays)
			if err != nil || snap == nil || !snap.WriteBlocked {
				next.ServeHTTP(w, r)
				return
			}
			response.Err(w, http.StatusPaymentRequired, snap.Message, "ERR_ENTITLEMENT_BLOCKED")
		})
	}
}

func isEntitlementExempt(method, path string) bool {
	if method == "GET" || method == "HEAD" || method == "OPTIONS" {
		return true
	}
	p := strings.ToLower(path)
	for _, e := range []string{"/auth/me", "/platform/billing", "/platform/onboarding", "/platform/console", "/branding/"} {
		if strings.Contains(p, e) {
			return true
		}
	}
	return false
}
