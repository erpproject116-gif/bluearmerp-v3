package reporttemplates

import "strings"

var allowedReportKeys = map[string]struct{}{
	"sales_discount_status":     {},
	"sales_status":              {},
	"sales_order_status":        {},
	"official_receipt_status":   {},
}

func ValidReportKey(key string) bool {
	_, ok := allowedReportKeys[strings.TrimSpace(key)]
	return ok
}

func AllowedReportKeys() []string {
	return []string{
		"sales_discount_status",
		"sales_status",
		"sales_order_status",
		"official_receipt_status",
	}
}
