package usermgmt

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type PermissionRegistryRow struct {
	PermissionCode string  `json:"permission_code"`
	ModuleCode     string  `json:"module_code"`
	FeatureKey     *string `json:"feature_key,omitempty"`
	Label          string  `json:"label"`
	SortOrder      int     `json:"sort_order"`
}

type PermissionModuleGroup struct {
	ModuleCode  string                  `json:"module_code"`
	ModuleLabel string                  `json:"module_label"`
	Permissions []PermissionRegistryRow `json:"permissions"`
}

type rolePermissionsPayload struct {
	RoleCode    string            `json:"role_code"`
	RoleName    string            `json:"role_name"`
	Permissions map[string]string `json:"permissions"`
	CanSubmit   map[string]bool   `json:"can_submit"`
	CanCancel   map[string]bool   `json:"can_cancel"`
}

type userPermissionsPayload struct {
	UserID         int64             `json:"user_id"`
	Email          string            `json:"email"`
	FullName       string            `json:"full_name"`
	TenantRole     string            `json:"tenant_role"`
	RolePerms      map[string]string `json:"role_permissions"`
	Overrides      map[string]string `json:"overrides"`
	Effective      map[string]string `json:"effective"`
}

type permissionsBody struct {
	Permissions map[string]string `json:"permissions"`
	CanSubmit   map[string]bool   `json:"can_submit"`
	CanCancel   map[string]bool   `json:"can_cancel"`
}

type userOverridesBody struct {
	Overrides map[string]string `json:"overrides"`
}

func registerPermissionRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/permissions/registry", listPermissionRegistry(pool))
	r.Get("/roles/{id}/permissions", getRolePermissions(pool))
	r.Put("/roles/{id}/permissions", putRolePermissions(pool))
	r.Get("/users/{id}/permissions", getUserPermissions(pool))
	r.Put("/users/{id}/permissions", putUserPermissions(pool))
}

func listPermissionRegistry(pool *pgxpool.Pool) http.HandlerFunc {
	moduleLabels := map[string]string{
		"inventory":        "Inventory",
		"quotation":        "Quotation",
		"sales_order":      "Sales Order",
		"sales":            "Sales",
		"finance":          "Finance",
		"crm":              "CRM",
		"activity_logs":    "Activity Logs",
		"user_management":  "User Management",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := pool.Query(r.Context(), `
			select permission_code, module_code, feature_key, label, sort_order
			from public.permission_registry
			order by sort_order, permission_code`)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load permission registry.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		grouped := map[string]*PermissionModuleGroup{}
		order := []string{}
		for rows.Next() {
			var row PermissionRegistryRow
			var featureKey *string
			if err := rows.Scan(&row.PermissionCode, &row.ModuleCode, &featureKey, &row.Label, &row.SortOrder); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read permissions.", "ERR_INTERNAL")
				return
			}
			row.FeatureKey = featureKey
			g, ok := grouped[row.ModuleCode]
			if !ok {
				label := moduleLabels[row.ModuleCode]
				if label == "" {
					label = row.ModuleCode
				}
				g = &PermissionModuleGroup{ModuleCode: row.ModuleCode, ModuleLabel: label}
				grouped[row.ModuleCode] = g
				order = append(order, row.ModuleCode)
			}
			g.Permissions = append(g.Permissions, row)
		}
		var out []PermissionModuleGroup
		for _, code := range order {
			out = append(out, *grouped[code])
		}
		response.OK(w, out, "OK")
	}
}

func getRolePermissions(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var roleCode, roleName string
		err = pool.QueryRow(r.Context(), `
			select role_code, role_name from public.tenant_roles
			where id = $1 and tenant_id = $2`, id, tu.TenantID).Scan(&roleCode, &roleName)
		if err == pgx.ErrNoRows {
			response.Err(w, http.StatusNotFound, "Role not found.", "ERR_NOT_FOUND")
			return
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load role.", "ERR_INTERNAL")
			return
		}
		perms, submit, cancel, err := loadRolePermissionsFull(r.Context(), pool, tu.TenantID, roleCode)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load permissions.", "ERR_INTERNAL")
			return
		}
		response.OK(w, rolePermissionsPayload{
			RoleCode: roleCode, RoleName: roleName, Permissions: perms,
			CanSubmit: submit, CanCancel: cancel,
		}, "OK")
	}
}

