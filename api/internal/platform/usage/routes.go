package usage

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

var uuidRE = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// Heartbeat grace: sessions without a heartbeat older than this are marked abandoned.
const abandonAfter = 3 * time.Minute

type startBody struct {
	ClientSessionID string `json:"client_session_id"`
	UserAgent       string `json:"user_agent"`
	Path            string `json:"path"`
	PathPattern     string `json:"path_pattern"`
	PageLabel       string `json:"page_label"`
	ClientVisitID   string `json:"client_visit_id"`
}

type pageEvent struct {
	ClientVisitID string `json:"client_visit_id"`
	Seq           int    `json:"seq"`
	Path          string `json:"path"`
	PathPattern   string `json:"path_pattern"`
	PageLabel     string `json:"page_label"`
	EnteredAt     string `json:"entered_at"`
	ExitedAt      string `json:"exited_at"`
	ActiveSeconds int    `json:"active_seconds"`
	IdleSeconds   int    `json:"idle_seconds"`
}

type eventsBody struct {
	ClientSessionID string      `json:"client_session_id"`
	LastActivityAt  string      `json:"last_activity_at"`
	ActiveDelta     int         `json:"active_delta"`
	IdleDelta       int         `json:"idle_delta"`
	Pages           []pageEvent `json:"pages"`
}

type endBody struct {
	ClientSessionID string `json:"client_session_id"`
	Reason          string `json:"reason"` // logout | idle_timeout | tab_closed | unknown
	ActiveDelta     int    `json:"active_delta"`
	IdleDelta       int    `json:"idle_delta"`
}

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/usage", func(ur chi.Router) {
		ur.Post("/session/start", startSession(pool))
		ur.Post("/events", ingestEvents(pool))
		ur.Post("/session/end", endSession(pool))
	})
}

func startSession(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok || tu.TenantID <= 0 || tu.AppUserID <= 0 {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		var body startBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		sid, err := parseUUID(body.ClientSessionID)
		if err != nil {
			response.Validation(w, map[string]string{"client_session_id": "Valid UUID required."})
			return
		}
		ua := strings.TrimSpace(body.UserAgent)
		if len(ua) > 512 {
			ua = ua[:512]
		}
		var authUID *string
		if tu.AuthUserID != "" {
			authUID = &tu.AuthUserID
		}
		var sessionID int64
		err = pool.QueryRow(r.Context(), `
			insert into public.app_usage_sessions
			  (tenant_id, user_id, auth_user_id, client_session_id, user_agent)
			values ($1,$2,$3::uuid,$4::uuid,$5)
			on conflict (client_session_id) do update
			set last_heartbeat_at = now(),
			    last_activity_at = now(),
			    ended_at = null,
			    end_reason = null
			returning id`,
			tu.TenantID, tu.AppUserID, authUID, sid, nullIfEmpty(ua),
		).Scan(&sessionID)
		if err != nil {
			log.Printf("usage: start session: %v", err)
			response.Err(w, http.StatusInternalServerError, "Failed to start usage session.", "ERR_INTERNAL")
			return
		}

		if body.ClientVisitID != "" && body.Path != "" {
			vid, vErr := parseUUID(body.ClientVisitID)
			if vErr == nil {
				path, pattern, label := sanitizePath(body.Path, body.PathPattern, body.PageLabel)
				_, _ = pool.Exec(r.Context(), `
					insert into public.app_usage_page_visits
					  (session_id, tenant_id, user_id, client_visit_id, seq, route_path, route_pattern, page_label)
					values ($1,$2,$3,$4::uuid,1,$5,$6,$7)
					on conflict (client_visit_id) do nothing`,
					sessionID, tu.TenantID, tu.AppUserID, vid, path, pattern, label)
				_, _ = pool.Exec(r.Context(), `
					update public.app_usage_sessions set page_view_count = greatest(page_view_count, 1)
					where id = $1`, sessionID)
			}
		}

		response.OK(w, map[string]any{"session_id": sessionID, "client_session_id": sid}, "OK")
	}
}

