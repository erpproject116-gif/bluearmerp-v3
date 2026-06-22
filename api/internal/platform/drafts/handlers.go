package drafts

import (
	"encoding/json"
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

var (
	entityTypePattern = regexp.MustCompile(`^[a-z][a-z0-9_]{0,63}$`)
	draftKeyPattern   = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$`)
)

type upsertBody struct {
	DraftKey string          `json:"draft_key"`
	Payload  json.RawMessage `json:"payload"`
}

type draftResponse struct {
	DraftKey string          `json:"draft_key"`
	Payload  json.RawMessage `json:"payload"`
	SavedAt  time.Time       `json:"saved_at"`
}

func entityTypeFromRequest(r *http.Request) (string, bool) {
	t := strings.TrimSpace(chi.URLParam(r, "entity_type"))
	if !entityTypePattern.MatchString(t) {
		return "", false
	}
	return t, true
}

func draftKeyFromQuery(r *http.Request) (string, bool) {
	k := strings.TrimSpace(r.URL.Query().Get("draft_key"))
	if !draftKeyPattern.MatchString(k) {
		return "", false
	}
	return k, true
}

func upsertDraftHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		entityType, ok := entityTypeFromRequest(r)
		if !ok {
			response.Validation(w, map[string]string{"entity_type": "Invalid entity type."})
			return
		}

		var body upsertBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		draftKey := strings.TrimSpace(body.DraftKey)
		if !draftKeyPattern.MatchString(draftKey) {
			response.Validation(w, map[string]string{"draft_key": "Invalid draft key."})
			return
		}
		if len(body.Payload) == 0 {
			body.Payload = json.RawMessage(`{}`)
		} else if !json.Valid(body.Payload) {
			response.Validation(w, map[string]string{"payload": "Payload must be valid JSON."})
			return
		}

		var savedAt time.Time
		err := pool.QueryRow(r.Context(), `
			insert into public.document_drafts
			  (tenant_id, user_id, entity_type, draft_key, payload, saved_at)
			values ($1, $2, $3, $4, $5, now())
			on conflict (tenant_id, user_id, entity_type, draft_key)
			do update set payload = excluded.payload, saved_at = now()
			returning saved_at`,
			tu.TenantID, tu.AppUserID, entityType, draftKey, body.Payload).Scan(&savedAt)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save draft.", "ERR_INTERNAL")
			return
		}

		response.OK(w, draftResponse{
			DraftKey: draftKey,
			Payload:  body.Payload,
			SavedAt:  savedAt,
		}, "Draft saved.")
	}
}

func getDraftHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		entityType, ok := entityTypeFromRequest(r)
		if !ok {
			response.Validation(w, map[string]string{"entity_type": "Invalid entity type."})
			return
		}
		draftKey, ok := draftKeyFromQuery(r)
		if !ok {
			response.Validation(w, map[string]string{"draft_key": "Draft key is required."})
			return
		}

		var payload json.RawMessage
		var savedAt time.Time
		err := pool.QueryRow(r.Context(), `
			select payload, saved_at
			from public.document_drafts
			where tenant_id = $1 and user_id = $2 and entity_type = $3 and draft_key = $4`,
			tu.TenantID, tu.AppUserID, entityType, draftKey).Scan(&payload, &savedAt)
		if err != nil {
			if err == pgx.ErrNoRows {
				response.OK(w, map[string]any{"draft": nil}, "No draft.")
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to load draft.", "ERR_INTERNAL")
			return
		}

		response.OK(w, map[string]any{
			"draft": draftResponse{
				DraftKey: draftKey,
				Payload:  payload,
				SavedAt:  savedAt,
			},
		}, "OK")
	}
}

func deleteDraftHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		entityType, ok := entityTypeFromRequest(r)
		if !ok {
			response.Validation(w, map[string]string{"entity_type": "Invalid entity type."})
			return
		}
		draftKey, ok := draftKeyFromQuery(r)
		if !ok {
			response.Validation(w, map[string]string{"draft_key": "Draft key is required."})
			return
		}

		_, err := pool.Exec(r.Context(), `
			delete from public.document_drafts
			where tenant_id = $1 and user_id = $2 and entity_type = $3 and draft_key = $4`,
			tu.TenantID, tu.AppUserID, entityType, draftKey)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to delete draft.", "ERR_INTERNAL")
			return
		}

		response.OK(w, map[string]any{"deleted": true}, "Draft deleted.")
	}
}
