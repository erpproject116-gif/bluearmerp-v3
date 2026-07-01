package bi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/reports"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func proxyExport(pool *pgxpool.Pool, apiHandler http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		reportKey := strings.TrimSpace(chi.URLParam(r, "reportKey"))
		def, ok := reports.FindByKey(reportKey)
		if !ok || def.ExportPath == "" {
			response.Err(w, http.StatusNotFound, "Report export not available.", "ERR_NOT_FOUND")
			return
		}

		q := r.URL.Query()
		if svID := strings.TrimSpace(q.Get("saved_view_id")); svID != "" {
			tu, _ := auth.FromContext(r.Context())
			id, err := parseID(svID)
			if err != nil {
				response.Err(w, http.StatusBadRequest, "Invalid saved_view_id.", "ERR_BAD_REQUEST")
				return
			}
			var filters json.RawMessage
			err = pool.QueryRow(r.Context(), `
				select filters from public.bi_saved_views
				where id = $1 and tenant_id = $2 and user_id = $3`,
				id, tu.TenantID, tu.AppUserID).Scan(&filters)
			if err == pgx.ErrNoRows {
				response.Err(w, http.StatusNotFound, "Saved view not found.", "ERR_NOT_FOUND")
				return
			}
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load saved view.", "ERR_INTERNAL")
				return
			}
			mergeFiltersIntoQuery(q, filters)
			q.Del("saved_view_id")
		}

		targetPath := strings.TrimPrefix(def.ExportPath, "/api/v1")
		if !strings.HasPrefix(targetPath, "/") {
			targetPath = "/" + targetPath
		}
		proxyReq := r.Clone(r.Context())
		proxyReq.URL.Path = targetPath
		proxyReq.RequestURI = targetPath + "?" + q.Encode()
		proxyReq.URL.RawQuery = q.Encode()
		apiHandler.ServeHTTP(w, proxyReq)
	}
}

func mergeFiltersIntoQuery(q url.Values, filters json.RawMessage) {
	var m map[string]any
	if err := json.Unmarshal(filters, &m); err != nil {
		return
	}
	for k, v := range m {
		switch val := v.(type) {
		case string:
			if val != "" {
				q.Set(k, val)
			}
		case float64:
			q.Set(k, fmt.Sprintf("%v", val))
		case bool:
			q.Set(k, fmt.Sprintf("%v", val))
		default:
			if b, err := json.Marshal(val); err == nil {
				s := strings.Trim(string(b), `"`)
				if s != "" && s != "null" {
					q.Set(k, s)
				}
			}
		}
	}
}
