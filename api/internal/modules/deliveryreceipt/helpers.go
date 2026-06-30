package deliveryreceipt

import (
	"fmt"
	"strings"
	"time"
)

func formatDateNoDisplay(d time.Time, dateSeq int) string {
	return fmt.Sprintf("%02d/%02d/%04d-%d", d.Month(), d.Day(), d.Year(), dateSeq)
}

func parseDate(s string) (time.Time, error) {
	return time.Parse("2006-01-02", strings.TrimSpace(s))
}

func dateToStr(t time.Time) string {
	return t.Format("2006-01-02")
}
