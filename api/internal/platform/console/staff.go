package console

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func (s *service) listStaff(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(), `
		select id, email, full_name, role, is_active, last_signed_in_at, created_at
		from public.platform_users
		order by full_name, email`)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to list staff.", "ERR_INTERNAL")
		return
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		var id int64
		var email, name, role string
		var active bool
		var lastSignIn *time.Time
		var created time.Time
		if rows.Scan(&id, &email, &name, &role, &active, &lastSignIn, &created) != nil {
			continue
		}
		list = append(list, map[string]any{
			"id": id, "email": email, "full_name": name, "role": role,
			"is_active": active, "last_signed_in_at": lastSignIn, "created_at": created,
		})
	}
	response.OK(w, map[string]any{"staff": list}, "OK")
}

func (s *service) listStaffInvites(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(), `
		select id, email, full_name, role, expires_at, accepted_at, revoked_at, created_at
		from public.platform_user_invites
		order by created_at desc
		limit 100`)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to list invites.", "ERR_INTERNAL")
		return
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		var id int64
		var email, name, role string
		var expires time.Time
		var accepted, revoked *time.Time
		var created time.Time
		if rows.Scan(&id, &email, &name, &role, &expires, &accepted, &revoked, &created) != nil {
			continue
		}
		list = append(list, map[string]any{
			"id": id, "email": email, "full_name": name, "role": role,
			"expires_at": expires, "accepted_at": accepted, "revoked_at": revoked, "created_at": created,
		})
	}
	response.OK(w, map[string]any{"invites": list}, "OK")
}

func (s *service) createStaffInvite(w http.ResponseWriter, r *http.Request) {
	tu, _ := auth.FromContext(r.Context())
	var body struct {
		Email    string `json:"email"`
		FullName string `json:"full_name"`
		Role     string `json:"role"`
		Days     int    `json:"days"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Validation(w, map[string]string{"body": "Invalid JSON."})
		return
	}
	email := strings.ToLower(strings.TrimSpace(body.Email))
	if email == "" || !strings.Contains(email, "@") {
		response.Validation(w, map[string]string{"email": "Valid email required."})
		return
	}
	role := strings.TrimSpace(body.Role)
	if role == "" {
		role = "support_viewer"
	}
	days := body.Days
	if days <= 0 || days > 90 {
		days = 14
	}
	var id int64
	err := s.pool.QueryRow(r.Context(), `
		insert into public.platform_user_invites (
		  email, full_name, role, invited_by_platform_user_id, expires_at
		) values ($1,$2,$3,$4, now() + ($5 || ' days')::interval)
		returning id`,
		email, strings.TrimSpace(body.FullName), role, nullIfZero(tu.PlatformUserID), strconv.Itoa(days),
	).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "uq_platform_user_invites_pending_email") {
			response.Validation(w, map[string]string{"email": "A pending invite already exists for this email."})
			return
		}
		response.Err(w, http.StatusInternalServerError, "Failed to create invite.", "ERR_INTERNAL")
		return
	}
	response.OK(w, map[string]any{
		"id": id,
		"message": "Invite created. Staff must sign in with Google using " + email + ".",
	}, "Created.")
}

func (s *service) revokeStaffInvite(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	_, err := s.pool.Exec(r.Context(), `
		update public.platform_user_invites
		set revoked_at = now()
		where id = $1 and accepted_at is null and revoked_at is null`, id)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to revoke invite.", "ERR_INTERNAL")
		return
	}
	response.OK(w, map[string]any{"id": id}, "Revoked.")
}

func (s *service) patchStaff(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	var body struct {
		Role     *string `json:"role"`
		IsActive *bool   `json:"is_active"`
		FullName *string `json:"full_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Validation(w, map[string]string{"body": "Invalid JSON."})
		return
	}
	sets := []string{}
	args := []any{}
	n := 1
	if body.Role != nil {
		args = append(args, strings.TrimSpace(*body.Role))
		sets = append(sets, "role = $"+strconv.Itoa(n))
		n++
	}
	if body.IsActive != nil {
		args = append(args, *body.IsActive)
		sets = append(sets, "is_active = $"+strconv.Itoa(n))
		n++
	}
	if body.FullName != nil {
		args = append(args, strings.TrimSpace(*body.FullName))
		sets = append(sets, "full_name = $"+strconv.Itoa(n))
		n++
	}
	if len(sets) == 0 {
		response.Validation(w, map[string]string{"body": "No changes."})
		return
	}
	args = append(args, id)
	var authUserID string
	err := s.pool.QueryRow(r.Context(),
		`update public.platform_users set `+strings.Join(sets, ", ")+
			` where id = $`+strconv.Itoa(n)+
			` returning coalesce(auth_user_id::text, '')`, args...).Scan(&authUserID)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to update staff.", "ERR_INTERNAL")
		return
	}
	// Platform role and is_active now ride on the cached session, so deactivating or
	// demoting staff must evict them instead of waiting out the auth cache TTL.
	auth.InvalidateUser(authUserID)
	response.OK(w, map[string]any{"id": id}, "Updated.")
}
