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

type UserGroupRow struct {
	ID          int64  `json:"id"`
	GroupCode   string `json:"group_code"`
	GroupName   string `json:"group_name"`
	Description string `json:"description,omitempty"`
	IsActive    bool   `json:"is_active"`
	SortOrder   int    `json:"sort_order"`
	MemberCount int64  `json:"member_count"`
}

type groupBody struct {
	GroupCode   string `json:"group_code"`
	GroupName   string `json:"group_name"`
	Description string `json:"description"`
	SortOrder   *int   `json:"sort_order"`
}

type groupPatchBody struct {
	GroupName   *string `json:"group_name"`
	Description *string `json:"description"`
	IsActive    *bool   `json:"is_active"`
	SortOrder   *int    `json:"sort_order"`
}

type groupPermissionsPayload struct {
	GroupCode   string            `json:"group_code"`
	GroupName   string            `json:"group_name"`
	Permissions map[string]string `json:"permissions"`
}

type groupMembersBody struct {
	UserIDs []int64 `json:"user_ids"`
}

func registerGroupRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/groups", listGroups(pool))
	r.Post("/groups", createGroup(pool))
	r.Patch("/groups/{id}", patchGroup(pool))
	r.Get("/groups/{id}/permissions", getGroupPermissions(pool))
	r.Put("/groups/{id}/permissions", putGroupPermissions(pool))
	r.Get("/groups/{id}/members", getGroupMembers(pool))
	r.Put("/groups/{id}/members", putGroupMembers(pool))
}

