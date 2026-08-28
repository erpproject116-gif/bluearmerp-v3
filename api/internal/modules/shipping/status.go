package shipping

import "strings"

// NormalizeShippingOrderStatus returns an allowed status or empty + false when invalid.
// Empty input becomes draft.
func NormalizeShippingOrderStatus(raw string) (string, bool) {
	s := strings.ToLower(strings.TrimSpace(raw))
	if s == "" {
		return "draft", true
	}
	switch s {
	case "draft", "confirmed", "shipped", "cancelled":
		return s, true
	default:
		return "", false
	}
}

// NormalizeDeliveryTripStatus returns an allowed status or empty + false when invalid.
// Empty input becomes planned.
func NormalizeDeliveryTripStatus(raw string) (string, bool) {
	s := strings.ToLower(strings.TrimSpace(raw))
	if s == "" {
		return "planned", true
	}
	switch s {
	case "planned", "in_progress", "completed", "cancelled":
		return s, true
	default:
		return "", false
	}
}
