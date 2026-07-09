package auth

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customerregistry"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type contextKey string

const UserContextKey contextKey = "tenantUser"

// ActiveTenantHeader lets a multi-tenant user pick which business a request targets.
const ActiveTenantHeader = "X-Tenant-ID"

type TenantUser struct {
	AuthUserID               string
	AppUserID                int64
	TenantID                 int64
	Email                    string
	FullName                 string
	TenantRole               string
	IsPlatformSuperadmin     bool
	IsTenantOwner            bool
	IsStoreAdmin             bool
	canManageUsersRole        bool
	canManageFormSettingsRole bool
	canViewActivityLogsRole   bool
	canViewCrmRole            bool
	canManageCrmRulesRole     bool
	canViewAllCrmRole         bool
	canManageSalesTeamRole    bool
	canViewCrmAnalyticsRole   bool
	AutoEnableAllModules      bool
	AuthRevision              int64
	ActiveBranchID            int64
	permissions               map[string]string
	submitPerms               map[string]bool
}

type Claims struct {
	Sub   string `json:"sub"`
	Email string `json:"email"`
	jwt.RegisteredClaims
}

func Middleware(pool *pgxpool.Pool, supabaseURL, jwtSecret string) func(http.Handler) http.Handler {
	validator, err := getValidator(supabaseURL, jwtSecret)
	if err != nil {
		panic(fmt.Sprintf("auth: %v", err))
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tokenStr := bearerToken(r)
			if tokenStr == "" {
				response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
				return
			}

			claims, err := validator.Parse(tokenStr)
			if err != nil {
				response.Err(w, http.StatusUnauthorized, "Invalid token.", "ERR_UNAUTHORIZED")
				return
			}

			if !isSessionIdleExemptPath(r.URL.Path) {
				if err := enforceSessionActivity(r.Context(), pool, claims.Sub, shouldBumpSessionActivity(r)); err != nil {
					if errors.Is(err, ErrSessionIdle) {
						response.Err(w, http.StatusUnauthorized,
							"Session expired due to inactivity. Please sign in again.",
							"ERR_SESSION_IDLE")
						return
					}
					log.Printf("auth: session activity(%s): %v", claims.Sub, err)
					response.Err(w, http.StatusInternalServerError, "Failed to verify session.", "ERR_INTERNAL")
					return
				}
			}

			activeTenantID := parseActiveTenantHeader(r)

			user, err := resolveTenantUser(r.Context(), pool, claims.Sub, activeTenantID)
			if err != nil {
				if errorsIsNoProfile(err) && claims.Email != "" {
					linkErr := tryAutoLinkProvisionedUser(r.Context(), pool, claims.Sub, claims.Email)
					if linkErr == nil {
						user, err = resolveTenantUser(r.Context(), pool, claims.Sub, activeTenantID)
						if err == nil {
							leadgenCode := os.Getenv("DEMO_LEADGEN_TENANT_CODE")
							if leadgenCode == "" {
								leadgenCode = "BLUEARM"
							}
							if leadgenID, ok := customerregistry.LeadgenTenantID(r.Context(), pool, leadgenCode); ok {
								_ = customerregistry.EnsureCustomerForLinkedUser(
									r.Context(), pool, leadgenID,
									claims.Sub, claims.Email, user.FullName,
									customerregistry.EntryInvite, user.TenantID)
							}
						}
					}
				}
			}
			if err != nil {
				if errorsIsNoProfile(err) {
					response.Err(w, http.StatusForbidden,
						"No tenant profile for this account. Ask an administrator to invite you, then sign in with Google using the invited email.",
						"ERR_FORBIDDEN")
					return
				}
				log.Printf("auth: loadTenantUser(%s): %v", claims.Sub, err)
				response.Err(w, http.StatusInternalServerError,
					"Database error during sign-in. Ensure migrations 001–012 are applied on the API database.",
					"ERR_INTERNAL")
				return
			}

			needsBootstrapRepair := isBootstrapSuperadminEmail(user.Email) &&
				(!user.IsPlatformSuperadmin ||
					(normalizeEmail(user.Email) == "bluearmph@gmail.com" && !user.IsTenantOwner))
			if needsBootstrapRepair {
				if repairErr := repairBootstrapPlatformAccess(r.Context(), pool, user); repairErr == nil {
					InvalidateUser(claims.Sub)
					if repaired, reloadErr := resolveTenantUser(r.Context(), pool, claims.Sub, activeTenantID); reloadErr == nil {
						user = repaired
					}
				}
			}

			user.ActiveBranchID = resolveActiveBranchID(r.Context(), pool, user, parseActiveBranchHeader(r))

			ctx := context.WithValue(r.Context(), UserContextKey, user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func errorsIsNoProfile(err error) bool {
	return err == ErrNoTenantProfile || err == pgx.ErrNoRows
}

func FromContext(ctx context.Context) (TenantUser, bool) {
	u, ok := ctx.Value(UserContextKey).(TenantUser)
	return u, ok
}

// parseActiveTenantHeader reads the requested business from X-Tenant-ID. 0 means
// "unspecified" — resolution then falls back to the saved default, else lowest tenant.
func parseActiveTenantHeader(r *http.Request) int64 {
	raw := strings.TrimSpace(r.Header.Get(ActiveTenantHeader))
	if raw == "" {
		return 0
	}
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || id < 0 {
		return 0
	}
	return id
}

func resolveTenantUser(ctx context.Context, pool *pgxpool.Pool, authUserID string, tenantID int64) (TenantUser, error) {
	key := cacheKey(authUserID, tenantID)
	if cached, rev, ok := cacheGet(key); ok {
		current, err := currentAuthRevision(ctx, pool, authUserID, cached.TenantID)
		if err == nil && current == rev {
			return cached, nil
		}
		InvalidateUser(authUserID)
	}
	user, err := loadTenantUser(ctx, pool, authUserID, tenantID)
	if err != nil {
		return TenantUser{}, err
	}
	cacheSet(key, user, user.AuthRevision)
	return user, nil
}

func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
}

func loadTenantUser(ctx context.Context, pool *pgxpool.Pool, authUserID string, tenantID int64) (TenantUser, error) {
	// A single query resolves the active business with a natural fallback order:
	// (1) the requested tenant ($2) if it is a real membership, else
	// (2) the user's saved default (user_active_tenant), else
	// (3) the lowest tenant_id. This can only ever select a genuine membership row,
	// so a stale/forged X-Tenant-ID degrades gracefully instead of locking the user out.
	const q = `
		select
		  u.id,
		  u.tenant_id,
		  u.email,
		  u.full_name,
		  u.tenant_role,
		  coalesce(pu.is_active, false) and pu.role = 'superadmin',
		  t.owner_user_id = u.id,
		  coalesce(tr.can_manage_form_settings, false),
		  coalesce(tr.can_manage_users, false),
		  coalesce(tr.can_view_activity_logs, false),
		  coalesce(tr.can_view_crm, false),
		  coalesce(tr.can_manage_crm_rules, false),
		  coalesce(tr.can_view_all_crm, false),
		  coalesce(tr.can_manage_sales_team, false),
		  coalesce(tr.can_view_crm_analytics, false),
		  t.auto_enable_all_modules,
		  u.auth_revision
		from public.users u
		join public.tenants t on t.id = u.tenant_id
		left join public.tenant_roles tr
		  on tr.tenant_id = u.tenant_id and tr.role_code = u.tenant_role and tr.is_active = true
		left join public.platform_users pu on pu.auth_user_id = u.auth_user_id
		left join public.user_active_tenant uat on uat.auth_user_id = u.auth_user_id
		where u.auth_user_id = $1::uuid
		  and u.status = 'active'
		  and t.status not in ('suspended', 'cancelled')
		order by
		  (case when u.tenant_id = $2 then 0 else 1 end),
		  (case when u.tenant_id = coalesce(uat.tenant_id, 0) then 0 else 1 end),
		  u.tenant_id
		limit 1`
	var tu TenantUser
	tu.AuthUserID = authUserID
	var canFormSettings, canManageUsers, canViewActivityLogs, canViewCrm, canManageCrmRules bool
	var canViewAllCrm, canManageSalesTeam, canViewCrmAnalytics bool
	err := pool.QueryRow(ctx, q, authUserID, tenantID).Scan(
		&tu.AppUserID,
		&tu.TenantID,
		&tu.Email,
		&tu.FullName,
		&tu.TenantRole,
		&tu.IsPlatformSuperadmin,
		&tu.IsTenantOwner,
		&canFormSettings,
		&canManageUsers,
		&canViewActivityLogs,
		&canViewCrm,
		&canManageCrmRules,
		&canViewAllCrm,
		&canManageSalesTeam,
		&canViewCrmAnalytics,
		&tu.AutoEnableAllModules,
		&tu.AuthRevision,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return TenantUser{}, ErrNoTenantProfile
		}
		return TenantUser{}, err
	}
	tu.canManageFormSettingsRole = canFormSettings
	tu.canManageUsersRole = canManageUsers
	tu.canViewActivityLogsRole = canViewActivityLogs
	tu.canViewCrmRole = canViewCrm
	tu.canManageCrmRulesRole = canManageCrmRules
	tu.canViewAllCrmRole = canViewAllCrm
	tu.canManageSalesTeamRole = canManageSalesTeam
	tu.canViewCrmAnalyticsRole = canViewCrmAnalytics
	tu.IsStoreAdmin = tu.CanManageFormSettings()
	if err := loadEffectivePermissions(ctx, pool, &tu); err != nil {
		return TenantUser{}, err
	}
	return tu, nil
}
