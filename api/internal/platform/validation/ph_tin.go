package validation

import "fmt"

// NormalizePHTIN accepts 9- or 12-digit Philippine TIN values and returns the
// canonical dashed form (XXX-XXX-XXX or XXX-XXX-XXX-XXX).
func NormalizePHTIN(raw string) (string, bool) {
	d := digitsOnly(raw)
	switch len(d) {
	case 9:
		return fmt.Sprintf("%s-%s-%s", d[0:3], d[3:6], d[6:9]), true
	case 12:
		return fmt.Sprintf("%s-%s-%s-%s", d[0:3], d[3:6], d[6:9], d[9:12]), true
	default:
		return "", false
	}
}
