package goodsreceipt

import (
	"fmt"
	"net/http"
	"strings"
	"time"
)

func parseDate(s string) (time.Time, error) {
	return time.Parse("2006-01-02", strings.TrimSpace(s))
}

func dateToStr(t time.Time) string {
	return t.Format("2006-01-02")
}

func orderSQL(order string) string {
	if order == "desc" {
		return "desc"
	}
	return "asc"
}

func optionalInt64Query(r *http.Request, key string) (*int64, bool) {
	v := strings.TrimSpace(r.URL.Query().Get(key))
	if v == "" {
		return nil, false
	}
	var id int64
	if _, err := fmt.Sscan(v, &id); err != nil || id <= 0 {
		return nil, false
	}
	return &id, true
}

func warrantyEndDate(receiptDate time.Time, months int) *time.Time {
	if months <= 0 {
		return nil
	}
	end := receiptDate.AddDate(0, months, 0)
	return &end
}
