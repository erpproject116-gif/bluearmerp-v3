package helpassistant

import "strings"

// Route tag rules mirror web/src/modules/help-assistant/helpRouteContext.ts
var routeTagRules = []struct {
	Prefix string
	Tags   []string
}{
	{"/app/selling", []string{"selling", "reports"}},
	{"/app/quotation", []string{"quotation", "selling"}},
	{"/app/sales-order", []string{"sales-order", "selling"}},
	{"/app/sales", []string{"sales", "selling", "return"}},
	{"/app/purchase-request", []string{"purchase-request", "buying"}},
	{"/app/purchase-order", []string{"purchase-order", "buying", "rfq"}},
	{"/app/purchase-order/goods-receipt", []string{"goods-receipt", "buying", "inventory", "receive"}},
	{"/app/purchases", []string{"supplier-invoice", "buying", "finance"}},
	{"/app/buying", []string{"buying", "reports"}},
	{"/app/inventory/serial-lot", []string{"serial-lot", "serial", "inventory"}},
	{"/app/inventory", []string{"inventory"}},
	{"/app/after-sales", []string{"after-sales", "repair", "warranty"}},
	{"/app/pos/manage", []string{"pos", "pos-manage", "settings", "catalog"}},
	{"/app/pos", []string{"pos", "selling", "checkout", "shift"}},
	{"/app/finance/acct-i/chart-of-accounts", []string{"finance", "coa", "chart"}},
	{"/app/finance/acct-i", []string{"finance", "journal", "bank"}},
	{"/app/finance", []string{"finance"}},
	{"/app/operations/calendar", []string{"operations", "calendar", "today"}},
	{"/app/operations/packs", []string{"operations", "pack"}},
	{"/app/operations", []string{"operations", "calendar", "packs"}},
	{"/app/comms", []string{"communications", "gmail", "email"}},
	{"/app/crm", []string{"crm"}},
	{"/app/onboarding", []string{"onboarding", "setup"}},
	{"/app/setup", []string{"setup", "onboarding"}},
	{"/app/user-management", []string{"admin", "permissions", "policies"}},
	{"/app/manufacturing", []string{"manufacturing", "bom"}},
	{"/app/quality", []string{"quality", "ncr", "capa"}},
	{"/app/support", []string{"support"}},
}

func routeTagsFromPath(pathname string) []string {
	tags := map[string]struct{}{}
	// Longer prefixes first.
	sorted := make([]struct {
		Prefix string
		Tags   []string
	}, len(routeTagRules))
	copy(sorted, routeTagRules)
	for i := 0; i < len(sorted); i++ {
		for j := i + 1; j < len(sorted); j++ {
			if len(sorted[j].Prefix) > len(sorted[i].Prefix) {
				sorted[i], sorted[j] = sorted[j], sorted[i]
			}
		}
	}
	for _, rule := range sorted {
		if pathname == rule.Prefix || strings.HasPrefix(pathname, rule.Prefix+"/") {
			for _, t := range rule.Tags {
				tags[t] = struct{}{}
			}
		}
	}
	out := make([]string, 0, len(tags))
	for t := range tags {
		out = append(out, t)
	}
	return out
}
