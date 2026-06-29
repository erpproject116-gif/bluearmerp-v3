package dashboard

import (
	"net/http"
	"strconv"
	"strings"
	"time"
)

func todayDate() time.Time {
	now := time.Now()
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
}

func parseMonths(r *http.Request) int {
	return clampInt(r.URL.Query().Get("months"), 12, 1, 36)
}

func parseLimit(r *http.Request) int {
	return clampInt(r.URL.Query().Get("limit"), 10, 1, 50)
}

func parseDays(r *http.Request) int {
	return clampInt(r.URL.Query().Get("days"), 90, 1, 365)
}

func clampInt(s string, def, min, max int) int {
	if strings.TrimSpace(s) == "" {
		return def
	}
	n, err := strconv.Atoi(strings.TrimSpace(s))
	if err != nil {
		return def
	}
	if n < min {
		return min
	}
	if n > max {
		return max
	}
	return n
}
