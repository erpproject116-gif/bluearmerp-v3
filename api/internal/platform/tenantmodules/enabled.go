// Package tenantmodules answers "is this module/feature turned on for this
// tenant?" behind a short process-local cache.
//
// It lives outside both the middleware and usermgmt packages so the gate
// (middleware) and the writer (Modules & Features settings) can share it
// without an import cycle.
package tenantmodules

import (
	"context"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/ttlcache"
)

// MODULE_CACHE_TTL_SECONDS=0 disables the cache and restores a DB read per check.
var cache = ttlcache.New[bool]("MODULE_CACHE_TTL_SECONDS", 30, 20000)

func key(tenantID int64, code string) string {
	return strconv.FormatInt(tenantID, 10) + "|" + code
}

func tenantPrefix(tenantID int64) string {
	return strconv.FormatInt(tenantID, 10) + "|"
}

// Enabled reports whether module/feature code is enabled for the tenant.
// Only successful lookups are cached; errors always fall through to the caller.
func Enabled(ctx context.Context, pool *pgxpool.Pool, tenantID int64, code string) (bool, error) {
	k := key(tenantID, code)
	if on, ok := cache.Get(k); ok {
		return on, nil
	}
	var enabled bool
	err := pool.QueryRow(ctx, `
		select coalesce(
		  (select tm.is_enabled from public.tenant_modules tm
		   where tm.tenant_id = $1 and tm.module_code = $2),
		  false
		)`, tenantID, code).Scan(&enabled)
	if err != nil {
		return false, err
	}
	cache.Set(k, enabled)
	return enabled, nil
}

// InvalidateTenant drops every cached module answer for a tenant. Call it after
// any write to tenant_modules; a toggle must take effect on the next request,
// not after the TTL.
func InvalidateTenant(tenantID int64) {
	cache.InvalidatePrefix(tenantPrefix(tenantID))
}

// Reset clears the whole cache (tests).
func Reset() { cache.Reset() }

// CacheEnabled reports whether answers are being cached.
func CacheEnabled() bool { return cache.Enabled() }
