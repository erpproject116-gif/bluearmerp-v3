package auth

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const (
	rolePreviewDefaultTTL = 60 * time.Minute
	rolePreviewExtendTTL  = 30 * time.Minute
	rolePreviewMaxTTL     = 120 * time.Minute
)

// RegisterRolePreviewRoutes mounts start/extend/end under /auth/role-preview*.
func RegisterRolePreviewRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Post("/auth/role-preview", startRolePreview(pool))
	r.Post("/auth/role-preview/extend", extendRolePreview(pool))
	r.Post("/auth/role-preview/end", endRolePreview(pool))
}

func isOwnerEquivalentRole(code string) bool {
	switch strings.ToLower(strings.TrimSpace(code)) {
	case "owner", "store_owner":
		return true
	default:
		return false
	}
}

func canStartRolePreviewReal(tu TenantUser) bool {
	if tu.RolePreviewActive {
		return tu.RealIsTenantOwner || tu.RealIsPlatformSuperadmin
	}
	return tu.IsTenantOwner || tu.IsPlatformSuperadmin || isBootstrapSuperadminEmail(tu.Email)
}

// rolePreviewIdentitySnap captures pre-overlay identity so soft-fail can restore it.
type rolePreviewIdentitySnap struct {
	isTenantOwner        bool
	isPlatformSuperadmin bool
	tenantRole           string
	platformRole         string
	platformPermissions  map[string]bool
	homeLocationID       int64
	canFormSettings      bool
	canManageUsers       bool
	canViewActivityLogs  bool
	canViewCrm           bool
	canManageCrmRules    bool
	canViewAllCrm        bool
	canManageSalesTeam   bool
	canViewCrmAnalytics  bool
	applyUserScopes      bool
	isStoreAdmin         bool
	permissions          map[string]string
	submitPerms          map[string]bool
	canStartRolePreview  bool
}

func snapshotRolePreviewIdentity(tu *TenantUser) rolePreviewIdentitySnap {
	return rolePreviewIdentitySnap{
		isTenantOwner:        tu.IsTenantOwner,
		isPlatformSuperadmin: tu.IsPlatformSuperadmin,
		tenantRole:           tu.TenantRole,
		platformRole:         tu.PlatformRole,
		platformPermissions:  tu.PlatformPermissions,
		homeLocationID:       tu.HomeLocationID,
		canFormSettings:      tu.canManageFormSettingsRole,
		canManageUsers:       tu.canManageUsersRole,
		canViewActivityLogs:  tu.canViewActivityLogsRole,
		canViewCrm:           tu.canViewCrmRole,
		canManageCrmRules:    tu.canManageCrmRulesRole,
		canViewAllCrm:        tu.canViewAllCrmRole,
		canManageSalesTeam:   tu.canManageSalesTeamRole,
		canViewCrmAnalytics:  tu.canViewCrmAnalyticsRole,
		applyUserScopes:      tu.ApplyUserScopes,
		isStoreAdmin:         tu.IsStoreAdmin,
		permissions:          tu.permissions,
		submitPerms:          tu.submitPerms,
		canStartRolePreview:  tu.CanStartRolePreview,
	}
}

func restoreRolePreviewIdentity(tu *TenantUser, snap rolePreviewIdentitySnap) {
	tu.IsTenantOwner = snap.isTenantOwner
	tu.IsPlatformSuperadmin = snap.isPlatformSuperadmin
	tu.TenantRole = snap.tenantRole
	tu.PlatformRole = snap.platformRole
	tu.PlatformPermissions = snap.platformPermissions
	tu.HomeLocationID = snap.homeLocationID
	tu.canManageFormSettingsRole = snap.canFormSettings
	tu.canManageUsersRole = snap.canManageUsers
	tu.canViewActivityLogsRole = snap.canViewActivityLogs
	tu.canViewCrmRole = snap.canViewCrm
	tu.canManageCrmRulesRole = snap.canManageCrmRules
	tu.canViewAllCrmRole = snap.canViewAllCrm
	tu.canManageSalesTeamRole = snap.canManageSalesTeam
	tu.canViewCrmAnalyticsRole = snap.canViewCrmAnalytics
	tu.ApplyUserScopes = snap.applyUserScopes
	tu.IsStoreAdmin = snap.isStoreAdmin
	tu.permissions = snap.permissions
	tu.submitPerms = snap.submitPerms
	tu.CanStartRolePreview = snap.canStartRolePreview
	tu.RolePreviewActive = false
	tu.RolePreviewRoleCode = ""
	tu.RolePreviewHomeLocationID = 0
	tu.RolePreviewExpiresAt = nil
	tu.RealIsTenantOwner = false
	tu.RealIsPlatformSuperadmin = false
	tu.RealTenantRole = ""
}

