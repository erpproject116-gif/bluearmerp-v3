package money

import (
	"fmt"
	"math"
	"strings"
)

const PesoSign = "₱"

// DisplaySign maps ISO codes / symbols to the glyph shown on PDFs and API text.
// PHP / DOMESTIC / bare "$" → ₱. Other codes (USD, EUR…) are returned as-is.
func DisplaySign(currencyCode string) string {
	raw := strings.TrimSpace(currencyCode)
	if raw == "" || raw == PesoSign || raw == "P" {
		return PesoSign
	}
	upper := strings.ToUpper(raw)
	switch upper {
	case "PHP", "DOMESTIC", "PHP.", "PH", "PHP$", "PESO":
		return PesoSign
	case "$":
		return PesoSign
	}
	return raw
}

// Format formats amount with thousands separators and the display currency sign.
// Example: Format(1234.5, "PHP") → "₱1,234.50"
func Format(amount float64, currencyCode string) string {
	neg := amount < 0 || math.Signbit(amount)
	amount = math.Abs(amount)
	intPart := int64(math.Floor(amount + 1e-9))
	frac := int64(math.Round((amount-float64(intPart))*100 + 1e-9))
	if frac >= 100 {
		intPart++
		frac = 0
	}
	body := fmt.Sprintf("%s.%02d", withCommas(intPart), frac)
	out := DisplaySign(currencyCode) + body
	if neg {
		return "-" + out
	}
	return out
}

func withCommas(n int64) string {
	if n < 1000 {
		return fmt.Sprintf("%d", n)
	}
	s := fmt.Sprintf("%d", n)
	var b strings.Builder
	lead := len(s) % 3
	if lead == 0 {
		lead = 3
	}
	b.WriteString(s[:lead])
	for i := lead; i < len(s); i += 3 {
		b.WriteByte(',')
		b.WriteString(s[i : i+3])
	}
	return b.String()
}
