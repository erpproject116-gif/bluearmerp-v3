package auth

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type pushSubBody struct {
	Endpoint string `json:"endpoint"`
	P256dh   string `json:"keys.p256dh"`
	Auth     string `json:"keys.auth"`
	// Nested keys from PushSubscription.toJSON()
	Keys *struct {
		P256dh string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
	UserAgent string `json:"user_agent"`
}

// RegisterPushRoutes mounts Web Push subscription endpoints (Epic F2).
func RegisterPushRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Post("/auth/push-subscriptions", upsertPushSubscription(pool))
	r.Delete("/auth/push-subscriptions", deletePushSubscription(pool))
}

func upsertPushSubscription(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		var body pushSubBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON.", "ERR_VALIDATION")
			return
		}
		endpoint := strings.TrimSpace(body.Endpoint)
		p256 := strings.TrimSpace(body.P256dh)
		authK := strings.TrimSpace(body.Auth)
		if body.Keys != nil {
			if p256 == "" {
				p256 = strings.TrimSpace(body.Keys.P256dh)
			}
			if authK == "" {
				authK = strings.TrimSpace(body.Keys.Auth)
			}
		}
		if endpoint == "" || p256 == "" || authK == "" {
			response.Validation(w, map[string]string{"endpoint": "endpoint and keys are required."})
			return
		}
		_, err := pool.Exec(r.Context(), `
			insert into public.user_push_subscriptions (tenant_id, user_id, endpoint, p256dh, auth, user_agent, updated_at)
			values ($1, $2, $3, $4, $5, $6, now())
			on conflict (user_id, endpoint) do update
			set p256dh = excluded.p256dh, auth = excluded.auth,
			    user_agent = excluded.user_agent, updated_at = now(), tenant_id = excluded.tenant_id`,
			tu.TenantID, tu.AppUserID, endpoint, p256, authK, strings.TrimSpace(body.UserAgent))
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save subscription.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"saved": true}, "Push subscription saved.")
	}
}

func deletePushSubscription(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		var body struct {
			Endpoint string `json:"endpoint"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		endpoint := strings.TrimSpace(body.Endpoint)
		if endpoint == "" {
			response.Validation(w, map[string]string{"endpoint": "endpoint is required."})
			return
		}
		_, _ = pool.Exec(r.Context(), `
			delete from public.user_push_subscriptions
			where user_id = $1 and endpoint = $2`, tu.AppUserID, endpoint)
		response.OK(w, map[string]any{"deleted": true}, "Push subscription removed.")
	}
}
