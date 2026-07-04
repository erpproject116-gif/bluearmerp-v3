package demodata

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// RegisterRoutes mounts demo data management under /settings/demo-data.
func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/settings/demo-data", func(sr chi.Router) {
		sr.With(auth.RequirePermission("settings.demo_data", auth.AccessRead)).Get("/", getStatus(pool))
		sr.With(auth.RequirePermission("settings.demo_data", auth.AccessWrite)).Post("/purge", postPurge(pool))
		sr.With(auth.RequirePermission("settings.demo_data", auth.AccessWrite)).Post("/populate", postPopulate(pool))
	})
}

func getStatus(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		canManage := tu.HasPermission("settings.demo_data", auth.AccessWrite) ||
			tu.IsPlatformSuperadmin || tu.IsTenantOwner
		payload, err := loadStatus(r.Context(), pool, tu.TenantID, canManage)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load demo data status.", "ERR_INTERNAL")
			return
		}
		response.OK(w, payload, "OK")
	}
}

type populateRequest struct {
	PurgeFirst    bool   `json:"purge_first"`
	IncludeVerify bool   `json:"include_verify"`
	Industry      string `json:"industry"`
}

func postPopulate(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		code, industry, err := assertDemoTenant(r.Context(), pool, tu.TenantID, tu.IsPlatformSuperadmin)
		if err != nil {
			if errors.Is(err, errNotDemoTenant) {
				response.Err(w, http.StatusForbidden,
					"Demo populate is only available on demo tenants.",
					"ERR_FORBIDDEN")
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to verify tenant.", "ERR_INTERNAL")
			return
		}

		var body populateRequest
		if r.Body != nil && r.ContentLength != 0 {
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				response.Validation(w, map[string]string{"body": "Invalid JSON."})
				return
			}
		}
		if !body.IncludeVerify {
			body.IncludeVerify = true
		}
		// Superadmins may override the seed template; everyone else uses the tenant's own.
		if tu.IsPlatformSuperadmin && body.Industry != "" {
			industry = body.Industry
		}

		steps := make([]StepResult, 0, len(PopulateScripts)+3)
		if body.PurgeFirst {
			purgeSteps, err := runPurge(r.Context(), pool, industry, tu.TenantID)
			steps = append(steps, purgeSteps...)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, err.Error(), "ERR_INTERNAL")
				return
			}
			if len(purgeSteps) > 0 && !purgeSteps[0].OK {
				response.OK(w, map[string]any{"steps": steps, "company_code": code}, "Purge failed.")
				return
			}
		}

		popSteps, err := runPopulate(r.Context(), pool, industry, tu.TenantID, body.IncludeVerify, false)
		steps = append(steps, popSteps...)
		if err != nil {
			_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "settings.demo_data.populate_failed", "demo_data", nil, map[string]any{
				"company_code": code,
				"steps":        steps,
			}, nil)
			response.Err(w, http.StatusInternalServerError, err.Error(), "ERR_DEMO_POPULATE")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "settings.demo_data.populate", "demo_data", nil, map[string]any{
			"company_code":   code,
			"purge_first":    body.PurgeFirst,
			"include_verify": body.IncludeVerify,
			"steps":          len(steps),
		}, nil)

		status, _ := loadStatus(r.Context(), pool, tu.TenantID, true)
		response.OK(w, map[string]any{
			"steps":        steps,
			"company_code": code,
			"status":       status,
		}, "Demo data populated.")
	}
}

func postPurge(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		code, industry, err := assertDemoTenant(r.Context(), pool, tu.TenantID, tu.IsPlatformSuperadmin)
		if err != nil {
			if errors.Is(err, errNotDemoTenant) {
				response.Err(w, http.StatusForbidden,
					"Demo purge is only available on demo tenants.",
					"ERR_FORBIDDEN")
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to verify tenant.", "ERR_INTERNAL")
			return
		}

		steps, err := runPurge(r.Context(), pool, industry, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, err.Error(), "ERR_INTERNAL")
			return
		}
		if len(steps) > 0 && !steps[0].OK {
			response.Err(w, http.StatusInternalServerError, steps[0].Message, "ERR_DEMO_PURGE")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "settings.demo_data.purge", "demo_data", nil, map[string]any{
			"company_code": code,
		}, nil)

		status, _ := loadStatus(r.Context(), pool, tu.TenantID, true)
		response.OK(w, map[string]any{
			"steps":        steps,
			"company_code": code,
			"status":       status,
		}, "Demo transactional data purged.")
	}
}
