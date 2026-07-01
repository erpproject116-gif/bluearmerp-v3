package manufacturing

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
	return time.Parse("2006-01-02", strings.TrimSpace(s))
}
