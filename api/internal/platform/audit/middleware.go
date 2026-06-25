package audit

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

// Middleware records successful mutating API calls when handlers did not already audit.Log.
// Actor role/permissions never suppress logging — every authenticated user action is captured.
func Middleware(pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			method := strings.ToUpper(r.Method)
			if method == http.MethodGet || method == http.MethodHead || method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}
			if shouldSkipHTTPAudit(r.URL.Path) {
				next.ServeHTTP(w, r)
				return
			}

			ctx := WithRequestFlag(r.Context())
			r = r.WithContext(ctx)
			sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(sw, r)

			if sw.status < 200 || sw.status >= 300 {
				return
			}
			if wasLogged(ctx) {
				return
			}
			tu, ok := auth.FromContext(ctx)
			if !ok || tu.AppUserID <= 0 || tu.TenantID <= 0 {
				return
			}

			actionCode, targetType, targetID, meta := deriveHTTPAudit(method, r.URL.Path)
			_ = Log(ctx, pool, tu.TenantID, tu.AppUserID, actionCode, targetType, targetID, nil, meta)
		})
	}
}

func shouldSkipHTTPAudit(path string) bool {
	path = strings.Split(path, "?")[0]
	skipPrefixes := []string{
		"/api/v1/presence/",
		"/api/v1/document-drafts/",
		"/api/v1/activity-logs",
	}
	for _, p := range skipPrefixes {
		if strings.HasPrefix(path, p) {
			return true
		}
	}
	return false
}

func deriveHTTPAudit(method, path string) (actionCode, targetType string, targetID *int64, meta map[string]any) {
	path = strings.Split(path, "?")[0]
	rel := strings.TrimPrefix(path, "/api/v1/")
	rel = strings.Trim(rel, "/")
	parts := []string{}
	if rel != "" {
		parts = strings.Split(rel, "/")
	}

	routeParts := make([]string, 0, len(parts))
	for _, p := range parts {
		if id, err := strconv.ParseInt(p, 10, 64); err == nil && id > 0 {
			targetID = &id
			routeParts = append(routeParts, "{id}")
			continue
		}
		routeParts = append(routeParts, p)
	}

	route := strings.Join(routeParts, ".")
	if route == "" {
		route = "root"
	}
	actionCode = "api." + strings.ToLower(method) + "." + route
	targetType = httpTargetType(parts)
	meta = map[string]any{
		"method": method,
		"path":   path,
	}
	return actionCode, targetType, targetID, meta
}

func httpTargetType(parts []string) string {
	if len(parts) == 0 {
		return "api"
	}
	if len(parts) == 1 {
		return parts[0]
	}
	return parts[0] + "." + strings.TrimSuffix(parts[1], "s")
}
