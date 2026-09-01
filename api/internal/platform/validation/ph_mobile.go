package validation

import "strings"

// NormalizePHMobile accepts common Philippine mobile formats and returns the
// E.164 form (+639XXXXXXXXX). Accepted inputs (spaces/dashes/parens ignored):
//
//	09171234567        -> +639171234567
//	9171234567         -> +639171234567
//	639171234567       -> +639171234567
//	+639171234567      -> +639171234567
//
// Returns ("", false) when the number is not a valid PH mobile.
func NormalizePHMobile(raw string) (string, bool) {
	d := digitsOnly(raw)

	switch {
	case len(d) == 13 && strings.HasPrefix(d, "63"):
		// e.g. leading 0 kept after country code (630917...) — drop the stray 0.
		if d[2] == '0' {
			d = "63" + d[3:]
		}
	}

	var local string // the 10-digit subscriber number, must start with 9
	switch {
	case len(d) == 12 && strings.HasPrefix(d, "63"):
		local = d[2:]
	case len(d) == 11 && strings.HasPrefix(d, "0"):
		local = d[1:]
	case len(d) == 10 && strings.HasPrefix(d, "9"):
		local = d
	default:
		return "", false
	}

	if len(local) != 10 || local[0] != '9' {
		return "", false
	}
	return "+63" + local, true
}

// NormalizePHMobileLocal stores mobiles in the familiar 09XXXXXXXXX form.
func NormalizePHMobileLocal(raw string) (string, bool) {
	e164, ok := NormalizePHMobile(raw)
	if !ok {
		return "", false
	}
	return "0" + e164[3:], true
}
