package usermgmt

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type UserRow struct {
	ID           int64      `json:"id"`
	Email        string     `json:"email"`
	FullName     string     `json:"full_name"`
	TenantRole   string     `json:"tenant_role"`
	Status       string     `json:"status"`
	AuthLinked   bool       `json:"auth_linked"`
	IsOwner      bool       `json:"is_owner"`
	InviteID     *int64     `json:"invite_id,omitempty"`
	InvitedAt    *time.Time `json:"invited_at,omitempty"`
	InvitedBy    *int64     `json:"invited_by_user_id,omitempty"`
}

type inviteBody struct {
	Email      string `json:"email"`
	FullName   string `json:"full_name"`
	TenantRole string `json:"tenant_role"`
}

type userPatchBody struct {
	TenantRole *string `json:"tenant_role"`
	Status     *string `json:"status"`
	FullName   *string `json:"full_name"`
}

func registerUserRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/users", listUsers(pool))
	r.Post("/invites", createInvite(pool))
	r.Patch("/users/{id}", patchUser(pool))
	r.Post("/invites/{id}/revoke", revokeInvite(pool))
}

func registerRoleRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/roles", listRoles(pool))
	r.Post("/roles", createRole(pool))
	r.Patch("/roles/{id}", patchRole(pool))
}

func listUsers(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"email":       "u.email",
		"full_name":   "u.full_name",
		"tenant_role": "u.tenant_role",
		"status":      "u.status",
		"created_at":  "u.created_at",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "email", allowed)
		offset := httputil.Offset(p)

		where := "u.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if p.Q != "" {
			where += fmt.Sprintf(" and (u.email ilike $%d or u.full_name ilike $%d)", n, n)
			args = append(args, "%"+p.Q+"%")
			n++
		}
		if p.Status != "" && p.Status != "all" {
			where += fmt.Sprintf(" and u.status = $%d", n)
			args = append(args, p.Status)
			n++
		}

		order := orderSQL(p.Order)
		sortCol := allowed[p.Sort]
		if sortCol == "" {
			sortCol = "u.email"
		}
		q := fmt.Sprintf(`
			select
			  u.id,
			  u.email,
			  u.full_name,
			  u.tenant_role,
			  u.status,
			  u.auth_user_id is not null,
			  t.owner_user_id = u.id,
			  ui.id,
			  ui.invited_at,
			  ui.invited_by_user_id,
			  count(*) over() as total_count
			from public.users u
			join public.tenants t on t.id = u.tenant_id
			left join lateral (
			  select i.id, i.invited_at, i.invited_by_user_id
			  from public.user_invites i
			  where i.user_id = u.id and i.revoked_at is null
			  order by i.invited_at desc
			  limit 1
			) ui on true
			where %s
			order by %s %s
			limit $%d offset $%d`, where, sortCol, order, n, n+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list users.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []UserRow
		var total int64
		for rows.Next() {
			var row UserRow
			if err := rows.Scan(
				&row.ID, &row.Email, &row.FullName, &row.TenantRole, &row.Status,
				&row.AuthLinked, &row.IsOwner, &row.InviteID, &row.InvitedAt, &row.InvitedBy, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to list users.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func createInvite(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body inviteBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON body.", "ERR_BAD_REQUEST")
			return
		}
		email := normalizeEmail(body.Email)
		fullName := stringsTrim(body.FullName)
		roleCode := stringsTrim(body.TenantRole)
		if !validEmail(email) {
			response.Validation(w, map[string]string{"email": "Enter a valid email address."})
			return
		}
		if fullName == "" {
			response.Validation(w, map[string]string{"full_name": "Full name is required."})
			return
		}
		if roleCode == "" {
			roleCode = "member"
		}
		if !validRoleCode(roleCode) {
			response.Validation(w, map[string]string{"tenant_role": "Invalid role code."})
			return
		}
		if !roleExists(r.Context(), pool, tu.TenantID, roleCode) {
			response.Validation(w, map[string]string{"tenant_role": "Role does not exist for this tenant."})
			return
		}

		var existingStatus string
		err := pool.QueryRow(r.Context(), `
			select status from public.users
			where tenant_id = $1 and lower(email) = $2`, tu.TenantID, email).Scan(&existingStatus)
		if err == nil {
			if existingStatus == "invited" {
				response.Err(w, http.StatusConflict, "This email already has a pending invite.", "ERR_CONFLICT")
				return
			}
			response.Err(w, http.StatusConflict, "A user with this email already exists.", "ERR_CONFLICT")
			return
		}
		if err != pgx.ErrNoRows {
			response.Err(w, http.StatusInternalServerError, "Failed to create invite.", "ERR_INTERNAL")
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create invite.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var userID int64
		err = tx.QueryRow(r.Context(), `
			insert into public.users (tenant_id, email, full_name, status, tenant_role)
			values ($1, $2, $3, 'invited', $4)
			returning id`, tu.TenantID, email, fullName, roleCode).Scan(&userID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create invite.", "ERR_INTERNAL")
			return
		}

		var inviteID int64
		err = tx.QueryRow(r.Context(), `
			insert into public.user_invites (tenant_id, user_id, email, full_name, role_code, invited_by_user_id)
			values ($1, $2, $3, $4, $5, $6)
			returning id`, tu.TenantID, userID, email, fullName, roleCode, tu.AppUserID).Scan(&inviteID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create invite.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create invite.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "user.invite", "user", &userID, nil, map[string]any{
			"email": email, "tenant_role": roleCode,
		})

		now := time.Now()
		response.OK(w, UserRow{
			ID: userID, Email: email, FullName: fullName, TenantRole: roleCode,
			Status: "invited", AuthLinked: false, InviteID: &inviteID, InvitedAt: &now,
			InvitedBy: &tu.AppUserID,
		}, "User invited. They must sign in with Google using this email.")
	}
}

func patchUser(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body userPatchBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON body.", "ERR_BAD_REQUEST")
			return
		}
		if body.Status != nil && *body.Status == "disabled" && id == tu.AppUserID {
			response.Err(w, http.StatusBadRequest, "You cannot disable your own account.", "ERR_BAD_REQUEST")
			return
		}

		var ownerUserID *int64
		var currentStatus, currentRole string
		err = pool.QueryRow(r.Context(), `
			select t.owner_user_id, u.status, u.tenant_role
			from public.users u
			join public.tenants t on t.id = u.tenant_id
			where u.id = $1 and u.tenant_id = $2`, id, tu.TenantID).
			Scan(&ownerUserID, &currentStatus, &currentRole)
		if err == pgx.ErrNoRows {
			response.Err(w, http.StatusNotFound, "User not found.", "ERR_NOT_FOUND")
			return
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update user.", "ERR_INTERNAL")
			return
		}
		if ownerUserID != nil && *ownerUserID == id {
			if body.TenantRole != nil && *body.TenantRole != currentRole {
				response.Err(w, http.StatusBadRequest, "Cannot change the tenant owner role.", "ERR_BAD_REQUEST")
				return
			}
			if body.Status != nil && *body.Status == "disabled" {
				response.Err(w, http.StatusBadRequest, "Cannot disable the tenant owner.", "ERR_BAD_REQUEST")
				return
			}
		}

		role := currentRole
		if body.TenantRole != nil {
			role = stringsTrim(*body.TenantRole)
			if !validRoleCode(role) || !roleExists(r.Context(), pool, tu.TenantID, role) {
				response.Validation(w, map[string]string{"tenant_role": "Invalid role."})
				return
			}
		}
		status := currentStatus
		if body.Status != nil {
			status = stringsTrim(*body.Status)
			if status != "active" && status != "disabled" && status != "invited" {
				response.Validation(w, map[string]string{"status": "Status must be active, disabled, or invited."})
				return
			}
			if currentStatus == "invited" && status == "active" {
				response.Err(w, http.StatusBadRequest, "Invited users become active after Google sign-in.", "ERR_BAD_REQUEST")
				return
			}
		}
		fullName := body.FullName

		q := `update public.users set tenant_role = $1, status = $2, updated_at = now()`
		args := []any{role, status}
		n := 3
		if fullName != nil {
			fn := stringsTrim(*fullName)
			if fn == "" {
				response.Validation(w, map[string]string{"full_name": "Full name cannot be empty."})
				return
			}
			q += fmt.Sprintf(", full_name = $%d", n)
			args = append(args, fn)
			n++
		}
		q += fmt.Sprintf(" where id = $%d and tenant_id = $%d returning id, email, full_name, tenant_role, status, auth_user_id is not null", n, n+1)
		args = append(args, id, tu.TenantID)

		var row UserRow
		var isOwner bool
		err = pool.QueryRow(r.Context(), q, args...).Scan(
			&row.ID, &row.Email, &row.FullName, &row.TenantRole, &row.Status, &row.AuthLinked,
		)
		if err == pgx.ErrNoRows {
			response.Err(w, http.StatusNotFound, "User not found.", "ERR_NOT_FOUND")
			return
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update user.", "ERR_INTERNAL")
			return
		}
		if ownerUserID != nil && *ownerUserID == id {
			isOwner = true
		}
		row.IsOwner = isOwner

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "user.update", "user", &id, nil, map[string]any{
			"tenant_role": role, "status": status,
		})
		response.OK(w, row, "User updated.")
	}
}

