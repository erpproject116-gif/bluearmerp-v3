package crm

import (
	"fmt"
	"strings"
	"time"
)

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

func formatDateNoDisplay(orderDate time.Time, dateSeq int) string {
	return fmt.Sprintf("%02d/%02d/%04d-%d",
		orderDate.Month(), orderDate.Day(), orderDate.Year(), dateSeq)
}

func orderSQL(order string) string {
	if order == "desc" {
		return "desc"
	}
	return "asc"
}

func addLead(t time.Time, value int, unit string) time.Time {
	switch unit {
	case "months":
		return t.AddDate(0, value, 0)
	default:
		return t.AddDate(0, 0, value)
	}
}

func subtractLead(t time.Time, value int, unit string) time.Time {
	switch unit {
	case "months":
		return t.AddDate(0, -value, 0)
	default:
		return t.AddDate(0, 0, -value)
	}
}

func todayDate() time.Time {
	now := time.Now()
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
}

func dedupeKey(ruleType string, ruleID int64, entityType string, entityID int64, day time.Time) string {
	return fmt.Sprintf("%s:%d:%s:%d:%s", ruleType, ruleID, entityType, entityID, day.Format("2006-01-02"))
}

func splitSerials(serialLotNo string) []string {
	parts := strings.Split(serialLotNo, ",")
	var out []string
	for _, p := range parts {
		s := strings.TrimSpace(p)
		if s != "" {
			out = append(out, s)
		}
	}
	return out
}
