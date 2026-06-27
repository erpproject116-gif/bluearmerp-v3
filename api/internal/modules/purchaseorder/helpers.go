package purchaseorder

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func formatDateNoDisplay(orderDate time.Time, dateSeq int) string {
	return fmt.Sprintf("%02d/%02d/%04d-%d",
		orderDate.Month(), orderDate.Day(), orderDate.Year(), dateSeq)
}

func parseDate(s string) (time.Time, error) {
	return time.Parse("2006-01-02", strings.TrimSpace(s))
}

func dateToStr(t time.Time) string {
	return t.Format("2006-01-02")
}

func formatItemNameSummary(first *string, lineCount int) string {
	if first == nil || strings.TrimSpace(*first) == "" {
		return ""
	}
	name := strings.TrimSpace(*first)
	if lineCount <= 1 {
		return name
	}
	return fmt.Sprintf("%s and %d more", name, lineCount-1)
}

func optionalInt64Query(r *http.Request, key string) (*int64, bool) {
	s := strings.TrimSpace(r.URL.Query().Get(key))
	if s == "" {
		return nil, false
	}
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil || n <= 0 {
		return nil, false
	}
	return &n, true
}

func isValidPOStatus(s string) bool {
	switch s {
	case "draft", "confirmed", "partially_received", "received", "cancelled":
		return true
	default:
		return false
	}
}
