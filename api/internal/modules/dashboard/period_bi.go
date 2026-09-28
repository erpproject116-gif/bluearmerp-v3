package dashboard

import (
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/aggcache"
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
		extra := string(kind) + "|" + from.Format("2006-01-02") + "|" + to.Format("2006-01-02")
		if !(fromOK && toOK) {
			extra = string(kind)
		}
		out, err := aggcache.Load(aggcache.Key(tu.TenantID, "period-summary", extra), false, func() (periodbi.Report, error) {
			var report periodbi.Report
			if fromOK && toOK {
				report = periodbi.LoadWindow(r.Context(), pool, tu.TenantID, kind, from, to)
			} else {
				report = periodbi.Load(r.Context(), pool, tu.TenantID, kind)
			}
			report.CompanyName = periodbi.CompanyName(r.Context(), pool, tu.TenantID)
			return report, nil
		})
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load period summary.", "ERR_INTERNAL")
			return
		}
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
