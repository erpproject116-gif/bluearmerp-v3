package presence

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const defaultStaleSeconds = 120

type heartbeatBody struct {
	CurrentPath  string `json:"current_path"`
	CurrentLabel string `json:"current_label"`
	Activity     string `json:"activity"`
	AvatarURL    string `json:"avatar_url"`
}

type onlineRow struct {
	UserID       int64     `json:"user_id"`
	FullName     string    `json:"full_name"`
	Email        string    `json:"email"`
	AvatarURL    *string   `json:"avatar_url"`
	CurrentPath  string    `json:"current_path"`
	CurrentLabel string    `json:"current_label"`
	Activity     string    `json:"activity"`
	LastSeenAt   time.Time `json:"last_seen_at"`
	IsSelf       bool      `json:"is_self"`
}

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/presence", func(pr chi.Router) {
		pr.Post("/heartbeat", heartbeatHandler(pool))
		pr.Get("/online", onlineHandler(pool))
		pr.Delete("/", leaveHandler(pool))
	})
}

func heartbeatHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}

		var body heartbeatBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}

		path := strings.TrimSpace(body.CurrentPath)
		if path == "" {
			path = "/app"
		}
		if len(path) > 512 {
			path = path[:512]
		}

		label := strings.TrimSpace(body.CurrentLabel)
		if label == "" {
			label = "Dashboard"
		}
		if len(label) > 255 {
			label = label[:255]
		}

		activity := strings.TrimSpace(body.Activity)
		if activity == "" {
			activity = "viewing"
		}
		if len(activity) > 50 {
			activity = activity[:50]
		}

		avatarURL := strings.TrimSpace(body.AvatarURL)
		if len(avatarURL) > 2048 {
			avatarURL = avatarURL[:2048]
		}

		ctx := r.Context()
		if avatarURL != "" {
			_, _ = pool.Exec(ctx, `
				update public.users
				set avatar_url = $1, updated_at = now()
				where id = $2 and tenant_id = $3`,
				avatarURL, tu.AppUserID, tu.TenantID)
		}

		_, err := pool.Exec(ctx, `
			insert into public.tenant_user_presence
			  (tenant_id, user_id, current_path, current_label, activity, last_seen_at)
			values ($1, $2, $3, $4, $5, now())
			on conflict (tenant_id, user_id) do update
			set current_path = excluded.current_path,
			    current_label = excluded.current_label,
			    activity = excluded.activity,
			    last_seen_at = now()`,
			tu.TenantID, tu.AppUserID, path, label, activity)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update presence.", "ERR_INTERNAL")
			return
		}

		response.OK(w, map[string]string{"status": "ok"}, "OK")
	}
}

func onlineHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}

		staleSec := defaultStaleSeconds
		if raw := strings.TrimSpace(r.URL.Query().Get("stale_seconds")); raw != "" {
			if n, err := strconv.Atoi(raw); err == nil && n >= 30 && n <= 600 {
				staleSec = n
			}
		}

		rows, err := pool.Query(r.Context(), `
			select u.id, u.full_name, u.email, u.avatar_url,
			       p.current_path, p.current_label, p.activity, p.last_seen_at
			from public.tenant_user_presence p
			join public.users u on u.id = p.user_id and u.tenant_id = p.tenant_id
			where p.tenant_id = $1
			  and u.status = 'active'
			  and p.last_seen_at >= now() - ($2::int * interval '1 second')
			order by p.last_seen_at desc`,
			tu.TenantID, staleSec)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load presence.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []onlineRow
		for rows.Next() {
			var row onlineRow
			if err := rows.Scan(
				&row.UserID, &row.FullName, &row.Email, &row.AvatarURL,
				&row.CurrentPath, &row.CurrentLabel, &row.Activity, &row.LastSeenAt,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load presence.", "ERR_INTERNAL")
				return
			}
			row.IsSelf = row.UserID == tu.AppUserID
			out = append(out, row)
		}
		if out == nil {
			out = []onlineRow{}
		}

		response.OK(w, out, "OK")
	}
}

func leaveHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		_, _ = pool.Exec(r.Context(), `
			delete from public.tenant_user_presence
			where tenant_id = $1 and user_id = $2`,
			tu.TenantID, tu.AppUserID)
		response.OK(w, nil, "OK")
	}
}

// PurgeStale removes presence rows older than the given duration (maintenance helper).
func PurgeStale(ctx context.Context, pool *pgxpool.Pool, olderThan time.Duration) error {
	_, err := pool.Exec(ctx, `
		delete from public.tenant_user_presence
		where last_seen_at < now() - $1::interval`,
		olderThan.String())
	return err
}
