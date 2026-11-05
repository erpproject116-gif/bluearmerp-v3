package hr

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func registerManpowerModeRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/manpower-mode", getManpowerMode(pool))
	r.With(auth.RequirePermission("hr.employees", auth.AccessWrite)).Patch("/manpower-mode", patchManpowerMode(pool))
}

func getManpowerMode(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		on, err := loadManpowerMode(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load manpower mode.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"manpower_mode": on}, "OK")
	}
}

func patchManpowerMode(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		var body struct {
			ManpowerMode *bool `json:"manpower_mode"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ManpowerMode == nil {
			response.Validation(w, map[string]string{"manpower_mode": "Choose on or off."})
			return
		}
		_, err := pool.Exec(r.Context(), `
			insert into public.hr_tenant_settings (tenant_id, manpower_mode)
			values ($1, $2)
			on conflict (tenant_id) do update
			set manpower_mode = excluded.manpower_mode, updated_at = now()`, tu.TenantID, *body.ManpowerMode)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save manpower mode.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"manpower_mode": *body.ManpowerMode}, "Saved.")
	}
}

func loadManpowerMode(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (bool, error) {
	var on bool
	err := pool.QueryRow(ctx, `select manpower_mode from public.hr_tenant_settings where tenant_id = $1`, tenantID).Scan(&on)
	if errors.Is(err, pgx.ErrNoRows) {
		return true, nil
	}
	return on, err
}
