package setupreadiness

import (
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func RequireSetupReady(pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if isSetupExempt(r.Method, r.URL.Path) {
				next.ServeHTTP(w, r)
				return
			}
			tu, ok := auth.FromContext(r.Context())
			if !ok || tu.IsPlatformSuperadmin || tu.PlatformOnly {
				next.ServeHTTP(w, r)
				return
			}
			ready, err := IsReady(r.Context(), pool, tu.TenantID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to verify setup.", "ERR_INTERNAL")
				return
			}
			if !ready {
				p, _ := Load(r.Context(), pool, tu.TenantID)
				msg := p.BlockingReason
				if msg == "" {
					msg = "Complete workspace setup before creating transactions."
				}
				response.Err(w, http.StatusForbidden, msg, "ERR_SETUP_INCOMPLETE")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func isSetupExempt(method, path string) bool {
	if method == "GET" || method == "HEAD" || method == "OPTIONS" {
		return true
	}
	p := strings.ToLower(path)
	exempt := []string{
		"/auth/", "/platform/setup-readiness", "/platform/onboarding",
		"/branding/", "/inventory/", "/finance/", "/quotation/currencies",
		"/quotation/tax-types", "/user-management/", "/custom-fields",
		"/form-field-settings", "/column-label-settings", "/process-policies", "/activity-logs",
		"/console/", "/presence/", "/drafts/", "/report-templates",
		"/approval/", "/docgen/", "/demodata/", "/datacenter/",
	}
	for _, e := range exempt {
		if strings.Contains(p, e) {
			return true
		}
	}
	// Selling docs (quotation / sales order / sales invoice) are not hard-blocked by incomplete
	// workspace setup — operators can capture orders while COA is unfinished. Reminders stay in UI.
	// Buying + POS still require foundation ready (stock location, partners, items, COA types, etc.).
	blocked := []string{
		"/purchase-request/",
		"/purchase-order/",
		"/goods-receipt/",
		"/buying/",
		"/pos/",
	}
	for _, b := range blocked {
		if strings.Contains(p, b) {
			return false
		}
	}
	return true
}
