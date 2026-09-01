package validation

import (
	"net/mail"
	"strings"
)

// IsValidEmail reports whether s is a syntactically valid email address.
func IsValidEmail(s string) bool {
	s = strings.TrimSpace(s)
	if s == "" || len(s) > 320 {
		return false
	}
	addr, err := mail.ParseAddress(s)
	if err != nil {
		return false
	}
	return addr.Address == s && strings.Contains(s, ".")
}

// NormalizeEmail lowercases and trims a required email address.
func NormalizeEmail(raw string) (string, bool) {
	s := strings.TrimSpace(strings.ToLower(raw))
	if !IsValidEmail(s) {
		return "", false
	}
	return s, true
}
