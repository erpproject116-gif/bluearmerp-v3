package portal

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

var (
	errNotElevatedStaff = errors.New("not elevated staff")
	errNoPortalPartner  = errors.New("no portal partner")
)

type portalUserRow struct {
	ID          int64  `json:"id"`
	PartnerID   int64  `json:"partner_id"`
	PartnerName string `json:"partner_name,omitempty"`
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
	IsActive    bool   `json:"is_active"`
}

type portalUserBody struct {
	PartnerID   int64  `json:"partner_id"`
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
}

type portalUserPatch struct {
	DisplayName *string `json:"display_name"`
	IsActive    *bool   `json:"is_active"`
}

type magicLinkRequestBody struct {
	Email string `json:"email"`
}

type magicLinkResponse struct {
	Token     string `json:"token"`
	ExpiresAt string `json:"expires_at"`
	LoginURL  string `json:"login_url,omitempty"`
}

type portalSessionResponse struct {
	ID          int64  `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
	PartnerID   int64  `json:"partner_id"`
	PartnerName string `json:"partner_name,omitempty"`
}

func listPortalUsers(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "email", map[string]string{"email": "u.email"})
		offset := httputil.Offset(p)
		where := "u.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
			where += fmt.Sprintf(" and (u.email ilike $%d or u.display_name ilike $%d or p.company_name ilike $%d)", n, n, n)
			args = append(args, "%"+q+"%")
			n++
		}
		q := fmt.Sprintf(`
			select u.id, u.partner_id, p.company_name, u.email, u.display_name, u.is_active,
			  count(*) over()
			from public.portal_users u
			join public.inv_partners p on p.id = u.partner_id
			where %s
			order by u.email asc
			limit $%d offset $%d`, where, n, n+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list portal users.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []portalUserRow
		var total int64
		for rows.Next() {
			var row portalUserRow
			if err := rows.Scan(&row.ID, &row.PartnerID, &row.PartnerName, &row.Email, &row.DisplayName, &row.IsActive, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read portal users.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func createPortalUser(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body portalUserBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON body.", "ERR_BAD_REQUEST")
			return
		}
		email := strings.TrimSpace(strings.ToLower(body.Email))
		if email == "" || body.PartnerID <= 0 {
			response.Validation(w, map[string]string{
				"email":      "Email is required.",
				"partner_id": "Partner is required.",
			})
			return
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.portal_users (tenant_id, partner_id, email, display_name)
			values ($1, $2, $3, $4)
			returning id`,
			tu.TenantID, body.PartnerID, email, strings.TrimSpace(body.DisplayName)).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create portal user.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]int64{"id": id}, "Created.")
	}
}

