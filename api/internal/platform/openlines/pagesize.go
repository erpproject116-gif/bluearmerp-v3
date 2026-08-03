package openlines

import (
	"net/http"
	"strconv"
	"strings"
)

const (
	// DefaultPageSize is used when the client omits pageSize on Load Slip open-line lists.
	DefaultPageSize = 200
	// MaxPageSize caps Load Slip pages so all open lines are reachable without filters.
	MaxPageSize = 500
)

// PageSize reads pageSize from the query (up to MaxPageSize). Falls back to
// DefaultPageSize when missing/invalid so Load Slip can return large open sets
// beyond the global ParseListParams clamp of 100.
func PageSize(r *http.Request, fallback int) int {
	raw := strings.TrimSpace(r.URL.Query().Get("pageSize"))
	if raw == "" {
		if fallback <= 0 {
			return DefaultPageSize
		}
		if fallback > MaxPageSize {
			return MaxPageSize
		}
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 1 {
		return DefaultPageSize
	}
	if n > MaxPageSize {
		return MaxPageSize
	}
	return n
}
