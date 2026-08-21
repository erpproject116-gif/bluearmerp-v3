package middleware

import (
	"fmt"
	"net/http"
	"time"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/config"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/ratelimit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

var (
	publicLimiter        *ratelimit.FixedWindow
	authenticatedLimiter *ratelimit.FixedWindow
	expensiveLimiter     *ratelimit.FixedWindow
	rateLimitCfg         config.RateLimitConfig
)

func configureRateLimit(cfg config.RateLimitConfig) {
	if publicLimiter != nil && rateLimitCfg.Enabled == cfg.Enabled {
		rateLimitCfg = cfg
		return
	}
	rateLimitCfg = cfg
	window := time.Duration(cfg.WindowSeconds) * time.Second
	publicLimiter = ratelimit.NewFixedWindow(window)
	authenticatedLimiter = ratelimit.NewFixedWindow(window)
	expensiveLimiter = ratelimit.NewFixedWindow(window)
}

func denyRateLimit(w http.ResponseWriter) {
	w.Header().Set("Retry-After", "60")
	response.Err(w, http.StatusTooManyRequests,
		"Too many requests. Please try again later.", "ERR_RATE_LIMITED")
}

func limitForTier(tier ratelimit.Tier) (int, string) {
	switch tier {
	case ratelimit.TierPublicStrict:
		return rateLimitCfg.PublicStrictRPM, "public_strict"
	case ratelimit.TierPublicProvision:
		return rateLimitCfg.PublicProvisionRPM, "public_provision"
	case ratelimit.TierExpensive:
		return rateLimitCfg.ExpensiveRPM, "expensive"
	case ratelimit.TierAuthenticated:
		return rateLimitCfg.AuthenticatedRPM, "authenticated"
	default:
		return rateLimitCfg.AuthenticatedRPM, "default"
	}
}

// RateLimitPublic limits unauthenticated public endpoints by IP.
func RateLimitPublic(cfg config.RateLimitConfig) func(http.Handler) http.Handler {
	configureRateLimit(cfg)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !cfg.Enabled {
				next.ServeHTTP(w, r)
				return
			}
			tier := ratelimit.TierForPath(r.Method, r.URL.Path)
			if tier != ratelimit.TierPublicStrict && tier != ratelimit.TierPublicProvision {
				next.ServeHTTP(w, r)
				return
			}
			limit, bucket := limitForTier(tier)
			key := fmt.Sprintf("%d:%s:%s", tier, bucket, ratelimit.ClientIP(r))
			if !publicLimiter.Allow(key, limit) {
				denyRateLimit(w)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RateLimitProtected limits authenticated API traffic by user and tenant.
func RateLimitProtected(cfg config.RateLimitConfig) func(http.Handler) http.Handler {
	configureRateLimit(cfg)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !cfg.Enabled {
				next.ServeHTTP(w, r)
				return
			}
			tier := ratelimit.TierForPath(r.Method, r.URL.Path)
			if tier != ratelimit.TierAuthenticated && tier != ratelimit.TierExpensive {
				next.ServeHTTP(w, r)
				return
			}
			tu, ok := auth.FromContext(r.Context())
			if !ok {
				next.ServeHTTP(w, r)
				return
			}
			limit, bucket := limitForTier(tier)
			key := fmt.Sprintf("%d:%s:u%d:t%d", tier, bucket, tu.AppUserID, tu.TenantID)
			var allowed bool
			if tier == ratelimit.TierExpensive {
				allowed = expensiveLimiter.Allow(key, limit)
			} else {
				allowed = authenticatedLimiter.Allow(key, limit)
			}
			if !allowed {
				denyRateLimit(w)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
