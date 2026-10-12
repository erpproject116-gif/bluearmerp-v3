package hr

import (
	"strconv"
	"strings"
)

// mayIncludePenaltyInPay is the only gate that lets a discipline penalty become pay.
// Storing a penalty or an authority-to-deduct flag does not change pay.
func mayIncludePenaltyInPay(authorityToDeduct bool, penaltyAmount float64, payItemTypeID int64) bool {
	return authorityToDeduct && penaltyAmount > 0 && payItemTypeID > 0
}

func optionalPenaltyAmount(raw string) (*float64, string) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, ""
	}
	v, err := strconv.ParseFloat(raw, 64)
	if err != nil || v < 0 {
		return nil, "Penalty cannot be negative."
	}
	return &v, ""
}

func formFlag(raw string) bool {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}
