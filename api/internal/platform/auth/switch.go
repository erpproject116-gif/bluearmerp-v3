package auth

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// RegisterAuthRoutes wires session-level endpoints that support multi-business logins
// and the active-branch picker. Mounted inside the authenticated (protected) group.
func RegisterAuthRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Post("/auth/switch-tenant", switchTenantHandler(pool))
	r.Post("/auth/session-ended", sessionEndedHandler(pool))
	r.Get("/auth/branches", branchesHandler(pool))
}

func sessionEndedHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		ClearSessionActivity(r.Context(), pool, tu.AuthUserID)
		response.OK(w, map[string]any{"cleared": true}, "Session activity cleared.")
	}
}

type switchTenantBody struct {
	TenantID int64 `json:"tenant_id"`
}

// switchTenantHandler persists the user's chosen business as their default. The request
// must be a genuine membership; the client then sends X-Tenant-ID on subsequent calls.
func switchTenantHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		var body switchTenantBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.TenantID <= 0 {
			response.Err(w, http.StatusBadRequest, "A valid tenant_id is required.", "ERR_VALIDATION")
			return
		}

		var isMember bool
		err := pool.QueryRow(r.Context(), `
			select exists (
			  select 1
			  from public.users u
			  join public.tenants t on t.id = u.tenant_id
			  where u.auth_user_id = $1::uuid
			    and u.tenant_id = $2
			    and u.status = 'active'
			    and t.status not in ('suspended', 'cancelled', 'pending_approval')
			)`, tu.AuthUserID, body.TenantID).Scan(&isMember)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to switch business.", "ERR_INTERNAL")
			return
		}
		if !isMember {
			response.Err(w, http.StatusForbidden, "You are not a member of that business.", "ERR_FORBIDDEN")
			return
		}

		_, err = pool.Exec(r.Context(), `
			insert into public.user_active_tenant (auth_user_id, tenant_id, updated_at)
			values ($1::uuid, $2, now())
			on conflict (auth_user_id) do update
			set tenant_id = excluded.tenant_id, updated_at = now()`, tu.AuthUserID, body.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to switch business.", "ERR_INTERNAL")
			return
		}

		// Drop cached sessions so the next request resolves the new active business.
		InvalidateUser(tu.AuthUserID)
		response.OK(w, map[string]any{"tenant_id": body.TenantID}, "Business switched.")
	}
}

type branch struct {
	ID           int64  `json:"id"`
	LocationCode string `json:"location_code"`
	LocationName string `json:"location_name"`
	LocationType string `json:"location_type"`
}

// branchesHandler returns the locations the current user may operate in: all active
// locations in the tenant, narrowed to the user's assigned locations when their role
// enforces data scopes. Owners and superadmins always see every location.
func branchesHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}

		scoped := tu.ApplyUserScopes && !tu.IsPlatformSuperadmin && !tu.IsTenantOwner

		var (
			rows pgx.Rows
			err  error
		)
		if scoped {
			// Only the user's assigned location/warehouse scopes.
			rows, err = pool.Query(r.Context(), `
				select l.id, l.location_code, l.location_name, l.location_type
				from public.inv_locations l
				join public.user_data_scopes s
				  on s.record_id = l.id
				 and s.tenant_id = l.tenant_id
				 and s.scope_type in ('location', 'warehouse')
				where l.tenant_id = $1
				  and l.status = 'active'
				  and s.user_id = $2
				order by l.location_name`, tu.TenantID, tu.AppUserID)
		} else {
			rows, err = pool.Query(r.Context(), `
				select l.id, l.location_code, l.location_name, l.location_type
				from public.inv_locations l
				where l.tenant_id = $1 and l.status = 'active'
				order by l.location_name`, tu.TenantID)
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load branches.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		out := []branch{}
		for rows.Next() {
			var b branch
			if err := rows.Scan(&b.ID, &b.LocationCode, &b.LocationName, &b.LocationType); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read branches.", "ERR_INTERNAL")
				return
			}
			out = append(out, b)
		}
		if err := rows.Err(); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to read branches.", "ERR_INTERNAL")
			return
		}
		response.OK(w, out, "OK")
	}
}
