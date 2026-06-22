package finance

import (
	"fmt"
	"strings"
	"time"
)

func formatDateNoDisplay(receiptDate time.Time, dateSeq int) string {
	return fmt.Sprintf("%02d/%02d/%04d-%d",
		receiptDate.Month(), receiptDate.Day(), receiptDate.Year(), dateSeq)
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

func orderSQL(order string) string {
	if order == "desc" {
		return "desc"
	}
	return "asc"
}

func paymentMethodLabel(m string) string {
	switch m {
	case "cash":
		return "Cash"
	case "check":
		return "Check"
	case "bank_transfer":
		return "Bank Transfer"
	default:
		return m
	}
}
