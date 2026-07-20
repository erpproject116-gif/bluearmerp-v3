package openlines

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Filters carries Ecount-style Load Slip monitor query params.
type Filters struct {
	PartnerID *int64
	DateFrom  string // YYYY-MM-DD
	DateTo    string // YYYY-MM-DD
	DocNo     string
}

// ParseFilters reads partner_id, date_from, date_to, doc_no from the request.
// When defaultRecentDays > 0 and both dates empty, sets date_from to today-defaultRecentDays.
func ParseFilters(r *http.Request, defaultRecentDays int) Filters {
	f := Filters{
		DocNo: strings.TrimSpace(r.URL.Query().Get("doc_no")),
	}
	if v := strings.TrimSpace(r.URL.Query().Get("partner_id")); v != "" {
		if id, err := strconv.ParseInt(v, 10, 64); err == nil && id > 0 {
			f.PartnerID = &id
		}
	}
	f.DateFrom = strings.TrimSpace(r.URL.Query().Get("date_from"))
	f.DateTo = strings.TrimSpace(r.URL.Query().Get("date_to"))
	if defaultRecentDays > 0 && f.DateFrom == "" && f.DateTo == "" {
		f.DateFrom = time.Now().AddDate(0, 0, -defaultRecentDays).Format("2006-01-02")
	}
	return f
}

// Apply appends SQL fragments for partner/date/doc filters.
// dateColumn e.g. "so.order_date", docColumn e.g. "so.sales_order_no", partnerColumn e.g. "so.partner_id".
func (f Filters) Apply(where string, args []any, argN int, partnerColumn, dateColumn, docColumn string) (string, []any, int) {
	if f.PartnerID != nil && partnerColumn != "" {
		where += fmt.Sprintf(" and %s = $%d", partnerColumn, argN)
		args = append(args, *f.PartnerID)
		argN++
	}
	if f.DateFrom != "" && dateColumn != "" {
		where += fmt.Sprintf(" and %s >= $%d::date", dateColumn, argN)
		args = append(args, f.DateFrom)
		argN++
	}
	if f.DateTo != "" && dateColumn != "" {
		where += fmt.Sprintf(" and %s <= $%d::date", dateColumn, argN)
		args = append(args, f.DateTo)
		argN++
	}
	if f.DocNo != "" && docColumn != "" {
		where += fmt.Sprintf(" and %s ilike $%d", docColumn, argN)
		args = append(args, "%"+f.DocNo+"%")
		argN++
	}
	return where, args, argN
}
