package processpolicy

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// RegisterRoutes mounts process policy settings under /settings/process-policies.
func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/settings/process-policies", func(sr chi.Router) {
		sr.With(auth.RequirePermission("settings.process_policies", auth.AccessRead)).Get("/", getPolicy(pool))
		sr.With(auth.RequirePermission("settings.process_policies", auth.AccessWrite)).Patch("/", patchPolicy(pool))
	})
}

func getPolicy(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		p, err := Load(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load process policies.", "ERR_INTERNAL")
			return
		}
		tu2, _ := auth.FromContext(r.Context())
		canManage := tu2.HasPermission("settings.process_policies", auth.AccessWrite) ||
			tu2.IsStoreAdmin || tu2.IsTenantOwner || tu2.IsPlatformSuperadmin
		response.OK(w, map[string]any{
			"policy":     p,
			"can_manage": canManage,
		}, "OK")
	}
}

func patchPolicy(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		var patch Patch
		if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		before, _ := Load(r.Context(), pool, tu.TenantID)
		after, err := Update(r.Context(), pool, tu.TenantID, tu.AppUserID, patch)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save process policies.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "settings.process_policies.update", "tenant_process_policies", &tu.TenantID, before, after)
		response.OK(w, after, "Saved.")
	}
}
