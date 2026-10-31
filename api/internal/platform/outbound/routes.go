package outbound

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strconv"
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
		wr.Get("/", listEndpoints(pool))
		wr.Get("/deliveries", listDeliveries(pool))
		wr.With(auth.RequirePermission("platform.outbound_webhook", auth.AccessWrite)).Post("/", createEndpoint(pool))
		wr.With(auth.RequirePermission("platform.outbound_webhook", auth.AccessWrite)).Put("/{id}", putEndpoint(pool))
		wr.With(auth.RequirePermission("platform.outbound_webhook", auth.AccessWrite)).Delete("/{id}", deleteEndpoint(pool))
		wr.With(auth.RequirePermission("platform.outbound_webhook", auth.AccessWrite)).Post("/{id}/rotate-secret", rotateSecret(pool))
	})
}

type endpointDTO struct {
	ID          int64    `json:"id"`
	Label       string   `json:"label"`
	TargetURL   string   `json:"target_url"`
	IsActive    bool     `json:"is_active"`
	EventFilter []string `json:"event_filter"`
	HasSecret   bool     `json:"has_secret"`
	SecretHint  string   `json:"secret_hint,omitempty"`
	UpdatedAt   string   `json:"updated_at,omitempty"`
}

type endpointBody struct {
	Label       string   `json:"label"`
	TargetURL   string   `json:"target_url"`
	IsActive    *bool    `json:"is_active"`
	EventFilter []string `json:"event_filter"`
	Secret      string   `json:"signing_secret,omitempty"`
}

func listEndpoints(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, coalesce(label,''), coalesce(target_url,''), is_active,
			       coalesce(event_filter,'[]'::jsonb), coalesce(signing_secret,''),
			       coalesce(updated_at::text,'')
			from public.tenant_outbound_webhook_endpoints
			where tenant_id = $1
			order by id`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list endpoints.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := make([]endpointDTO, 0)
		for rows.Next() {
			var d endpointDTO
			var secret string
			var filterRaw []byte
			if err := rows.Scan(&d.ID, &d.Label, &d.TargetURL, &d.IsActive, &filterRaw, &secret, &d.UpdatedAt); err != nil {
				continue
			}
			_ = json.Unmarshal(filterRaw, &d.EventFilter)
			if d.EventFilter == nil {
				d.EventFilter = []string{}
			}
			d.HasSecret = secret != ""
			if len(secret) >= 8 {
				d.SecretHint = secret[:4] + "…" + secret[len(secret)-4:]
			}
			out = append(out, d)
		}
		response.OK(w, map[string]any{"endpoints": out}, "OK")
	}
}

func createEndpoint(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body endpointBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		target := strings.TrimSpace(body.TargetURL)
		if target != "" {
			if err := ValidateTargetURL(target); err != nil {
				response.Validation(w, map[string]string{"target_url": "Use a public http(s) URL (localhost and private addresses are blocked)."})
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
		label := strings.TrimSpace(body.Label)
		if label == "" {
			label = "Endpoint"
		}
		secret := strings.TrimSpace(body.Secret)
		if active && (target == "" || secret == "") {
			response.Validation(w, map[string]string{"is_active": "Active webhooks need target_url and signing_secret."})
			return
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.tenant_outbound_webhook_endpoints (
			  tenant_id, label, target_url, signing_secret, is_active, event_filter, updated_at, updated_by_user_id
			) values ($1,$2,$3,$4,$5,$6::jsonb, now(), $7)
			returning id`,
			tu.TenantID, label, target, secret, active, string(filterJSON), tu.AppUserID,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create endpoint.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Created.")
	}
}

func putEndpoint(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body endpointBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		target := strings.TrimSpace(body.TargetURL)
		if target != "" {
			if err := ValidateTargetURL(target); err != nil {
				response.Validation(w, map[string]string{"target_url": "Use a public http(s) URL (localhost and private addresses are blocked)."})
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
		label := strings.TrimSpace(body.Label)
		secret := strings.TrimSpace(body.Secret)
		if secret == "" {
			var existing string
			_ = pool.QueryRow(r.Context(), `
				select coalesce(signing_secret,'') from public.tenant_outbound_webhook_endpoints
				where id = $1 and tenant_id = $2`, id, tu.TenantID).Scan(&existing)
			secret = existing
		}
		if active && (target == "" || secret == "") {
			response.Validation(w, map[string]string{"is_active": "Active webhooks need target_url and signing_secret."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.tenant_outbound_webhook_endpoints set
			  label = case when $3 = '' then label else $3 end,
			  target_url = $4,
			  signing_secret = $5,
			  is_active = $6,
			  event_filter = $7::jsonb,
			  updated_at = now(),
			  updated_by_user_id = $8
			where id = $1 and tenant_id = $2`,
			id, tu.TenantID, label, target, secret, active, string(filterJSON), tu.AppUserID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save endpoint.", "ERR_INTERNAL")
			return
		}
		if tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Endpoint not found.", "ERR_NOT_FOUND")
			return
		}
		listEndpoints(pool)(w, r)
	}
}

func deleteEndpoint(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			delete from public.tenant_outbound_webhook_endpoints where id = $1 and tenant_id = $2`,
			id, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to delete endpoint.", "ERR_INTERNAL")
			return
		}
		if tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Endpoint not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"deleted": id}, "Deleted.")
	}
}

type deliveryDTO struct {
	ID            int64  `json:"id"`
	EndpointID    *int64 `json:"endpoint_id,omitempty"`
	Event         string `json:"event"`
	Status        string `json:"status"`
	Attempts      int    `json:"attempts"`
	LastError     string `json:"last_error,omitempty"`
	NextAttemptAt string `json:"next_attempt_at,omitempty"`
	CreatedAt     string `json:"created_at"`
	DeliveredAt   string `json:"delivered_at,omitempty"`
}

func listDeliveries(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, endpoint_id, event, status, attempts, coalesce(last_error,''),
			       coalesce(next_attempt_at::text,''), coalesce(created_at::text,''),
			       coalesce(delivered_at::text,'')
			from public.tenant_outbound_webhook_deliveries
			where tenant_id = $1
			order by id desc
			limit 50`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list deliveries.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := make([]deliveryDTO, 0, 16)
		for rows.Next() {
			var d deliveryDTO
			var delivered string
			if err := rows.Scan(&d.ID, &d.EndpointID, &d.Event, &d.Status, &d.Attempts, &d.LastError,
				&d.NextAttemptAt, &d.CreatedAt, &delivered); err != nil {
				continue
			}
			d.DeliveredAt = delivered
			out = append(out, d)
		}
		response.OK(w, map[string]any{"items": out}, "OK")
	}
}

func rotateSecret(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		buf := make([]byte, 24)
		if _, err := rand.Read(buf); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to rotate secret.", "ERR_INTERNAL")
			return
		}
		secret := hex.EncodeToString(buf)
		tag, err := pool.Exec(r.Context(), `
			update public.tenant_outbound_webhook_endpoints
			set signing_secret = $3, updated_at = now(), updated_by_user_id = $4
			where id = $1 and tenant_id = $2`,
			id, tu.TenantID, secret, tu.AppUserID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to rotate secret.", "ERR_INTERNAL")
			return
		}
		if tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Endpoint not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id, "signing_secret": secret}, "Secret rotated. Store it now; it will not be shown again in full.")
	}
}
