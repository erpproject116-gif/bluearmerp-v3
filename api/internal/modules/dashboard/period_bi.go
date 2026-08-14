package dashboard

import (
	"net/http"
	"strings"

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
		out := periodbi.Load(r.Context(), pool, tu.TenantID, kind)
		out.CompanyName = periodbi.CompanyName(r.Context(), pool, tu.TenantID)
		w.Header().Set("Cache-Control", "private, max-age=60")
		response.OK(w, out, "OK")
	}
}
