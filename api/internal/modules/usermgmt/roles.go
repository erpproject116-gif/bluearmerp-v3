package usermgmt

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type RoleRow struct {
	ID                     int64  `json:"id"`
	RoleCode               string `json:"role_code"`
	RoleName               string `json:"role_name"`
	Description            string `json:"description,omitempty"`
	IsSystem               bool   `json:"is_system"`
	CanManageUsers         bool   `json:"can_manage_users"`
	CanManageFormSettings  bool   `json:"can_manage_form_settings"`
	ApplyUserScopes        bool   `json:"apply_user_scopes"`
	IsActive               bool   `json:"is_active"`
	SortOrder              int    `json:"sort_order"`
	UserCount              int64  `json:"user_count"`
}

type roleBody struct {
	RoleCode              string `json:"role_code"`
	RoleName              string `json:"role_name"`
	Description           string `json:"description"`
	CanManageUsers        bool   `json:"can_manage_users"`
	CanManageFormSettings bool   `json:"can_manage_form_settings"`
	ApplyUserScopes       bool   `json:"apply_user_scopes"`
	SortOrder             *int   `json:"sort_order"`
}

type rolePatchBody struct {
	RoleName              *string `json:"role_name"`
	Description           *string `json:"description"`
	CanManageUsers        *bool   `json:"can_manage_users"`
	CanManageFormSettings *bool   `json:"can_manage_form_settings"`
	ApplyUserScopes       *bool   `json:"apply_user_scopes"`
	IsActive              *bool   `json:"is_active"`
	SortOrder             *int    `json:"sort_order"`
}

