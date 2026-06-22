package usermgmt

import (
	"net/mail"
	"regexp"
	"strings"
)

var roleCodeRe = regexp.MustCompile(`^[a-z][a-z0-9_]{0,49}$`)

func normalizeEmail(raw string) string {
	return strings.ToLower(strings.TrimSpace(raw))
}

func validEmail(raw string) bool {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return false
	}
	_, err := mail.ParseAddress(raw)
	return err == nil
}

func validRoleCode(code string) bool {
	return roleCodeRe.MatchString(code)
}

func slugRoleCode(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	s = regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(s, "_")
	s = strings.Trim(s, "_")
	if s == "" {
		return "custom_role"
	}
	if len(s) > 50 {
		s = s[:50]
	}
	return s
}
