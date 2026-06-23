package auth

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type contextKey string

const UserContextKey contextKey = "tenantUser"

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
	permissions               map[string]string
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

			user, err := resolveTenantUser(r.Context(), pool, claims.Sub)
			if err != nil {
				if errorsIsNoProfile(err) && claims.Email != "" {
					linkErr := tryAutoLinkProvisionedUser(r.Context(), pool, claims.Sub, claims.Email)
					if linkErr == nil {
						user, err = resolveTenantUser(r.Context(), pool, claims.Sub)
					} else if linkErr == ErrAmbiguousInvite {
						response.Err(w, http.StatusForbidden,
							"This email is invited on multiple tenants. Contact your administrator.",
							"ERR_FORBIDDEN")
						return
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
					if repaired, reloadErr := resolveTenantUser(r.Context(), pool, claims.Sub); reloadErr == nil {
						user = repaired
					}
				}
			}

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

func resolveTenantUser(ctx context.Context, pool *pgxpool.Pool, authUserID string) (TenantUser, error) {
	if cached, rev, ok := cacheGet(authUserID); ok {
		current, err := currentAuthRevision(ctx, pool, authUserID)
		if err == nil && current == rev {
			return cached, nil
		}
		InvalidateUser(authUserID)
	}
	user, err := loadTenantUser(ctx, pool, authUserID)
	if err != nil {
		return TenantUser{}, err
	}
	cacheSet(authUserID, user, user.AuthRevision)
	return user, nil
}

func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
}

func loadTenantUser(ctx context.Context, pool *pgxpool.Pool, authUserID string) (TenantUser, error) {
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
		where u.auth_user_id = $1::uuid
		  and u.status = 'active'
		  and t.status not in ('suspended', 'cancelled')
		limit 1`
	var tu TenantUser
	tu.AuthUserID = authUserID
	var canFormSettings, canManageUsers, canViewActivityLogs, canViewCrm, canManageCrmRules bool
	var canViewAllCrm, canManageSalesTeam, canViewCrmAnalytics bool
	err := pool.QueryRow(ctx, q, authUserID).Scan(
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
