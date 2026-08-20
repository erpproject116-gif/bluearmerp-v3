package dashboard

import (
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/periodbi"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func periodSummaryHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		kind := periodbi.Weekly
		if strings.EqualFold(strings.TrimSpace(r.URL.Query().Get("period")), "monthly") {
			kind = periodbi.Monthly
		}
		from, fromOK := parseISODate(r.URL.Query().Get("date_from"))
		if !fromOK {
			from, fromOK = parseISODate(r.URL.Query().Get("from_date"))
		}
		to, toOK := parseISODate(r.URL.Query().Get("date_to"))
		if !toOK {
			to, toOK = parseISODate(r.URL.Query().Get("to_date"))
		}
		var out periodbi.Report
		if fromOK && toOK {
			out = periodbi.LoadWindow(r.Context(), pool, tu.TenantID, kind, from, to)
		} else {
			out = periodbi.Load(r.Context(), pool, tu.TenantID, kind)
		}
		out.CompanyName = periodbi.CompanyName(r.Context(), pool, tu.TenantID)
		w.Header().Set("Cache-Control", "private, max-age=60")
		response.OK(w, out, "OK")
	}
}

func parseISODate(raw string) (time.Time, bool) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return time.Time{}, false
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return time.Time{}, false
	}
	return t, true
}
