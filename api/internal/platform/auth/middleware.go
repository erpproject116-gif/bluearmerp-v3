package auth

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type contextKey string

const UserContextKey contextKey = "tenantUser"

type TenantUser struct {
	AuthUserID            string
	AppUserID             int64
	TenantID              int64
	Email                 string
	FullName              string
	IsPlatformSuperadmin  bool
	IsTenantOwner         bool
	IsStoreAdmin          bool
	AutoEnableAllModules  bool
}

type Claims struct {
	Sub string `json:"sub"`
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

			user, err := loadTenantUser(r.Context(), pool, claims.Sub)
			if err != nil {
				response.Err(w, http.StatusForbidden, "No tenant profile for this account.", "ERR_FORBIDDEN")
				return
			}

			ctx := context.WithValue(r.Context(), UserContextKey, user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func FromContext(ctx context.Context) (TenantUser, bool) {
	u, ok := ctx.Value(UserContextKey).(TenantUser)
	return u, ok
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
		  coalesce(pu.is_active, false) and pu.role = 'superadmin',
		  t.owner_user_id = u.id,
		  u.tenant_role = 'store_admin',
		  t.auto_enable_all_modules
		from public.users u
		join public.tenants t on t.id = u.tenant_id
		left join public.platform_users pu on pu.auth_user_id = u.auth_user_id
		where u.auth_user_id = $1::uuid
		  and u.status = 'active'
		  and t.status not in ('suspended', 'cancelled')
		limit 1`
	var tu TenantUser
	tu.AuthUserID = authUserID
	err := pool.QueryRow(ctx, q, authUserID).Scan(
		&tu.AppUserID,
		&tu.TenantID,
		&tu.Email,
		&tu.FullName,
		&tu.IsPlatformSuperadmin,
		&tu.IsTenantOwner,
		&tu.IsStoreAdmin,
		&tu.AutoEnableAllModules,
	)
	return tu, err
}
