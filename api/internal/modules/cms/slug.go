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
const defaultTopic = "blog"

func articlePermalink(topic, slug string) string {
	t := topic
	if t == "" {
		t = defaultTopic
	}
	return "/articles/" + t + "/" + slug
}

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

func normalizeLang(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "tl"
	}
	s = strings.ReplaceAll(s, "_", "-")
	parts := strings.SplitN(s, "-", 2)
	if len(parts[0]) != 2 {
		return "tl"
	}
	lang := strings.ToLower(parts[0])
	if len(parts) == 1 {
		return lang
	}
	if len(parts[1]) != 2 {
		return lang
	}
	return lang + "-" + strings.ToUpper(parts[1])
}

func normalizeVisibility(raw string) string {
	s := strings.ToLower(strings.TrimSpace(raw))
	if s == "public" {
		return "public"
	}
	return "internal"
}

func normalizeFocus(raw *string) *string {
	if raw == nil {
		return nil
	}
	s := strings.TrimSpace(*raw)
	if s == "" {
		return nil
	}
	if len(s) > 120 {
		s = s[:120]
	}
	return &s
}

func isPrintableTitle(title string) bool {
	for _, r := range title {
		if unicode.IsControl(r) && r != '\t' {
			return false
		}
	}
	return strings.TrimSpace(title) != ""
}