// abortRolePreviewSoftFail clears DB preview state, restores real identity, and never fails the request.
func abortRolePreviewSoftFail(ctx context.Context, pool *pgxpool.Pool, tu *TenantUser, snap rolePreviewIdentitySnap, code string, cause error) {
	log.Printf("auth: role preview overlay soft-fail user=%d tenant=%d role=%s: %v",
		tu.AppUserID, tu.TenantID, code, cause)
	if err := clearRolePreviewDB(ctx, pool, tu.AppUserID); err != nil {
		log.Printf("auth: role preview soft-fail clear: user=%d: %v", tu.AppUserID, err)
	}
	if err := BumpUserRevision(ctx, pool, tu.AppUserID); err != nil {
		log.Printf("auth: role preview soft-fail bump: user=%d: %v", tu.AppUserID, err)
	}
	restoreRolePreviewIdentity(tu, snap)
}

// applyRolePreviewOverlay applies DB preview columns onto tu (per-request).
// Call after applyBootstrapOwnerFlags. Mutates tu in place.
// Soft-fails on overlay errors: clears preview, restores real identity, returns nil
// so middleware never bricks /auth/me or lifecycle routes.
func applyRolePreviewOverlay(ctx context.Context, pool *pgxpool.Pool, tu *TenantUser) error {
	if tu == nil || tu.AppUserID <= 0 || tu.PlatformOnly {
		return nil
	}

	var roleCode *string
	var homeID *int64
	var startedAt, expiresAt *time.Time
	err := pool.QueryRow(ctx, `
		select role_preview_role_code, role_preview_home_location_id,
		       role_preview_started_at, role_preview_expires_at
		from public.users where id = $1`, tu.AppUserID).
		Scan(&roleCode, &homeID, &startedAt, &expiresAt)
	if err != nil {
		// Do not brick the session if preview columns cannot be read.
		log.Printf("auth: role preview overlay read soft-fail user=%d: %v", tu.AppUserID, err)
		return nil
	}

	// Starter capability from real (pre-overlay) identity.
	tu.CanStartRolePreview = tu.IsTenantOwner || tu.IsPlatformSuperadmin || isBootstrapSuperadminEmail(tu.Email)

	if roleCode == nil || strings.TrimSpace(*roleCode) == "" {
		return nil
	}
	code := strings.TrimSpace(*roleCode)
	if expiresAt != nil && expiresAt.Before(time.Now().UTC()) {
		_ = clearRolePreviewDB(ctx, pool, tu.AppUserID)
		_ = BumpUserRevision(ctx, pool, tu.AppUserID)
		return nil
	}

	snap := snapshotRolePreviewIdentity(tu)

	tu.RealIsTenantOwner = tu.IsTenantOwner
	tu.RealIsPlatformSuperadmin = tu.IsPlatformSuperadmin
	tu.RealTenantRole = tu.TenantRole
	tu.RolePreviewActive = true
	tu.RolePreviewRoleCode = code
	tu.RolePreviewExpiresAt = expiresAt
	tu.CanStartRolePreview = false

	// Effective identity: strip owner/platform power (R1/R4/R9/R10).
	tu.IsTenantOwner = false
	tu.IsPlatformSuperadmin = false
	tu.TenantRole = code
	tu.PlatformPermissions = nil
	tu.PlatformRole = ""

	if err := reloadTenantRoleFlags(ctx, pool, tu); err != nil {
		abortRolePreviewSoftFail(ctx, pool, tu, snap, code, err)
		return nil
	}
	if homeID != nil && *homeID > 0 {
		tu.HomeLocationID = *homeID
		tu.RolePreviewHomeLocationID = *homeID
	}
	// Reload perms for preview role; skip overrides (R3).
	tu.permissions = nil
	tu.submitPerms = nil
	if err := loadEffectivePermissions(ctx, pool, tu); err != nil {
		abortRolePreviewSoftFail(ctx, pool, tu, snap, code, err)
		return nil
	}
	return nil
}

