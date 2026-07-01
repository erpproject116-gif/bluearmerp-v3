package hr

import (
	"strings"
	"time"
)

func orderSQL(order string) string {
	if strings.EqualFold(order, "desc") {
		return "desc"
	}
	return "asc"
}

func parseDate(s string) (time.Time, error) {
	if strings.TrimSpace(s) == "" {
		return time.Now(), nil
	}
	return time.Parse("2006-01-02", strings.TrimSpace(s))
}
