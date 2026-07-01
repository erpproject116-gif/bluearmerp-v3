package usermgmt

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type UserDataScope struct {
	ScopeType string `json:"scope_type"`
	RecordID  int64  `json:"record_id"`
}

func registerUserDataScopeRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("user_management.user_permissions", auth.AccessRead)).Get("/users/{id}/data-scopes", listUserDataScopes(pool))
	r.With(auth.RequirePermission("user_management.user_permissions", auth.AccessWrite)).Put("/users/{id}/data-scopes", putUserDataScopes(pool))
}

func listUserDataScopes(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		userID, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		rows, err := pool.Query(r.Context(), `
			select scope_type, record_id from public.user_data_scopes
			where tenant_id = $1 and user_id = $2 order by scope_type, record_id`,
			tu.TenantID, userID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load scopes.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []UserDataScope
		for rows.Next() {
			var s UserDataScope
			if err := rows.Scan(&s.ScopeType, &s.RecordID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read scopes.", "ERR_INTERNAL")
				return
			}
			out = append(out, s)
		}
		if out == nil {
			out = []UserDataScope{}
		}
		response.OK(w, out, "OK")
	}
}

func putUserDataScopes(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		userID, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		var body struct {
			Scopes []UserDataScope `json:"scopes"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save scopes.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		_, _ = tx.Exec(r.Context(), `delete from public.user_data_scopes where tenant_id=$1 and user_id=$2`, tu.TenantID, userID)
		for _, s := range body.Scopes {
			_, err = tx.Exec(r.Context(), `
				insert into public.user_data_scopes (tenant_id, user_id, scope_type, record_id)
				values ($1,$2,$3,$4)`, tu.TenantID, userID, s.ScopeType, s.RecordID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to save scope.", "ERR_INTERNAL")
				return
			}
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save scopes.", "ERR_INTERNAL")
			return
		}
		response.OK(w, body.Scopes, "Saved.")
	}
}
