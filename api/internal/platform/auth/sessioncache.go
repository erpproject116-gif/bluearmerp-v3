package auth

import (
	"os"
	"sync"
	"time"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/config"
)

type cacheEntry struct {
	user         TenantUser
	authRevision int64
	expiresAt    time.Time
}

var (
	cacheMu      sync.RWMutex
	cacheData    = map[string]cacheEntry{}
	cacheEnabled = true
	cacheTTL     = 30 * time.Second
	cacheMax     = 10000
)

func init() {
	if os.Getenv("AUTH_CACHE_ENABLED") == "false" {
		cacheEnabled = false
	}
	secs := config.ParseIntDefault(os.Getenv("AUTH_CACHE_TTL_SECONDS"), 30)
	if secs <= 0 {
		cacheEnabled = false
	} else {
		cacheTTL = time.Duration(secs) * time.Second
	}
	cacheMax = config.ParseIntDefault(os.Getenv("AUTH_CACHE_MAX_ENTRIES"), 10000)
}

func CacheEnabled() bool {
	return cacheEnabled
}

func cacheGet(authUserID string) (TenantUser, int64, bool) {
	if !cacheEnabled {
		return TenantUser{}, 0, false
	}
	cacheMu.RLock()
	e, ok := cacheData[authUserID]
	cacheMu.RUnlock()
	if !ok || time.Now().After(e.expiresAt) {
		if ok {
			cacheMu.Lock()
			delete(cacheData, authUserID)
			cacheMu.Unlock()
		}
		return TenantUser{}, 0, false
	}
	return e.user, e.authRevision, true
}

func cacheSet(authUserID string, user TenantUser, authRevision int64) {
	if !cacheEnabled {
		return
	}
	cacheMu.Lock()
	defer cacheMu.Unlock()
	if len(cacheData) >= cacheMax {
		evictOldestLocked()
	}
	cacheData[authUserID] = cacheEntry{
		user:         user,
		authRevision: authRevision,
		expiresAt:    time.Now().Add(cacheTTL),
	}
}

func evictOldestLocked() {
	var oldestKey string
	var oldest time.Time
	first := true
	for k, e := range cacheData {
		if first || e.expiresAt.Before(oldest) {
			oldestKey = k
			oldest = e.expiresAt
			first = false
		}
	}
	if oldestKey != "" {
		delete(cacheData, oldestKey)
	}
}

// InvalidateUser drops a cached session (call after permission mutations).
func InvalidateUser(authUserID string) {
	if authUserID == "" {
		return
	}
	cacheMu.Lock()
	delete(cacheData, authUserID)
	cacheMu.Unlock()
}
