package console

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

type platformAuditEntry struct {
	ActionCode         string
	EventKind          string
	HTTPMethod         string
	RoutePath          string
	PlatformCustomerID *int64
	TenantID           *int64
	TargetType         string
	TargetID           *int64
	Summary            string
	Reason             string
	ResultStatus       int
	RequestID          string
	IPAddress          string
	Metadata           map[string]any
	OldValues          any
	NewValues          any
}

func logPlatformAudit(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, e platformAuditEntry) {
	if e.EventKind == "" {
		e.EventKind = "access"
	}
	if e.ResultStatus == 0 {
		e.ResultStatus = 200
	}
	meta, _ := json.Marshal(e.Metadata)
	if meta == nil {
		meta = []byte("{}")
	}
	var oldB, newB []byte
	if e.OldValues != nil {
		oldB, _ = json.Marshal(e.OldValues)
	}
	if e.NewValues != nil {
		newB, _ = json.Marshal(e.NewValues)
	}
	var platformUserID *int64
	if tu.PlatformUserID > 0 {
		platformUserID = &tu.PlatformUserID
	}
	_, _ = pool.Exec(ctx, `
		insert into public.platform_audit_logs (
		  platform_user_id, actor_email, actor_name, action_code, event_kind,
		  http_method, route_path, platform_customer_id, tenant_id,
		  target_type, target_id, summary, reason, result_status,
		  request_id, ip_address, metadata, old_values, new_values
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb,$19::jsonb)`,
		platformUserID, tu.Email, tu.FullName, e.ActionCode, e.EventKind,
		e.HTTPMethod, e.RoutePath, e.PlatformCustomerID, e.TenantID,
		e.TargetType, e.TargetID, e.Summary, e.Reason, e.ResultStatus,
		e.RequestID, e.IPAddress, meta, nullJSON(oldB), nullJSON(newB),
	)
}

func nullJSON(b []byte) any {
	if len(b) == 0 {
		return nil
	}
	return b
}

func platformAuditMiddleware(pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rw := &statusRecorder{ResponseWriter: w, status: 200}
			next.ServeHTTP(rw, r)
			tu, ok := auth.FromContext(r.Context())
			if !ok {
				return
			}
			path := r.URL.Path
			// Skip noisy list polling of audit itself.
			if strings.Contains(path, "/platform/console/access-logs") ||
				strings.Contains(path, "/platform/console/history") {
				return
			}
			kind := "access"
			action := "platform." + strings.ToLower(r.Method) + ".read"
			if r.Method != http.MethodGet && r.Method != http.MethodHead && r.Method != http.MethodOptions {
				kind = "change"
				action = "platform." + strings.ToLower(r.Method)
			}
			if rw.status == http.StatusForbidden || rw.status == http.StatusUnauthorized {
				kind = "deny"
				action = "platform.access.denied"
			}
			summary := r.Method + " " + path
			if d := time.Since(start); d > time.Second {
				summary += " (slow)"
			}
			logPlatformAudit(r.Context(), pool, tu, platformAuditEntry{
				ActionCode:   action,
				EventKind:    kind,
				HTTPMethod:   r.Method,
				RoutePath:    path,
				Summary:      summary,
				ResultStatus: rw.status,
				RequestID:    r.Header.Get("X-Request-Id"),
				IPAddress:    r.RemoteAddr,
			})
		})
	}
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}
