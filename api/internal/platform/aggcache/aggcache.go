// Package aggcache is the process-local cache for tenant aggregate reads
// (dashboards, books health, CRM summary). There is no shared L2 tier.
// DASHBOARD_CACHE_TTL_SECONDS=0 disables every cache in this package.
package aggcache

import (
	"os"
	"strconv"
	"strings"
	"sync"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/ttlcache"
	"golang.org/x/sync/singleflight"
)

// shortTTL defaults to 30s. trendTTL defaults to 60s.
// Both read DASHBOARD_CACHE_TTL_SECONDS, so 0 disables them and any other
// explicit value overrides both defaults.
var (
	shortTTL = ttlcache.New[any]("DASHBOARD_CACHE_TTL_SECONDS", 30, 20000)
	trendTTL = ttlcache.New[any]("DASHBOARD_CACHE_TTL_SECONDS", 60, 20000)
	flight   singleflight.Group
	mu       sync.Mutex
)

func disabled() bool {
	return strings.TrimSpace(os.Getenv("DASHBOARD_CACHE_TTL_SECONDS")) == "0"
}

func bucket(longLived bool) *ttlcache.Cache[any] {
	if longLived {
		return trendTTL
	}
	return shortTTL
}

// Key builds a tenant-scoped cache key. Extra distinguishes query params or a user scope.
func Key(tenantID int64, kind, extra string) string {
	return strconv.FormatInt(tenantID, 10) + "|" + kind + "|" + extra
}

// Load returns a cached successful value or calls load once per key.
// Errors are not stored.
func Load[T any](key string, longLived bool, load func() (T, error)) (T, error) {
	var zero T
	if disabled() {
		return load()
	}
	c := bucket(longLived)
	if v, ok := c.Get(key); ok {
		if typed, ok := v.(T); ok {
			return typed, nil
		}
	}
	v, err, _ := flight.Do(key, func() (any, error) {
		if v, ok := c.Get(key); ok {
			if typed, ok := v.(T); ok {
				return typed, nil
			}
		}
		loaded, err := load()
		if err != nil {
			return nil, err
		}
		c.Set(key, loaded)
		return loaded, nil
	})
	if err != nil {
		return zero, err
	}
	typed, ok := v.(T)
	if !ok {
		return zero, nil
	}
	return typed, nil
}

// InvalidateTenant drops every aggregate cached for a tenant.
func InvalidateTenant(tenantID int64) {
	if tenantID <= 0 {
		return
	}
	prefix := strconv.FormatInt(tenantID, 10) + "|"
	mu.Lock()
	defer mu.Unlock()
	shortTTL.InvalidatePrefix(prefix)
	trendTTL.InvalidatePrefix(prefix)
}

// Reset clears both caches (tests).
func Reset() {
	shortTTL.Reset()
	trendTTL.Reset()
}
