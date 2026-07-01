package portal

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type contextKey string

const PortalUserContextKey contextKey = "portalUser"

type PortalUser struct {
	ID          int64
	TenantID    int64
	PartnerID   int64
	Email       string
	DisplayName string
}

func FromContext(ctx context.Context) (PortalUser, bool) {
	v, ok := ctx.Value(PortalUserContextKey).(PortalUser)
	return v, ok
}

func MagicLinkMiddleware(pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
			ctx := context.WithValue(r.Context(), PortalUserContextKey, pu)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func portalToken(r *http.Request) string {
	if t := strings.TrimSpace(r.URL.Query().Get("token")); t != "" {
		return t
	}
	if t := strings.TrimSpace(r.Header.Get("X-Portal-Token")); t != "" {
		return t
	}
	return ""
}

func resolveMagicLink(ctx context.Context, pool *pgxpool.Pool, token string) (PortalUser, error) {
	var pu PortalUser
	err := pool.QueryRow(ctx, `
		select u.id, u.tenant_id, u.partner_id, u.email, u.display_name
		from public.portal_magic_links ml
		join public.portal_users u on u.id = ml.portal_user_id
		where ml.token = $1
		  and ml.expires_at > now()
		  and u.is_active = true`,
		token).Scan(&pu.ID, &pu.TenantID, &pu.PartnerID, &pu.Email, &pu.DisplayName)
	return pu, err
}

func newMagicToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func createMagicLink(ctx context.Context, pool *pgxpool.Pool, portalUserID int64, ttl time.Duration) (string, time.Time, error) {
	token, err := newMagicToken()
	if err != nil {
		return "", time.Time{}, err
	}
	expires := time.Now().Add(ttl)
	_, err = pool.Exec(ctx, `
		insert into public.portal_magic_links (portal_user_id, token, expires_at)
		values ($1, $2, $3)`,
		portalUserID, token, expires)
	return token, expires, err
}
