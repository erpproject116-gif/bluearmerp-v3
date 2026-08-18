package cms

import (
	"regexp"
	"strings"
	"unicode"
)

const maxSlugLen = 120
const maxPageBodyBytes = 200 * 1024
const maxSEODescLen = 320
const maxSEOTitleLen = 200

var slugRe = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
var nonSlug = regexp.MustCompile(`[^a-z0-9]+`)

func normalizeSlug(raw string) string {
	s := strings.ToLower(strings.TrimSpace(raw))
	s = nonSlug.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if len(s) > maxSlugLen {
		s = strings.Trim(s[:maxSlugLen], "-")
	}
	return s
}

func slugFromTitle(title string) string {
	s := normalizeSlug(title)
	if s == "" {
		return "page"
	}
	return s
}

func validSlug(s string) bool {
	if s == "" || len(s) > maxSlugLen {
		return false
	}
	return slugRe.MatchString(s)
}

func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "duplicate key") || strings.Contains(msg, "unique constraint") || strings.Contains(msg, "23505")
}

func pageVisibleToReader(status string) bool {
	return status == "published"
}

func isPrintableTitle(title string) bool {
	for _, r := range title {
		if unicode.IsControl(r) && r != '\t' {
			return false
		}
	}
	return strings.TrimSpace(title) != ""
}
