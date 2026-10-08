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
	// anyModule, when set, allows the write if any listed module is on.
	// Empty keeps the single moduleCode check. Used by shipping, which Sales and Sales Order both write.
	anyModule []string
	message   string
	nextHint  string
}

const appsHubHint = "/app/user-management/tenant-modules"

// Longest-prefix first is enforced by matchModuleRule (not list order).
var moduleMutationRules = []moduleRouteRule{
	// Inventory features (must be longer than /inventory)
	{prefix: "/api/v1/inventory/serial-units", moduleCode: "inventory", featureCode: "inventory.serial_lot",
		message: "Serial & Lot is turned off for this workspace.", nextHint: appsHubHint},
	{prefix: "/api/v1/inventory/lot-batches", moduleCode: "inventory", featureCode: "inventory.serial_lot",
		message: "Serial & Lot is turned off for this workspace.", nextHint: appsHubHint},
	{prefix: "/api/v1/inventory/serial-reports", moduleCode: "inventory", featureCode: "inventory.serial_lot",
		message: "Serial & Lot is turned off for this workspace.", nextHint: appsHubHint},
	{prefix: "/api/v1/inventory/lot-reports", moduleCode: "inventory", featureCode: "inventory.serial_lot",
		message: "Serial & Lot is turned off for this workspace.", nextHint: appsHubHint},
	{prefix: "/api/v1/inventory/reconciliation", moduleCode: "inventory", featureCode: "inventory.serial_lot",
		message: "Serial & Lot is turned off for this workspace.", nextHint: appsHubHint},
	{prefix: "/api/v1/inventory/price-lists", moduleCode: "inventory", featureCode: "inventory.price_lists",
		message: "Price Lists are turned off for this workspace.", nextHint: appsHubHint},
	{prefix: "/api/v1/inventory/repair-orders", moduleCode: "after_sales",
		message: "After-Sales is turned off for this workspace.", nextHint: appsHubHint},
	{prefix: "/api/v1/inventory/repair-registrations", moduleCode: "after_sales",
		message: "After-Sales is turned off for this workspace.", nextHint: appsHubHint},
	{prefix: "/api/v1/inventory/after-sales", moduleCode: "after_sales",
		message: "After-Sales is turned off for this workspace.", nextHint: appsHubHint},
	{prefix: "/api/v1/inventory", moduleCode: "inventory",
		message: "Inventory is turned off for this workspace.", nextHint: appsHubHint},
	{prefix: "/api/v1/wms", moduleCode: "inventory", featureCode: "inventory.wms",
		message: "WMS is turned off for this workspace.", nextHint: appsHubHint},

	// Sell / buy
	{prefix: "/api/v1/quotation", moduleCode: "quotation",
		message: "Quotation is turned off for this workspace. Turn it on under Apps & features, or bill from Sales.", nextHint: "/app/sales/sales/new"},
	{prefix: "/api/v1/sales-order", moduleCode: "sales_order",
		message: "Sales Order is turned off for this workspace. Use Sales invoices for direct billing.", nextHint: "/app/sales/sales/new"},
	{prefix: "/api/v1/selling", moduleCode: "sales",
		message: "Sales is turned off for this workspace.", nextHint: appsHubHint},
	{prefix: "/api/v1/sales", moduleCode: "sales",
		message: "Sales is turned off for this workspace.", nextHint: appsHubHint},
	{prefix: "/api/v1/shipping", anyModule: []string{"sales", "sales_order"},
		message: "Shipping is turned off while Sales and Sales Order are off.", nextHint: appsHubHint},
	{prefix: "/api/v1/purchase-request", moduleCode: "purchase_request",
		message: "Purchase Request is turned off. Create a Purchase Order directly.", nextHint: "/app/purchase-order/purchase-orders/new"},
	{prefix: "/api/v1/purchase-order", moduleCode: "purchase_order",
		message: "Purchase Order is turned off for this workspace.", nextHint: appsHubHint},
	{prefix: "/api/v1/goods-receipt", moduleCode: "purchase_order",
		message: "Goods receipt (Purchase Order module) is turned off for this workspace.", nextHint: appsHubHint},
	{prefix: "/api/v1/buying", moduleCode: "purchase_order",
		message: "Purchase Order is turned off for this workspace.", nextHint: appsHubHint},

	// Finance — supplier invoices stay purchases; rest is finance
	{prefix: "/api/v1/finance/supplier-invoices", moduleCode: "purchases",
		message: "Purchases (supplier invoices) are turned off for this workspace.", nextHint: appsHubHint},
	{prefix: "/api/v1/finance", moduleCode: "finance",
		message: "Finance / accounting is turned off for this workspace.", nextHint: appsHubHint},
	{prefix: "/api/v1/company-budget", moduleCode: "company_budget",
		message: "Company Budget is turned off for this workspace.", nextHint: appsHubHint},

	{prefix: "/api/v1/pos", moduleCode: "pos",
		message: "POS is turned off for this workspace.", nextHint: appsHubHint},
	{prefix: "/api/v1/manufacturing", moduleCode: "manufacturing",
		message: "Manufacturing is turned off for this workspace.", nextHint: appsHubHint},
	{prefix: "/api/v1/quality", moduleCode: "quality",
		message: "Quality is turned off for this workspace.", nextHint: appsHubHint},
	{prefix: "/api/v1/crm", moduleCode: "crm",
		message: "CRM is turned off for this workspace.", nextHint: appsHubHint},
	{prefix: "/api/v1/support", moduleCode: "support",
		message: "Support is turned off for this workspace.", nextHint: appsHubHint},
	{prefix: "/api/v1/booking", moduleCode: "booking",
		message: "Booking is turned off for this workspace.", nextHint: appsHubHint},
	{prefix: "/api/v1/hr", moduleCode: "hr",
		message: "HR is turned off for this workspace.", nextHint: appsHubHint},
	{prefix: "/api/v1/fixed-assets", moduleCode: "fixed_assets",
		message: "Fixed Assets is turned off for this workspace.", nextHint: appsHubHint},
	{prefix: "/api/v1/job-costing", moduleCode: "job_costing",
		message: "Job Costing is turned off for this workspace.", nextHint: appsHubHint},
	{prefix: "/api/v1/operations", moduleCode: "operations",
		message: "Operations is turned off for this workspace.", nextHint: appsHubHint},
	{prefix: "/api/v1/sop", moduleCode: "sop",
		message: "SOP is turned off for this workspace.", nextHint: appsHubHint},
	{prefix: "/api/v1/okr", moduleCode: "okr",
		message: "OKR is turned off for this workspace.", nextHint: appsHubHint},
	{prefix: "/api/v1/cms", moduleCode: "cms",
		message: "Pages is turned off for this workspace.", nextHint: appsHubHint},
	{prefix: "/api/v1/bi", moduleCode: "bi",
		message: "Ad-hoc BI is turned off for this workspace.", nextHint: appsHubHint},
	{prefix: "/api/v1/dashboard", moduleCode: "dashboard",
		message: "Dashboard is turned off for this workspace.", nextHint: appsHubHint},
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

			enabled, err := moduleRuleEnabled(r.Context(), pool, tu.TenantID, rule)
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

// moduleRuleEnabled reports whether this rule's module is on.
// anyModule allows the write when any listed code is enabled. An empty list uses moduleCode once.
func moduleRuleEnabled(ctx context.Context, pool *pgxpool.Pool, tenantID int64, rule moduleRouteRule) (bool, error) {
	if len(rule.anyModule) == 0 {
		return tenantModuleEnabled(ctx, pool, tenantID, rule.moduleCode)
	}
	for _, code := range rule.anyModule {
		on, err := tenantModuleEnabled(ctx, pool, tenantID, code)
		if err != nil {
			return false, err
		}
		if on {
			return true, nil
		}
	}
	return false, nil
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
