package finance

import "strings"

var allowedPaymentMethods = map[string]bool{
	"cash":          true,
	"check":         true,
	"bank_transfer": true,
	"note":          true,
	"other":         true,
	"card":          true,
}

func normalizePaymentMethod(pm string) string {
	return strings.TrimSpace(strings.ToLower(pm))
}

func isAllowedPaymentMethod(pm string) bool {
	return allowedPaymentMethods[normalizePaymentMethod(pm)]
}

func paymentMethodValidationMessage() string {
	return "Payment method must be cash, check, bank_transfer, note, other, or card."
}