func listRoles(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select
			  tr.id, tr.role_code, tr.role_name, coalesce(tr.description, ''),
			  tr.is_system, tr.can_manage_users, tr.can_manage_form_settings,
			  coalesce(tr.apply_user_scopes, false),
			  tr.is_active, tr.sort_order,
			  (select count(*) from public.users u where u.tenant_id = tr.tenant_id and u.tenant_role = tr.role_code)
			from public.tenant_roles tr
			where tr.tenant_id = $1
			order by tr.sort_order, tr.role_name`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list roles.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []RoleRow
		for rows.Next() {
			var row RoleRow
			if err := rows.Scan(
				&row.ID, &row.RoleCode, &row.RoleName, &row.Description,
				&row.IsSystem, &row.CanManageUsers, &row.CanManageFormSettings,
				&row.ApplyUserScopes,
				&row.IsActive, &row.SortOrder, &row.UserCount,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to list roles.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		response.OK(w, out, "OK")
	}
}

func createRole(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body roleBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON body.", "ERR_BAD_REQUEST")
			return
		}
		name := stringsTrim(body.RoleName)
		if name == "" {
			response.Validation(w, map[string]string{"role_name": "Role name is required."})
			return
		}
		code := stringsTrim(body.RoleCode)
		if code == "" {
			code = slugRoleCode(name)
		}
		if !validRoleCode(code) {
			response.Validation(w, map[string]string{"role_code": "Use lowercase letters, numbers, and underscores."})
			return
		}
		if code == "member" || code == "store_admin" {
			response.Err(w, http.StatusBadRequest, "Cannot create a system role code.", "ERR_BAD_REQUEST")
			return
		}
		sortOrder := 100
		if body.SortOrder != nil {
			sortOrder = *body.SortOrder
		}

		var row RoleRow
		err := pool.QueryRow(r.Context(), `
			insert into public.tenant_roles (
			  tenant_id, role_code, role_name, description, is_system,
			  can_manage_users, can_manage_form_settings, apply_user_scopes, sort_order
			) values ($1, $2, $3, $4, false, $5, $6, $7, $8)
			returning id, role_code, role_name, coalesce(description, ''), is_system,
			  can_manage_users, can_manage_form_settings, coalesce(apply_user_scopes, false), is_active, sort_order`,
			tu.TenantID, code, name, stringsTrim(body.Description),
			body.CanManageUsers, body.CanManageFormSettings, body.ApplyUserScopes, sortOrder,
		).Scan(
			&row.ID, &row.RoleCode, &row.RoleName, &row.Description, &row.IsSystem,
			&row.CanManageUsers, &row.CanManageFormSettings, &row.ApplyUserScopes, &row.IsActive, &row.SortOrder,
		)
		if err != nil {
			if isUniqueViolation(err) {
				response.Err(w, http.StatusConflict, "Role code already exists.", "ERR_CONFLICT")
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to create role.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "role.create", "tenant_role", &row.ID, nil, map[string]any{
			"role_code": row.RoleCode,
		})
		_ = saveRolePermissions(r.Context(), pool, tu.TenantID, row.RoleCode, map[string]string{}, nil, nil)
		response.OK(w, row, "Role created.")
	}
}

func patchRole(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}

		var body rolePatchBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON body.", "ERR_BAD_REQUEST")
			return
		}

		var isSystem bool
		var roleCode, roleName, description string
		var canUsers, canForm, applyScopes, isActive bool
		var sortOrder int
		err = pool.QueryRow(r.Context(), `
			select role_code, role_name, coalesce(description, ''), is_system,
			  can_manage_users, can_manage_form_settings, coalesce(apply_user_scopes, false), is_active, sort_order
			from public.tenant_roles
			where id = $1 and tenant_id = $2`, id, tu.TenantID).
			Scan(&roleCode, &roleName, &description, &isSystem, &canUsers, &canForm, &applyScopes, &isActive, &sortOrder)
		if err == pgx.ErrNoRows {
			response.Err(w, http.StatusNotFound, "Role not found.", "ERR_NOT_FOUND")
			return
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update role.", "ERR_INTERNAL")
			return
		}

		if isSystem {
			if body.RoleName != nil {
				roleName = stringsTrim(*body.RoleName)
			}
			if body.Description != nil {
				description = stringsTrim(*body.Description)
			}
		} else {
			if body.RoleName != nil {
				roleName = stringsTrim(*body.RoleName)
				if roleName == "" {
					response.Validation(w, map[string]string{"role_name": "Role name is required."})
					return
				}
			}
			if body.Description != nil {
				description = stringsTrim(*body.Description)
			}
			if body.CanManageUsers != nil {
				canUsers = *body.CanManageUsers
			}
			if body.CanManageFormSettings != nil {
				canForm = *body.CanManageFormSettings
			}
			if body.ApplyUserScopes != nil {
				applyScopes = *body.ApplyUserScopes
			}
			if body.IsActive != nil {
				isActive = *body.IsActive
			}
			if body.SortOrder != nil {
				sortOrder = *body.SortOrder
			}
		}

		if isSystem && body.IsActive != nil && !*body.IsActive {
			response.Err(w, http.StatusBadRequest, "System roles cannot be deactivated.", "ERR_BAD_REQUEST")
			return
		}

		var row RoleRow
		err = pool.QueryRow(r.Context(), `
			update public.tenant_roles
			set role_name = $1, description = $2,
			    can_manage_users = $3, can_manage_form_settings = $4,
			    apply_user_scopes = $5, is_active = $6, sort_order = $7, updated_at = now()
			where id = $8 and tenant_id = $9
			returning id, role_code, role_name, coalesce(description, ''), is_system,
			  can_manage_users, can_manage_form_settings, coalesce(apply_user_scopes, false), is_active, sort_order`,
			roleName, description, canUsers, canForm, applyScopes, isActive, sortOrder, id, tu.TenantID,
		).Scan(
			&row.ID, &row.RoleCode, &row.RoleName, &row.Description, &row.IsSystem,
			&row.CanManageUsers, &row.CanManageFormSettings, &row.ApplyUserScopes, &row.IsActive, &row.SortOrder,
		)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update role.", "ERR_INTERNAL")
			return
		}

		_ = pool.QueryRow(r.Context(), `
			select count(*) from public.users u
			where u.tenant_id = $1 and u.tenant_role = $2`, tu.TenantID, row.RoleCode).Scan(&row.UserCount)

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "role.update", "tenant_role", &id, nil, map[string]any{
			"role_code": row.RoleCode,
		})
		response.OK(w, row, "Role updated.")
	}
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