func revokeInvite(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		inviteID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid invite id."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to revoke invite.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var userID int64
		err = tx.QueryRow(r.Context(), `
			select ui.user_id
			from public.user_invites ui
			join public.users u on u.id = ui.user_id
			where ui.id = $1 and ui.tenant_id = $2
			  and ui.revoked_at is null and ui.accepted_at is null
			  and u.status = 'invited' and u.auth_user_id is null`, inviteID, tu.TenantID).Scan(&userID)
		if err == pgx.ErrNoRows {
			response.Err(w, http.StatusNotFound, "Pending invite not found.", "ERR_NOT_FOUND")
			return
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to revoke invite.", "ERR_INTERNAL")
			return
		}

		_, err = tx.Exec(r.Context(), `
			update public.user_invites set revoked_at = now() where id = $1`, inviteID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to revoke invite.", "ERR_INTERNAL")
			return
		}
		_, err = tx.Exec(r.Context(), `
			update public.users set status = 'disabled', updated_at = now()
			where id = $1 and tenant_id = $2`, userID, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to revoke invite.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to revoke invite.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "user.invite_revoke", "user", &userID, nil, nil)
		response.OK(w, map[string]any{"id": userID, "invite_id": inviteID}, "Invite revoked.")
	}
}

func roleExists(ctx context.Context, pool *pgxpool.Pool, tenantID int64, roleCode string) bool {
	var ok bool
	_ = pool.QueryRow(ctx, `
		select exists(
		  select 1 from public.tenant_roles
		  where tenant_id = $1 and role_code = $2 and is_active = true
		)`, tenantID, roleCode).Scan(&ok)
	return ok
}

func orderSQL(order string) string {
	if order == "desc" {
		return "desc"
	}
	return "asc"
}

func stringsTrim(s string) string {
	return strings.TrimSpace(s)
}
