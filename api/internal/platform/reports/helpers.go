package reports

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const ExportMaxRows = 5000

func ParseOptionalDateRange(r *http.Request) (*time.Time, *time.Time, map[string]string) {
	fromStr := strings.TrimSpace(r.URL.Query().Get("date_from"))
	toStr := strings.TrimSpace(r.URL.Query().Get("date_to"))
	if fromStr == "" && toStr == "" {
		return nil, nil, nil
	}
	errs := map[string]string{}
	if fromStr == "" {
		errs["date_from"] = "Start date is required when filtering by date."
	}
	if toStr == "" {
		errs["date_to"] = "End date is required when filtering by date."
	}
	if len(errs) > 0 {
		return nil, nil, errs
	}
	from, err := parseDate(fromStr)
	if err != nil {
		errs["date_from"] = "Invalid date. Use YYYY-MM-DD."
	}
	to, err := parseDate(toStr)
	if err != nil {
		errs["date_to"] = "Invalid date. Use YYYY-MM-DD."
	}
	if len(errs) > 0 {
		return nil, nil, errs
	}
	if from.After(to) {
		errs["date_to"] = "End date must be on or after start date."
		return nil, nil, errs
	}
	return &from, &to, nil
}

func parseDate(s string) (time.Time, error) {
	return time.Parse("2006-01-02", s)
}

func OrderSQL(order string) string {
	if order == "desc" {
		return "desc"
	}
	return "asc"
}

func AppendDateFilter(where string, args []any, argN int, col string, dateFrom, dateTo *time.Time) (string, []any, int) {
	if dateFrom != nil && dateTo != nil {
		where += fmt.Sprintf(" and %s >= $%d::date and %s <= $%d::date", col, argN, col, argN+1)
		args = append(args, *dateFrom, *dateTo)
		argN += 2
	}
	return where, args, argN
}

func ValidationDateRange(w http.ResponseWriter, r *http.Request) (*time.Time, *time.Time, bool) {
	from, to, errs := ParseOptionalDateRange(r)
	if errs != nil {
		response.Validation(w, errs)
		return nil, nil, false
	}
	return from, to, true
}
