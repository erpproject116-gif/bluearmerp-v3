package validation

import (
	"fmt"
	"regexp"
)

// Philippine TIN formats (BIR):
//   - Individual: 9 digits → XXX-XXX-XXX (e.g. 123-456-789)
//   - Corporate / branch: 12 digits → XXX-XXX-XXX-XXX (e.g. 123-456-789-000)
//
// The optional 3-digit branch suffix is 000 for head office, 001+ for branches.
// Checksum digit validation is not enforced here.
const PHTINFormatHint = "123-456-789 (individual) or 123-456-789-000 (corporate/branch)"

var tinFormattedPattern = regexp.MustCompile(`^\d{3}-\d{3}-\d{3}(-\d{3})?$`)

// NormalizePHTIN accepts 9- or 12-digit Philippine TIN values and returns the
// canonical dashed form (XXX-XXX-XXX or XXX-XXX-XXX-XXX).
func NormalizePHTIN(raw string) (string, bool) {
	trimmed := trimSpaces(raw)
	if trimmed != "" && tinFormattedPattern.MatchString(trimmed) {
		d := digitsOnly(trimmed)
		if len(d) == 9 || len(d) == 12 {
			return formatPHTINDigits(d), true
		}
	}
	d := digitsOnly(raw)
	if len(d) != 9 && len(d) != 12 {
		return "", false
	}
	return formatPHTINDigits(d), true
}

func formatPHTINDigits(d string) string {
	switch len(d) {
	case 9:
		return fmt.Sprintf("%s-%s-%s", d[0:3], d[3:6], d[6:9])
	default:
		return fmt.Sprintf("%s-%s-%s-%s", d[0:3], d[3:6], d[6:9], d[9:12])
	}
}

func trimSpaces(s string) string {
	out := make([]rune, 0, len(s))
	for _, r := range s {
		if r != ' ' && r != '\t' {
			out = append(out, r)
		}
	}
	return string(out)
}
