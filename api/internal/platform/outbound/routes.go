package outbound

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// RegisterRoutes mounts tenant outbound webhook settings (CRM/booking/ops glue).
func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/platform/integrations/outbound-webhook", func(wr chi.Router) {
		wr.Use(auth.RequirePermission("platform.outbound_webhook", auth.AccessRead))
		wr.Get("/", getWebhook(pool))
		wr.With(auth.RequirePermission("platform.outbound_webhook", auth.AccessWrite)).Put("/", putWebhook(pool))
		wr.With(auth.RequirePermission("platform.outbound_webhook", auth.AccessWrite)).Post("/rotate-secret", rotateSecret(pool))
	})
}

type webhookDTO struct {
	TargetURL    string   `json:"target_url"`
	IsActive     bool     `json:"is_active"`
	EventFilter  []string `json:"event_filter"`
	HasSecret    bool     `json:"has_secret"`
	SecretHint   string   `json:"secret_hint,omitempty"`
	UpdatedAt    string   `json:"updated_at,omitempty"`
}

type webhookBody struct {
	TargetURL   string   `json:"target_url"`
	IsActive    *bool    `json:"is_active"`
	EventFilter []string `json:"event_filter"`
	Secret      string   `json:"signing_secret,omitempty"`
}

func getWebhook(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var urlStr, secret, updated string
		var active bool
		var filterRaw []byte
		err := pool.QueryRow(r.Context(), `
			select coalesce(target_url,''), coalesce(signing_secret,''), is_active,
			       coalesce(event_filter,'[]'::jsonb), coalesce(updated_at::text,'')
			from public.tenant_outbound_webhooks where tenant_id = $1`, tu.TenantID,
		).Scan(&urlStr, &secret, &active, &filterRaw, &updated)
		if err != nil {
			response.OK(w, webhookDTO{EventFilter: []string{}, HasSecret: false}, "OK")
			return
		}
		var filter []string
		_ = json.Unmarshal(filterRaw, &filter)
		if filter == nil {
			filter = []string{}
		}
		hint := ""
		if len(secret) >= 8 {
			hint = secret[:4] + "…" + secret[len(secret)-4:]
		}
		response.OK(w, webhookDTO{
			TargetURL: urlStr, IsActive: active, EventFilter: filter,
			HasSecret: secret != "", SecretHint: hint, UpdatedAt: updated,
		}, "OK")
	}
}

func putWebhook(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body webhookBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		target := strings.TrimSpace(body.TargetURL)
		if target != "" {
			u, err := url.Parse(target)
			if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
				response.Validation(w, map[string]string{"target_url": "Use an http(s) URL."})
				return
			}
		}
		active := false
		if body.IsActive != nil {
			active = *body.IsActive
		}
		filter := body.EventFilter
		if filter == nil {
			filter = []string{}
		}
		filterJSON, _ := json.Marshal(filter)
		secret := strings.TrimSpace(body.Secret)
		if secret == "" {
			var existing string
			_ = pool.QueryRow(r.Context(), `
				select coalesce(signing_secret,'') from public.tenant_outbound_webhooks where tenant_id = $1`,
				tu.TenantID).Scan(&existing)
			secret = existing
		}
		if active && (target == "" || secret == "") {
			response.Validation(w, map[string]string{"is_active": "Active webhooks need target_url and signing_secret."})
			return
		}
		_, err := pool.Exec(r.Context(), `
			insert into public.tenant_outbound_webhooks (
			  tenant_id, target_url, signing_secret, is_active, event_filter, updated_at, updated_by_user_id
			) values ($1,$2,$3,$4,$5::jsonb, now(), $6)
			on conflict (tenant_id) do update set
			  target_url = excluded.target_url,
			  signing_secret = excluded.signing_secret,
			  is_active = excluded.is_active,
			  event_filter = excluded.event_filter,
			  updated_at = now(),
			  updated_by_user_id = excluded.updated_by_user_id`,
			tu.TenantID, target, secret, active, string(filterJSON), tu.AppUserID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save webhook.", "ERR_INTERNAL")
			return
		}
		getWebhook(pool)(w, r)
	}
}

func rotateSecret(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		buf := make([]byte, 24)
		if _, err := rand.Read(buf); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to rotate secret.", "ERR_INTERNAL")
			return
		}
		secret := hex.EncodeToString(buf)
		_, err := pool.Exec(r.Context(), `
			insert into public.tenant_outbound_webhooks (tenant_id, signing_secret, updated_at, updated_by_user_id)
			values ($1,$2, now(), $3)
			on conflict (tenant_id) do update set
			  signing_secret = excluded.signing_secret,
			  updated_at = now(),
			  updated_by_user_id = excluded.updated_by_user_id`,
			tu.TenantID, secret, tu.AppUserID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to rotate secret.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"signing_secret": secret}, "Secret rotated. Store it now; it will not be shown again in full.")
	}
}