func patchPortalUser(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := parseID(chi.URLParam(r, "id"))
		if err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid user id.", "ERR_BAD_REQUEST")
			return
		}
		var body portalUserPatch
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON body.", "ERR_BAD_REQUEST")
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.portal_users set
			  display_name = coalesce($3, display_name),
			  is_active = coalesce($4, is_active),
			  updated_at = now()
			where id = $1 and tenant_id = $2`,
			id, tu.TenantID, body.DisplayName, body.IsActive)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update portal user.", "ERR_INTERNAL")
			return
		}
		if tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Portal user not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, nil, "Updated.")
	}
}

func issueMagicLink(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := parseID(chi.URLParam(r, "id"))
		if err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid user id.", "ERR_BAD_REQUEST")
			return
		}
		var exists bool
		if err := pool.QueryRow(r.Context(),
			`select exists(select 1 from public.portal_users where id = $1 and tenant_id = $2 and is_active = true)`,
			id, tu.TenantID).Scan(&exists); err != nil || !exists {
			response.Err(w, http.StatusNotFound, "Portal user not found.", "ERR_NOT_FOUND")
			return
		}
		token, expires, err := createMagicLink(r.Context(), pool, id, 7*24*time.Hour)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create magic link.", "ERR_INTERNAL")
			return
		}
		response.OK(w, magicLinkResponse{
			Token:     token,
			ExpiresAt: expires.UTC().Format(time.RFC3339),
			LoginURL:  "/portal/dashboard?token=" + token,
		}, "Magic link created.")
	}
}

func requestMagicLink(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body magicLinkRequestBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON body.", "ERR_BAD_REQUEST")
			return
		}
		email := strings.TrimSpace(strings.ToLower(body.Email))
		if email == "" {
			response.Validation(w, map[string]string{"email": "Email is required."})
			return
		}
		var portalUserID int64
		err := pool.QueryRow(r.Context(), `
			select id from public.portal_users
			where email = $1 and is_active = true
			limit 1`, email).Scan(&portalUserID)
		if err == pgx.ErrNoRows {
			// Owners / product owners are ERP staff, not portal_users. Issue a
			// short-lived staff preview session so /portal/login still works.
			portalUserID, err = ensureStaffPortalPreviewUser(r.Context(), pool, email)
			if err != nil {
				if errors.Is(err, errNotElevatedStaff) {
					response.OK(w, map[string]string{"message": "If an account exists, a sign-in link has been sent."}, "OK")
					return
				}
				if errors.Is(err, errNoPortalPartner) {
					response.Err(w, http.StatusBadRequest, "No client partner is available for portal preview. Add an HR client first.", "ERR_BAD_REQUEST")
					return
				}
				response.Err(w, http.StatusInternalServerError, "Failed to request link.", "ERR_INTERNAL")
				return
			}
		} else if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to request link.", "ERR_INTERNAL")
			return
		}
		token, expires, err := createMagicLink(r.Context(), pool, portalUserID, 24*time.Hour)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create magic link.", "ERR_INTERNAL")
			return
		}
		response.OK(w, magicLinkResponse{
			Token:     token,
			ExpiresAt: expires.UTC().Format(time.RFC3339),
			LoginURL:  "/portal/dashboard?token=" + token,
		}, "Magic link created.")
	}
}

func portalSession(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := portalToken(r)
		if token == "" {
			response.Err(w, http.StatusUnauthorized, "Portal token required.", "ERR_UNAUTHORIZED")
			return
		}
		pu, err := resolveMagicLink(r.Context(), pool, token)
		if err != nil {
			if err == pgx.ErrNoRows {
				response.Err(w, http.StatusUnauthorized, "Invalid or expired portal link.", "ERR_UNAUTHORIZED")
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to validate portal link.", "ERR_INTERNAL")
			return
		}
		var partnerName string
		_ = pool.QueryRow(r.Context(),
			`select company_name from public.inv_partners where id = $1`, pu.PartnerID).Scan(&partnerName)
		response.OK(w, portalSessionResponse{
			ID:          pu.ID,
			Email:       pu.Email,
			DisplayName: pu.DisplayName,
			PartnerID:   pu.PartnerID,
			PartnerName: partnerName,
		}, "OK")
	}
}

func parseID(s string) (int64, error) {
	id, err := strconv.ParseInt(strings.TrimSpace(s), 10, 64)
	if err != nil || id <= 0 {
		return 0, fmt.Errorf("invalid id")
	}
	return id, nil
}

// ensureStaffPortalPreviewUser creates or reuses a staff-preview portal user when
// the email belongs to a product owner, platform superadmin, or tenant owner.
func ensureStaffPortalPreviewUser(ctx context.Context, pool *pgxpool.Pool, email string) (int64, error) {
	tenantID, displayName, ok, err := lookupElevatedStaffTenant(ctx, pool, email)
	if err != nil {
		return 0, err
	}
	if !ok {
		return 0, errNotElevatedStaff
	}
	partnerID, err := lookupPortalPreviewPartner(ctx, pool, tenantID)
	if err != nil {
		return 0, err
	}
	previewEmail := "staff-preview+tenant" + strconv.FormatInt(tenantID, 10) + "@bluearm.internal"
	if displayName == "" {
		displayName = "Staff preview"
	} else {
		displayName = "Staff preview — " + displayName
	}
	var portalUserID int64
	err = pool.QueryRow(ctx, `
		insert into public.portal_users (tenant_id, partner_id, email, display_name)
		values ($1,$2,$3,$4)
		on conflict (tenant_id, email) do update
		  set partner_id = excluded.partner_id,
		      display_name = excluded.display_name,
		      is_active = true
		returning id`,
		tenantID, partnerID, previewEmail, displayName).Scan(&portalUserID)
	if err != nil {
		return 0, err
	}
	return portalUserID, nil
}

func lookupElevatedStaffTenant(ctx context.Context, pool *pgxpool.Pool, email string) (tenantID int64, displayName string, ok bool, err error) {
	elevated := auth.IsPlatformConsoleEmail(email)
	var isOwner, isSuper bool
	err = pool.QueryRow(ctx, `
		select u.tenant_id,
		       coalesce(nullif(trim(u.full_name), ''), u.email),
		       (t.owner_user_id = u.id),
		       (coalesce(pu.is_active, false) and pu.role = 'superadmin')
		from public.users u
		join public.tenants t on t.id = u.tenant_id
		left join public.platform_users pu on pu.auth_user_id = u.auth_user_id
		where lower(u.email) = $1
		  and u.status = 'active'
		  and t.status not in ('suspended', 'cancelled', 'pending_approval')
		order by
		  (coalesce(pu.is_active, false) and pu.role = 'superadmin') desc,
		  (t.owner_user_id = u.id) desc,
		  u.id asc
		limit 1`, email).Scan(&tenantID, &displayName, &isOwner, &isSuper)
	if errors.Is(err, pgx.ErrNoRows) {
		if !elevated {
			return 0, "", false, nil
		}
		// Console email with no user row yet — try BLUEARM operator tenant.
		err = pool.QueryRow(ctx, `
			select id from public.tenants
			where upper(company_code) = 'BLUEARM'
			order by id asc limit 1`).Scan(&tenantID)
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, "", false, nil
		}
		if err != nil {
			return 0, "", false, err
		}
		return tenantID, email, true, nil
	}
	if err != nil {
		return 0, "", false, err
	}
	if elevated || isOwner || isSuper {
		return tenantID, displayName, true, nil
	}
	return 0, "", false, nil
}

func lookupPortalPreviewPartner(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (int64, error) {
	var partnerID int64
	// Prefer an open Sample HR client so staff preview lands on seeded portal data.
	err := pool.QueryRow(ctx, `
		select c.partner_id
		from public.hr_clients c
		join public.hr_sample_rows r
		  on r.row_id = c.id and r.table_name = 'hr_clients'
		join public.hr_sample_batches b
		  on b.id = r.batch_id and b.tenant_id = c.tenant_id and b.retracted_at is null
		where c.tenant_id = $1
		order by c.id asc
		limit 1`, tenantID).Scan(&partnerID)
	if err == nil {
		return partnerID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}
	err = pool.QueryRow(ctx, `
		select c.partner_id from public.hr_clients c
		where c.tenant_id = $1
		order by c.id asc limit 1`, tenantID).Scan(&partnerID)
	if err == nil {
		return partnerID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}
	err = pool.QueryRow(ctx, `
		select id from public.inv_partners
		where tenant_id = $1
		order by id asc limit 1`, tenantID).Scan(&partnerID)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, errNoPortalPartner
	}
	return partnerID, err
}
