package auth

import (
	"testing"
	"time"
)

func TestCacheSetGetInvalidate(t *testing.T) {
	oldEnabled := cacheEnabled
	oldTTL := cacheTTL
	cacheEnabled = true
	cacheTTL = time.Minute
	defer func() {
		cacheEnabled = oldEnabled
		cacheTTL = oldTTL
		cacheMu.Lock()
		cacheData = map[string]cacheEntry{}
		cacheMu.Unlock()
	}()

	u := TenantUser{AuthUserID: "sub-1", Email: "a@b.c", AppUserID: 1, TenantID: 2}
	cacheSet("sub-1", u, 5)
	got, rev, ok := cacheGet("sub-1")
	if !ok || rev != 5 || got.Email != "a@b.c" {
		t.Fatalf("cache miss or wrong data: ok=%v rev=%d email=%s", ok, rev, got.Email)
	}
	InvalidateUser("sub-1")
	_, _, ok = cacheGet("sub-1")
	if ok {
		t.Fatal("expected invalidate to clear entry")
	}
}

// A cache hit is now the whole identity: platform staff fields and the role's
// apply_user_scopes flag must survive the round trip, because nothing re-queries
// platform_users or tenant_roles while the entry is live.
func TestCacheCarriesPlatformIdentityAndScopeFlag(t *testing.T) {
	oldEnabled, oldTTL := cacheEnabled, cacheTTL
	cacheEnabled = true
	cacheTTL = time.Minute
	defer func() {
		cacheEnabled, cacheTTL = oldEnabled, oldTTL
		cacheMu.Lock()
		cacheData = map[string]cacheEntry{}
		cacheMu.Unlock()
	}()

	key := cacheKey("sub-3", 7)
	cacheSet(key, TenantUser{
		AuthUserID:          "sub-3",
		TenantID:            7,
		ApplyUserScopes:     true,
		PlatformUserID:      42,
		PlatformRole:        "support",
		PlatformPermissions: map[string]bool{"platform.command.read": true},
	}, 3)

	got, _, ok := cacheGet(key)
	if !ok {
		t.Fatal("expected cache hit")
	}
	if !got.ApplyUserScopes {
		t.Fatal("apply_user_scopes lost; branch + datascope filters would silently open up")
	}
	if got.PlatformUserID != 42 || got.PlatformRole != "support" {
		t.Fatalf("platform identity lost: id=%d role=%q", got.PlatformUserID, got.PlatformRole)
	}
	if !got.HasPlatformPermission("platform.command.read") {
		t.Fatal("platform permissions lost")
	}
}

func TestCacheExpiry(t *testing.T) {
	oldEnabled := cacheEnabled
	oldTTL := cacheTTL
	cacheEnabled = true
	cacheTTL = time.Millisecond
	defer func() {
		cacheEnabled = oldEnabled
		cacheTTL = oldTTL
		cacheMu.Lock()
		cacheData = map[string]cacheEntry{}
		cacheMu.Unlock()
	}()

	u := TenantUser{AuthUserID: "sub-2"}
	cacheSet("sub-2", u, 1)
	time.Sleep(5 * time.Millisecond)
	_, _, ok := cacheGet("sub-2")
	if ok {
		t.Fatal("expected expired entry to miss")
	}
}