func listGroups(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select g.id, g.group_code, g.group_name, coalesce(g.description, ''),
			  g.is_active, g.sort_order,
			  (select count(*) from public.tenant_user_group_members m where m.group_id = g.id)
			from public.tenant_user_groups g
			where g.tenant_id = $1
			order by g.sort_order, g.group_name`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list groups.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []UserGroupRow
		for rows.Next() {
			var row UserGroupRow
			if err := rows.Scan(&row.ID, &row.GroupCode, &row.GroupName, &row.Description, &row.IsActive, &row.SortOrder, &row.MemberCount); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read groups.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []UserGroupRow{}
		}
		response.OK(w, out, "OK")
	}
}

func createGroup(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body groupBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON body.", "ERR_BAD_REQUEST")
			return
		}
		name := stringsTrim(body.GroupName)
		if name == "" {
			response.Validation(w, map[string]string{"group_name": "Group name is required."})
			return
		}
		code := stringsTrim(body.GroupCode)
		if code == "" {
			code = slugRoleCode(name)
		}
		sortOrder := 100
		if body.SortOrder != nil {
			sortOrder = *body.SortOrder
		}
		var row UserGroupRow
		err := pool.QueryRow(r.Context(), `
			insert into public.tenant_user_groups (tenant_id, group_code, group_name, description, sort_order)
			values ($1, $2, $3, $4, $5)
			returning id, group_code, group_name, coalesce(description, ''), is_active, sort_order`,
			tu.TenantID, code, name, stringsTrim(body.Description), sortOrder,
		).Scan(&row.ID, &row.GroupCode, &row.GroupName, &row.Description, &row.IsActive, &row.SortOrder)
		if err != nil {
			if isUniqueViolation(err) {
				response.Err(w, http.StatusConflict, "Group code already exists.", "ERR_CONFLICT")
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to create group.", "ERR_INTERNAL")
			return
		}
		_ = saveGroupPermissions(r.Context(), pool, tu.TenantID, row.ID, map[string]string{})
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "group.create", "tenant_user_group", &row.ID, nil, map[string]any{"group_code": row.GroupCode})
		response.OK(w, row, "Group created.")
	}
}

func patchGroup(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body groupPatchBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON body.", "ERR_BAD_REQUEST")
			return
		}
		var name, description string
		var isActive bool
		var sortOrder int
		err = pool.QueryRow(r.Context(), `
			select group_name, coalesce(description, ''), is_active, sort_order
			from public.tenant_user_groups where id = $1 and tenant_id = $2`, id, tu.TenantID).
			Scan(&name, &description, &isActive, &sortOrder)
		if err == pgx.ErrNoRows {
			response.Err(w, http.StatusNotFound, "Group not found.", "ERR_NOT_FOUND")
			return
		}
		if body.GroupName != nil {
			name = stringsTrim(*body.GroupName)
		}
		if body.Description != nil {
			description = stringsTrim(*body.Description)
		}
		if body.IsActive != nil {
			isActive = *body.IsActive
		}
		if body.SortOrder != nil {
			sortOrder = *body.SortOrder
		}
		var row UserGroupRow
		err = pool.QueryRow(r.Context(), `
			update public.tenant_user_groups
			set group_name = $1, description = $2, is_active = $3, sort_order = $4, updated_at = now()
			where id = $5 and tenant_id = $6
			returning id, group_code, group_name, coalesce(description, ''), is_active, sort_order`,
			name, description, isActive, sortOrder, id, tu.TenantID,
		).Scan(&row.ID, &row.GroupCode, &row.GroupName, &row.Description, &row.IsActive, &row.SortOrder)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update group.", "ERR_INTERNAL")
			return
		}
		_ = pool.QueryRow(r.Context(), `select count(*) from public.tenant_user_group_members where group_id = $1`, id).Scan(&row.MemberCount)
		response.OK(w, row, "Group updated.")
	}
}

func getGroupPermissions(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var code, name string
		err = pool.QueryRow(r.Context(), `select group_code, group_name from public.tenant_user_groups where id = $1 and tenant_id = $2`, id, tu.TenantID).Scan(&code, &name)
		if err == pgx.ErrNoRows {
			response.Err(w, http.StatusNotFound, "Group not found.", "ERR_NOT_FOUND")
			return
		}
		perms, err := loadGroupPermissions(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load permissions.", "ERR_INTERNAL")
			return
		}
		response.OK(w, groupPermissionsPayload{GroupCode: code, GroupName: name, Permissions: perms}, "OK")
	}
}

func putGroupPermissions(pool *pgxpool.Pool) http.HandlerFunc {
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
		if err := saveGroupPermissions(r.Context(), pool, tu.TenantID, id, body.Permissions); err != nil {
			if err == errInvalidAccessLevel {
				response.Validation(w, map[string]string{"permissions": "Each level must be read, write, or deny."})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to save permissions.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "group.permissions.update", "tenant_user_group", &id, nil, nil)
		_ = auth.InvalidateGroupMembers(r.Context(), pool, tu.TenantID, id)
		perms, _ := loadGroupPermissions(r.Context(), pool, tu.TenantID, id)
		var code, name string
		_ = pool.QueryRow(r.Context(), `select group_code, group_name from public.tenant_user_groups where id = $1`, id).Scan(&code, &name)
		response.OK(w, groupPermissionsPayload{GroupCode: code, GroupName: name, Permissions: perms}, "Permissions saved.")
	}
}

func getGroupMembers(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		rows, err := pool.Query(r.Context(), `
			select u.id, u.email, u.full_name
			from public.tenant_user_group_members m
			join public.users u on u.id = m.user_id
			where m.group_id = $1 and m.tenant_id = $2
			order by u.full_name`, id, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list members.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		type member struct {
			ID       int64  `json:"id"`
			Email    string `json:"email"`
			FullName string `json:"full_name"`
		}
		var out []member
		for rows.Next() {
			var m member
			if err := rows.Scan(&m.ID, &m.Email, &m.FullName); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read members.", "ERR_INTERNAL")
				return
			}
			out = append(out, m)
		}
		if out == nil {
			out = []member{}
		}
		response.OK(w, out, "OK")
	}
}

func putGroupMembers(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body groupMembersBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON body.", "ERR_BAD_REQUEST")
			return
		}
		if err := saveGroupMembers(r.Context(), pool, tu.TenantID, id, body.UserIDs); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update members.", "ERR_INTERNAL")
			return
		}
		_ = auth.InvalidateGroupMembers(r.Context(), pool, tu.TenantID, id)
		getGroupMembers(pool).ServeHTTP(w, r)
	}
}
