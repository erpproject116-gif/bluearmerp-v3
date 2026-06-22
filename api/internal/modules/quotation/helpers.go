package quotation

import (
	"fmt"
	"regexp"
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

func datePtrToStr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.Format("2006-01-02")
	return &s
}

var validityDaysRe = regexp.MustCompile(`(?i)(\d+)\s*day`)

func parseValidityDays(text string) *int {
	m := validityDaysRe.FindStringSubmatch(strings.TrimSpace(text))
	if len(m) < 2 {
		return nil
	}
	n, err := strconv.Atoi(m[1])
	if err != nil || n <= 0 {
		return nil
	}
	return &n
}

func computeValidUntil(orderDate time.Time, validityDays *int) *time.Time {
	if validityDays == nil {
		return nil
	}
	t := orderDate.AddDate(0, 0, *validityDays)
	return &t
}

func defaultProgress(s string) string {
	switch s {
	case "in_progress", "completed":
		return s
	default:
		return "unconfirmed"
	}
}