func ingestEvents(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok || tu.TenantID <= 0 || tu.AppUserID <= 0 {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		var body eventsBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		sid, err := parseUUID(body.ClientSessionID)
		if err != nil {
			response.Validation(w, map[string]string{"client_session_id": "Valid UUID required."})
			return
		}
		sessionID, err := resolveOpenSession(r.Context(), pool, tu, sid)
		if err != nil {
			if err == pgx.ErrNoRows {
				response.Err(w, http.StatusNotFound, "Usage session not found.", "ERR_NOT_FOUND")
				return
			}
			log.Printf("usage: resolve session: %v", err)
			response.Err(w, http.StatusInternalServerError, "Failed to update usage.", "ERR_INTERNAL")
			return
		}

		activeDelta := clampNonNeg(body.ActiveDelta)
		idleDelta := clampNonNeg(body.IdleDelta)
		lastAct := parseTimeOrNow(body.LastActivityAt)

		_, err = pool.Exec(r.Context(), `
			update public.app_usage_sessions set
			  last_heartbeat_at = now(),
			  last_activity_at = greatest(last_activity_at, $2),
			  active_seconds = active_seconds + $3,
			  idle_seconds = idle_seconds + $4
			where id = $1`, sessionID, lastAct, activeDelta, idleDelta)
		if err != nil {
			log.Printf("usage: heartbeat session %d: %v", sessionID, err)
			response.Err(w, http.StatusInternalServerError, "Failed to update usage.", "ERR_INTERNAL")
			return
		}

		maxSeq := 0
		for _, p := range body.Pages {
			vid, vErr := parseUUID(p.ClientVisitID)
			if vErr != nil || p.Path == "" {
				continue
			}
			seq := p.Seq
			if seq < 1 {
				seq = 1
			}
			if seq > maxSeq {
				maxSeq = seq
			}
			path, pattern, label := sanitizePath(p.Path, p.PathPattern, p.PageLabel)
			entered := parseTimeOrNow(p.EnteredAt)
			var exited any
			if strings.TrimSpace(p.ExitedAt) != "" {
				exited = parseTimeOrNow(p.ExitedAt)
			}
			_, err = pool.Exec(r.Context(), `
				insert into public.app_usage_page_visits
				  (session_id, tenant_id, user_id, client_visit_id, seq,
				   route_path, route_pattern, page_label, entered_at, exited_at,
				   active_seconds, idle_seconds)
				values ($1,$2,$3,$4::uuid,$5,$6,$7,$8,$9,$10,$11,$12)
				on conflict (client_visit_id) do update set
				  exited_at = coalesce(excluded.exited_at, app_usage_page_visits.exited_at),
				  active_seconds = greatest(app_usage_page_visits.active_seconds, excluded.active_seconds),
				  idle_seconds = greatest(app_usage_page_visits.idle_seconds, excluded.idle_seconds),
				  page_label = case when excluded.page_label <> '' then excluded.page_label else app_usage_page_visits.page_label end`,
				sessionID, tu.TenantID, tu.AppUserID, vid, seq,
				path, pattern, label, entered, exited,
				clampNonNeg(p.ActiveSeconds), clampNonNeg(p.IdleSeconds),
			)
			if err != nil {
				log.Printf("usage: upsert page visit: %v", err)
			}
		}
		if maxSeq > 0 {
			_, _ = pool.Exec(r.Context(), `
				update public.app_usage_sessions
				set page_view_count = greatest(page_view_count, $2)
				where id = $1`, sessionID, maxSeq)
		}

		response.OK(w, map[string]any{"ok": true}, "OK")
	}
}

func endSession(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok || tu.TenantID <= 0 || tu.AppUserID <= 0 {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		var body endBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		sid, err := parseUUID(body.ClientSessionID)
		if err != nil {
			response.Validation(w, map[string]string{"client_session_id": "Valid UUID required."})
			return
		}
		reason := normalizeEndReason(body.Reason)
		sessionID, err := resolveOpenSession(r.Context(), pool, tu, sid)
		if err == pgx.ErrNoRows {
			// Already ended or never started — idempotent success.
			response.OK(w, map[string]any{"ended": false}, "OK")
			return
		}
		if err != nil {
			log.Printf("usage: end resolve: %v", err)
			response.Err(w, http.StatusInternalServerError, "Failed to end usage session.", "ERR_INTERNAL")
			return
		}

		_, err = pool.Exec(r.Context(), `
			update public.app_usage_sessions set
			  ended_at = coalesce(ended_at, now()),
			  end_reason = coalesce(nullif(end_reason,''), $2),
			  last_heartbeat_at = now(),
			  last_activity_at = now(),
			  active_seconds = active_seconds + $3,
			  idle_seconds = idle_seconds + $4
			where id = $1`,
			sessionID, reason, clampNonNeg(body.ActiveDelta), clampNonNeg(body.IdleDelta))
		if err != nil {
			log.Printf("usage: end session %d: %v", sessionID, err)
			response.Err(w, http.StatusInternalServerError, "Failed to end usage session.", "ERR_INTERNAL")
			return
		}
		_, _ = pool.Exec(r.Context(), `
			update public.app_usage_page_visits
			set exited_at = coalesce(exited_at, now())
			where session_id = $1 and exited_at is null`, sessionID)

		bumpDaily(r.Context(), pool, sessionID)
		response.OK(w, map[string]any{"ended": true}, "OK")
	}
}

