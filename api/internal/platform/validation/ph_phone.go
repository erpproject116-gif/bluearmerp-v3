package validation

// NormalizePHPhone accepts common Philippine landline formats and stores digits only.
// Empty input is invalid for normalization; use optional validators at call sites.
func NormalizePHPhone(raw string) (string, bool) {
	d := digitsOnly(raw)
	if len(d) < 7 || len(d) > 11 {
		return "", false
	}
	return d, true
}
