package middleware

import (
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/day1commercial"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// RequireCommercialUnlocked blocks sell/buy/POS (and related cash-cycle) mutations
// until platform_customers.commercial_status is unlocked.
func RequireCommercialUnlocked(pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !isCommercialTradeMutation(r.Method, r.URL.Path) {
				next.ServeHTTP(w, r)
				return
			}
			tu, ok := auth.FromContext(r.Context())
			isConsole := strings.Contains(strings.ToLower(r.URL.Path), "/platform/console")
			if !ok || tu.IsPlatformSuperadmin || tu.PlatformOnly || (tu.CanAccessPlatformCommand() && isConsole) {
				next.ServeHTTP(w, r)
				return
			}
			// Support ghost may diagnose buy/sell without permanently unlocking the customer.
			if tu.SupportSessionID > 0 {
				next.ServeHTTP(w, r)
				return
			}
			// Opportunistic Day 1 evaluation while still in setup.
			_, _, _ = day1commercial.EvaluateAndTransition(r.Context(), pool, tu.TenantID)

			blocked, status, err := day1commercial.WriteBlocked(r.Context(), pool, tu.TenantID)
			if err != nil || !blocked {
				next.ServeHTTP(w, r)
				return
			}
			msg := "Complete Day 1 setup (places, products, and stock on the shelf) before buying or selling."
			switch status {
			case day1commercial.StatusAwaitingPayment:
				msg = "Day 1 setup is complete. Pay via GCash and wait for Bluearm to confirm before buying or selling."
			case day1commercial.StatusCancelled:
				msg = "Commercial access was cancelled. Contact Bluearm support."
			}
			response.Err(w, http.StatusPaymentRequired, msg, "ERR_COMMERCIAL_LOCKED")
		})
	}
}

func isCommercialTradeMutation(method, path string) bool {
	if method == "GET" || method == "HEAD" || method == "OPTIONS" {
		return false
	}
	p := strings.ToLower(path)

	// Always allow auth / platform / inventory master data / branding / setup helpers.
	exemptContains := []string{
		"/auth/", "/platform/", "/branding/", "/inventory/",
		"/user-management/", "/custom-fields", "/form-field-settings",
		"/column-label-settings", "/process-policies", "/activity-logs",
		"/presence/", "/drafts/", "/report-templates", "/approval/",
		"/docgen/", "/demodata/", "/datacenter/", "/help", "/copilot",
		"/quotation/currencies", "/quotation/tax-types",
		"/finance/accounts", "/finance/fiscal", "/finance/workspace",
		"/finance/reports", "/finance/withholding", "/finance/statutory",
	}
	for _, e := range exemptContains {
		if strings.Contains(p, e) {
			return false
		}
	}

	blocked := []string{
		"/purchase-request/",
		"/purchase-order/",
		"/goods-receipt/",
		"/buying/",
		"/pos/",
		"/quotation/",
		"/sales-order/",
		"/sales/",
		"/selling/",
		"/finance/supplier-invoices",
		"/finance/payment-vouchers",
		"/finance/payment-entries",
		"/finance/official-receipts",
		"/finance/expenses",
		"/finance/credit-notes",
		"/finance/vendor-credits",
		"/finance/retainers",
		"/finance/recurring",
		"/finance/checks",
		"/finance/notes",
		"/finance/landed-costs",
		"/finance/contracts",
		"/finance/journal-entries",
	}
	for _, b := range blocked {
		if strings.Contains(p, b) {
			return true
		}
	}
	return false
}
