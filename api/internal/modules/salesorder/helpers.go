package salesorder

import (
	"fmt"
	"strings"
	"time"
)

func formatDateNoDisplay(orderDate time.Time, dateSeq int) string {
	return fmt.Sprintf("%02d/%02d/%04d-%d",
		orderDate.Month(), orderDate.Day(), orderDate.Year(), dateSeq)
}

func formatDisplayDate(t time.Time) string {
	return fmt.Sprintf("%02d/%02d/%04d", t.Month(), t.Day(), t.Year())
}

func parseDate(s string) (time.Time, error) {
	return time.Parse("2006-01-02", strings.TrimSpace(s))
}

func parseOptionalDate(s *string) (*time.Time, error) {
	if s == nil || strings.TrimSpace(*s) == "" {
		return nil, nil
	}
	t, err := parseDate(*s)
	if err != nil {
		return nil, err
	}
	return &t, nil
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

func defaultProgress(s string) string {
	switch s {
	case "in_progress", "completed":
		return s
	default:
		return "unconfirmed"
	}
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