func resolveOpenSession(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, clientSID string) (int64, error) {
	var id int64
	err := pool.QueryRow(ctx, `
		select id from public.app_usage_sessions
		where client_session_id = $1::uuid
		  and tenant_id = $2 and user_id = $3
		  and ended_at is null`,
		clientSID, tu.TenantID, tu.AppUserID).Scan(&id)
	return id, err
}

// FinalizeAbandoned closes sessions that stopped heartbeating (browser crash / sleep / network loss).
func FinalizeAbandoned(ctx context.Context, pool *pgxpool.Pool) (int64, error) {
	tag, err := pool.Exec(ctx, `
		update public.app_usage_sessions
		set ended_at = last_heartbeat_at,
		    end_reason = 'expired'
		where ended_at is null
		  and last_heartbeat_at < now() - $1::interval`,
		abandonAfter.String())
	if err != nil {
		return 0, err
	}
	n := tag.RowsAffected()
	if n > 0 {
		_, _ = pool.Exec(ctx, `
			update public.app_usage_page_visits v
			set exited_at = coalesce(v.exited_at, s.last_heartbeat_at)
			from public.app_usage_sessions s
			where v.session_id = s.id
			  and v.exited_at is null
			  and s.end_reason = 'expired'
			  and s.ended_at is not null
			  and s.ended_at > now() - interval '10 minutes'`)
	}
	return n, nil
}

func bumpDaily(ctx context.Context, pool *pgxpool.Pool, sessionID int64) {
	_, err := pool.Exec(ctx, `
		insert into public.app_usage_daily (day, tenant_id, sessions, page_views, active_seconds, idle_seconds, unique_users)
		select (s.started_at at time zone 'UTC')::date,
		       s.tenant_id,
		       1,
		       s.page_view_count,
		       s.active_seconds,
		       s.idle_seconds,
		       1
		from public.app_usage_sessions s
		where s.id = $1
		on conflict (day, tenant_id) do update set
		  sessions = app_usage_daily.sessions + 1,
		  page_views = app_usage_daily.page_views + excluded.page_views,
		  active_seconds = app_usage_daily.active_seconds + excluded.active_seconds,
		  idle_seconds = app_usage_daily.idle_seconds + excluded.idle_seconds`,
		sessionID)
	if err != nil {
		log.Printf("usage: daily rollup session %d: %v", sessionID, err)
	}
}

func parseUUID(s string) (string, error) {
	s = strings.TrimSpace(s)
	if !uuidRE.MatchString(s) {
		return "", errInvalidUUID
	}
	return strings.ToLower(s), nil
}

var errInvalidUUID = errString("invalid uuid")

type errString string

func (e errString) Error() string { return string(e) }

func parseTimeOrNow(s string) time.Time {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Now().UTC()
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.UTC()
	}
	if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
		return t.UTC()
	}
	return time.Now().UTC()
}

func sanitizePath(path, pattern, label string) (string, string, string) {
	path = strings.TrimSpace(path)
	if path == "" {
		path = "/app"
	}
	if len(path) > 512 {
		path = path[:512]
	}
	pattern = strings.TrimSpace(pattern)
	if pattern == "" {
		pattern = normalizeRoutePattern(path)
	}
	if len(pattern) > 512 {
		pattern = pattern[:512]
	}
	label = strings.TrimSpace(label)
	if label == "" {
		label = "App"
	}
	if len(label) > 255 {
		label = label[:255]
	}
	return path, pattern, label
}

// normalizeRoutePattern replaces numeric path segments with :id for aggregation.
func normalizeRoutePattern(path string) string {
	parts := strings.Split(path, "/")
	for i, p := range parts {
		if p == "" {
			continue
		}
		allDigit := true
		for _, c := range p {
			if c < '0' || c > '9' {
				allDigit = false
				break
			}
		}
		if allDigit {
			parts[i] = ":id"
		}
	}
	out := strings.Join(parts, "/")
	if out == "" {
		return "/"
	}
	return out
}

func normalizeEndReason(r string) string {
	switch strings.ToLower(strings.TrimSpace(r)) {
	case "logout", "idle_timeout", "tab_closed", "expired", "unknown":
		return strings.ToLower(strings.TrimSpace(r))
	default:
		return "unknown"
	}
}

func clampNonNeg(n int) int {
	if n < 0 {
		return 0
	}
	if n > 86400 {
		return 86400
	}
	return n
}

func nullIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
