package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/tenantmodules"
)

type moduleRouteRule struct {
	prefix      string
	moduleCode  string
	featureCode string // optional; when set, also require feature enabled
	message     string
	nextHint    string
}

// Longest-prefix first (more specific before parent).
var moduleMutationRules = []moduleRouteRule{
	{prefix: "/api/v1/inventory/serial-lot", moduleCode: "inventory", featureCode: "inventory.serial_lot",
		message: "Serial & Lot is turned off for this workspace.", nextHint: "/app/user-management/tenant-modules"},
	{prefix: "/api/v1/wms", moduleCode: "inventory", featureCode: "inventory.wms",
		message: "WMS is turned off for this workspace.", nextHint: "/app/user-management/tenant-modules"},
	{prefix: "/api/v1/quotation", moduleCode: "quotation",
		message: "Quotation is turned off for this workspace. Turn it on under Modules & Features, or bill from Sales.", nextHint: "/app/sales/sales/new"},
	{prefix: "/api/v1/sales-order", moduleCode: "sales_order",
		message: "Sales Order is turned off for this workspace. Use Sales invoices for direct billing.", nextHint: "/app/sales/sales/new"},
	{prefix: "/api/v1/sales", moduleCode: "sales",
		message: "Sales is turned off for this workspace.", nextHint: "/app/user-management/tenant-modules"},
	{prefix: "/api/v1/purchase-request", moduleCode: "purchase_request",
		message: "Purchase Request is turned off. Create a Purchase Order directly.", nextHint: "/app/purchase-order/purchase-orders/new"},
	{prefix: "/api/v1/purchase-order", moduleCode: "purchase_order",
		message: "Purchase Order is turned off for this workspace.", nextHint: "/app/user-management/tenant-modules"},
	{prefix: "/api/v1/goods-receipt", moduleCode: "purchase_order",
		message: "Goods receipt (Purchase Order module) is turned off for this workspace.", nextHint: "/app/user-management/tenant-modules"},
	{prefix: "/api/v1/finance/supplier-invoices", moduleCode: "purchases",
		message: "Purchases (supplier invoices) are turned off for this workspace.", nextHint: "/app/user-management/tenant-modules"},
	{prefix: "/api/v1/pos", moduleCode: "pos",
		message: "POS is turned off for this workspace.", nextHint: "/app/user-management/tenant-modules"},
	{prefix: "/api/v1/sop", moduleCode: "sop",
		message: "SOP is turned off for this workspace.", nextHint: "/app/user-management/tenant-modules"},
	{prefix: "/api/v1/okr", moduleCode: "okr",
		message: "OKR is turned off for this workspace.", nextHint: "/app/user-management/tenant-modules"},
	{prefix: "/api/v1/cms", moduleCode: "cms",
		message: "Pages is turned off for this workspace.", nextHint: "/app/user-management/tenant-modules"},
}

// ModuleEnablement blocks mutating API calls when the mapped module/feature is disabled.
// GET/HEAD/OPTIONS always pass. Owners / auto_enable_all_modules pass.
func ModuleEnablement(pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}
			path := strings.ToLower(r.URL.Path)
			// Settings / auth / onboarding always allowed to mutate
			if strings.Contains(path, "/user-management/") ||
				strings.Contains(path, "/settings/") ||
				strings.Contains(path, "/auth/") ||
				strings.Contains(path, "/platform/") ||
				strings.Contains(path, "/onboarding") {
				next.ServeHTTP(w, r)
				return
			}

			tu, ok := auth.FromContext(r.Context())
			if !ok || tu.IsPlatformSuperadmin || tu.AutoEnableAllModules {
				next.ServeHTTP(w, r)
				return
			}

			rule, matched := matchModuleRule(path)
			if !matched {
				next.ServeHTTP(w, r)
				return
			}

			enabled, err := tenantModuleEnabled(r.Context(), pool, tu.TenantID, rule.moduleCode)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to check module access.", "ERR_INTERNAL")
				return
			}
			if !enabled {
				response.JSON(w, http.StatusForbidden, response.Envelope{
					Success: false,
					Message: rule.message,
					Code:    "ERR_MODULE_DISABLED",
					Data: map[string]any{
						"module_code": rule.moduleCode,
						"next":        rule.nextHint,
					},
				})
				return
			}
			if rule.featureCode != "" {
				featOn, err := tenantModuleEnabled(r.Context(), pool, tu.TenantID, rule.featureCode)
				if err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to check feature access.", "ERR_INTERNAL")
					return
				}
				if !featOn {
					response.JSON(w, http.StatusForbidden, response.Envelope{
						Success: false,
						Message: rule.message,
						Code:    "ERR_FEATURE_DISABLED",
						Data: map[string]any{
							"module_code":  rule.moduleCode,
							"feature_code": rule.featureCode,
							"next":         rule.nextHint,
						},
					})
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

func matchModuleRule(path string) (moduleRouteRule, bool) {
	bestLen := 0
	var best moduleRouteRule
	found := false
	for _, rule := range moduleMutationRules {
		p := strings.ToLower(rule.prefix)
		if path == p || strings.HasPrefix(path, p+"/") {
			if len(p) > bestLen {
				bestLen = len(p)
				best = rule
				found = true
			}
		}
	}
	return best, found
}

func tenantModuleEnabled(ctx context.Context, pool *pgxpool.Pool, tenantID int64, code string) (bool, error) {
	return tenantmodules.Enabled(ctx, pool, tenantID, code)
}
