package copilot

import (
	"net/url"
	"strings"
)

// SafeAppPath returns a cleaned in-app path if href is a safe Bluearm deep link.
// Rejects scheme-relative, javascript/data, backslashes, traversal, and whitespace tricks.
func SafeAppPath(href string) (string, bool) {
	h := strings.TrimSpace(href)
	if h == "" {
		return "", false
	}
	lower := strings.ToLower(h)
	if strings.Contains(lower, "javascript:") || strings.Contains(lower, "data:") || strings.Contains(lower, "vbscript:") {
		return "", false
	}
	if strings.ContainsAny(h, " \t\r\n\\") || strings.Contains(h, "\x00") {
		return "", false
	}
	if strings.HasPrefix(h, "//") || strings.Contains(h, "://") {
		return "", false
	}
	if !strings.HasPrefix(h, "/app/") {
		return "", false
	}
	// Disallow path traversal
	for _, seg := range strings.Split(h, "/") {
		if seg == ".." {
			return "", false
		}
	}
	// Normalize via url.Parse (path only)
	u, err := url.Parse(h)
	if err != nil || u.Host != "" || u.Scheme != "" || u.Opaque != "" {
		return "", false
	}
	path := u.EscapedPath()
	if path == "" {
		path = u.Path
	}
	if !strings.HasPrefix(path, "/app/") {
		return "", false
	}
	if u.RawQuery != "" {
		path = path + "?" + u.RawQuery
	}
	return path, true
}

// SanitizeDeepLinks keeps only safe /app links (drops unsafe ones).
func SanitizeDeepLinks(links []deepLink) []deepLink {
	if len(links) == 0 {
		return links
	}
	out := make([]deepLink, 0, len(links))
	for _, l := range links {
		if href, ok := SafeAppPath(l.Href); ok {
			out = append(out, deepLink{Label: l.Label, Href: href})
		}
	}
	return out
}

func sanitizeToolResult(tr toolResult) toolResult {
	tr.DeepLinks = SanitizeDeepLinks(tr.DeepLinks)
	if tr.ActionDraft != nil && tr.ActionDraft.Payload != nil {
		tr.ActionDraft.Payload = sanitizeDraftPayload(tr.ActionDraft.Type, tr.ActionDraft.Payload)
	}
	return tr
}

func sanitizeAskDeepLinks(links []deepLink) []deepLink {
	return SanitizeDeepLinks(links)
}
