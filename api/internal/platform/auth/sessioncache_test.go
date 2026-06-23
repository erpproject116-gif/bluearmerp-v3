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