func reloadTenantRoleFlags(ctx context.Context, pool *pgxpool.Pool, tu *TenantUser) error {
	var canFormSettings, canManageUsers, canViewActivityLogs, canViewCrm, canManageCrmRules bool
	var canViewAllCrm, canManageSalesTeam, canViewCrmAnalytics, applyUserScopes bool
	err := pool.QueryRow(ctx, `
		select
		  coalesce(can_manage_form_settings, false),
		  coalesce(can_manage_users, false),
		  coalesce(can_view_activity_logs, false),
		  coalesce(can_view_crm, false),
		  coalesce(can_manage_crm_rules, false),
		  coalesce(can_view_all_crm, false),
		  coalesce(can_manage_sales_team, false),
		  coalesce(can_view_crm_analytics, false),
		  coalesce(apply_user_scopes, false)
		from public.tenant_roles
		where tenant_id = $1 and role_code = $2 and is_active = true`,
		tu.TenantID, tu.TenantRole).Scan(
		&canFormSettings, &canManageUsers, &canViewActivityLogs, &canViewCrm, &canManageCrmRules,
		&canViewAllCrm, &canManageSalesTeam, &canViewCrmAnalytics, &applyUserScopes,
	)
	if err != nil {
		return err
	}
	tu.canManageFormSettingsRole = canFormSettings
	tu.canManageUsersRole = canManageUsers
	tu.canViewActivityLogsRole = canViewActivityLogs
	tu.canViewCrmRole = canViewCrm
	tu.canManageCrmRulesRole = canManageCrmRules
	tu.canViewAllCrmRole = canViewAllCrm
	tu.canManageSalesTeamRole = canManageSalesTeam
	tu.canViewCrmAnalyticsRole = canViewCrmAnalytics
	tu.ApplyUserScopes = applyUserScopes
	tu.IsStoreAdmin = tu.CanManageFormSettings()
	return nil
}

func clearRolePreviewDB(ctx context.Context, pool *pgxpool.Pool, appUserID int64) error {
	_, err := pool.Exec(ctx, `
		update public.users set
		  role_preview_role_code = null,
		  role_preview_home_location_id = null,
		  role_preview_started_at = null,
		  role_preview_expires_at = null,
		  updated_at = now()
		where id = $1`, appUserID)
	return err
}

type rolePreviewStartBody struct {
	RoleCode       string `json:"role_code"`
	HomeLocationID *int64 `json:"home_location_id"`
	TTLMinutes     *int   `json:"ttl_minutes"`
}

func startRolePreview(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		if !canStartRolePreviewReal(tu) {
			response.Err(w, http.StatusForbidden, "Only owners and platform superadmins can start role preview.", "ERR_FORBIDDEN")
			return
		}
		if tu.SupportSessionID > 0 {
			response.Err(w, http.StatusConflict, "End the support session before starting role preview.", "ERR_CONFLICT")
			return
		}
		if tu.RolePreviewActive {
			response.Err(w, http.StatusConflict, "Role preview is already active. End it first.", "ERR_CONFLICT")
			return
		}

		var body rolePreviewStartBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		code := strings.TrimSpace(body.RoleCode)
		if code == "" {
			response.Validation(w, map[string]string{"role_code": "Role is required."})
			return
		}
		if isOwnerEquivalentRole(code) {
			response.Validation(w, map[string]string{"role_code": "Cannot preview an owner-equivalent role."})
			return
		}
		var roleOK bool
		_ = pool.QueryRow(r.Context(), `
			select exists(
			  select 1 from public.tenant_roles
			  where tenant_id = $1 and role_code = $2 and is_active = true
			)`, tu.TenantID, code).Scan(&roleOK)
		if !roleOK {
			response.Validation(w, map[string]string{"role_code": "Unknown or inactive role for this business."})
			return
		}

		var homeID *int64
		if body.HomeLocationID != nil && *body.HomeLocationID > 0 {
			var locOK bool
			_ = pool.QueryRow(r.Context(), `
				select exists(
				  select 1 from public.inv_locations
				  where id = $1 and tenant_id = $2 and deleted_at is null and status = 'active'
				    and coalesce(is_rma, false) = false
				    and coalesce(location_type, 'location') <> 'in_transit'
				)`, *body.HomeLocationID, tu.TenantID).Scan(&locOK)
			if !locOK {
				response.Validation(w, map[string]string{"home_location_id": "Invalid home location."})
				return
			}
			homeID = body.HomeLocationID
		}

		ttl := rolePreviewDefaultTTL
		if body.TTLMinutes != nil && *body.TTLMinutes > 0 {
			ttl = time.Duration(*body.TTLMinutes) * time.Minute
			if ttl > rolePreviewMaxTTL {
				ttl = rolePreviewMaxTTL
			}
		}
		expires := time.Now().UTC().Add(ttl)

		_, err := pool.Exec(r.Context(), `
			update public.users set
			  role_preview_role_code = $2,
			  role_preview_home_location_id = $3,
			  role_preview_started_at = now(),
			  role_preview_expires_at = $4,
			  updated_at = now()
			where id = $1`, tu.AppUserID, code, homeID, expires)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start role preview.", "ERR_INTERNAL")
			return
		}
		_ = BumpUserRevision(r.Context(), pool, tu.AppUserID)
		log.Printf("auth.role_preview.start tenant=%d user=%d role=%s expires=%s", tu.TenantID, tu.AppUserID, code, expires.Format(time.RFC3339))
		response.OK(w, map[string]any{
			"role_code":        code,
			"home_location_id": homeID,
			"expires_at":       expires.Format(time.RFC3339),
		}, "Role preview started.")
	}
}