func putRolePermissions(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body permissionsBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON body.", "ERR_BAD_REQUEST")
			return
		}
		var roleCode string
		err = pool.QueryRow(r.Context(), `
			select role_code from public.tenant_roles where id = $1 and tenant_id = $2`,
			id, tu.TenantID).Scan(&roleCode)
		if err == pgx.ErrNoRows {
			response.Err(w, http.StatusNotFound, "Role not found.", "ERR_NOT_FOUND")
			return
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update permissions.", "ERR_INTERNAL")
			return
		}
		if err := saveRolePermissions(r.Context(), pool, tu.TenantID, roleCode, body.Permissions, body.CanSubmit, body.CanCancel); err != nil {
			if err == errInvalidAccessLevel {
				response.Validation(w, map[string]string{"permissions": "Each level must be read, write, or deny."})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to save permissions.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "role.permissions.update", "tenant_role", &id, nil, map[string]any{
			"role_code": roleCode,
		})
		_ = auth.InvalidateUsersByTenantRole(r.Context(), pool, tu.TenantID, roleCode)
		perms, submit, cancel, _ := loadRolePermissionsFull(r.Context(), pool, tu.TenantID, roleCode)
		response.OK(w, rolePermissionsPayload{
			RoleCode: roleCode, Permissions: perms, CanSubmit: submit, CanCancel: cancel,
		}, "Permissions saved.")
	}
}

func getUserPermissions(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var email, fullName, tenantRole string
		err = pool.QueryRow(r.Context(), `
			select email, full_name, tenant_role from public.users
			where id = $1 and tenant_id = $2`, id, tu.TenantID).
			Scan(&email, &fullName, &tenantRole)
		if err == pgx.ErrNoRows {
			response.Err(w, http.StatusNotFound, "User not found.", "ERR_NOT_FOUND")
			return
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load user.", "ERR_INTERNAL")
			return
		}
		rolePerms, err := loadRolePermissions(r.Context(), pool, tu.TenantID, tenantRole)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load role permissions.", "ERR_INTERNAL")
			return
		}
		overrides, err := loadUserOverrides(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load overrides.", "ERR_INTERNAL")
			return
		}
		effective := computeEffectivePermissions(rolePerms, overrides)
		response.OK(w, userPermissionsPayload{
			UserID: id, Email: email, FullName: fullName, TenantRole: tenantRole,
			RolePerms: rolePerms, Overrides: overrides, Effective: effective,
		}, "OK")
	}
}

func putUserPermissions(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body userOverridesBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON body.", "ERR_BAD_REQUEST")
			return
		}
		var exists bool
		err = pool.QueryRow(r.Context(), `
			select exists(select 1 from public.users where id = $1 and tenant_id = $2)`,
			id, tu.TenantID).Scan(&exists)
		if err != nil || !exists {
			response.Err(w, http.StatusNotFound, "User not found.", "ERR_NOT_FOUND")
			return
		}
		if err := saveUserOverrides(r.Context(), pool, tu.TenantID, id, body.Overrides); err != nil {
			if err == errInvalidAccessLevel {
				response.Validation(w, map[string]string{"overrides": "Each level must be read, write, or deny."})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to save overrides.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "user.permissions.update", "user", &id, nil, body)
		_ = auth.InvalidateUserByAppUserID(r.Context(), pool, id)
		var email, fullName, tenantRole string
		_ = pool.QueryRow(r.Context(), `
			select email, full_name, tenant_role from public.users where id = $1`, id).
			Scan(&email, &fullName, &tenantRole)
		rolePerms, _ := loadRolePermissions(r.Context(), pool, tu.TenantID, tenantRole)
		overrides, _ := loadUserOverrides(r.Context(), pool, tu.TenantID, id)
		response.OK(w, userPermissionsPayload{
			UserID: id, Email: email, FullName: fullName, TenantRole: tenantRole,
			RolePerms: rolePerms, Overrides: overrides,
			Effective: computeEffectivePermissions(rolePerms, overrides),
		}, "Permissions saved.")
	}
}