func extendRolePreview(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		if !tu.RolePreviewActive || !canStartRolePreviewReal(tu) {
			response.Err(w, http.StatusForbidden, "No active role preview to extend.", "ERR_FORBIDDEN")
			return
		}
		base := time.Now().UTC()
		if tu.RolePreviewExpiresAt != nil && tu.RolePreviewExpiresAt.After(base) {
			base = *tu.RolePreviewExpiresAt
		}
		expires := base.Add(rolePreviewExtendTTL)
		tag, err := pool.Exec(r.Context(), `
			update public.users set role_preview_expires_at = $2, updated_at = now()
			where id = $1 and role_preview_role_code is not null`, tu.AppUserID, expires)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusConflict, "Could not extend role preview.", "ERR_CONFLICT")
			return
		}
		_ = BumpUserRevision(r.Context(), pool, tu.AppUserID)
		log.Printf("auth.role_preview.extend tenant=%d user=%d expires=%s", tu.TenantID, tu.AppUserID, expires.Format(time.RFC3339))
		response.OK(w, map[string]any{"expires_at": expires.Format(time.RFC3339)}, "Role preview extended.")
	}
}

func endRolePreview(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		// Always allow clearing own preview columns (idempotent escape hatch).
		// Soft-fail overlay may leave RolePreviewActive=false while DB still has columns;
		// owners/superadmins may also end after soft-restore. Never require a successful overlay.
		if err := clearRolePreviewDB(r.Context(), pool, tu.AppUserID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to end role preview.", "ERR_INTERNAL")
			return
		}
		_ = BumpUserRevision(r.Context(), pool, tu.AppUserID)
		log.Printf("auth.role_preview.end tenant=%d user=%d role=%s", tu.TenantID, tu.AppUserID, tu.RolePreviewRoleCode)
		response.OK(w, map[string]any{"active": false}, "Role preview ended.")
	}
}

// rolePreviewMutatingAllowed reports whether a mutating request may proceed under preview.
func rolePreviewMutatingAllowed(method, path string) bool {
	m := strings.ToUpper(strings.TrimSpace(method))
	if m == "GET" || m == "HEAD" || m == "OPTIONS" {
		return true
	}
	p := strings.TrimSuffix(path, "/")
	switch p {
	case "/api/v1/auth/role-preview/end",
		"/api/v1/auth/role-preview/extend",
		"/api/v1/auth/session-ended":
		return true
	default:
		// Notification mark-read is a common poller side-effect.
		if strings.HasSuffix(p, "/mark-read") || strings.HasSuffix(p, "/read") {
			if strings.Contains(p, "/crm/") || strings.Contains(p, "/notifications") {
				return true
			}
		}
		return false
	}
}
