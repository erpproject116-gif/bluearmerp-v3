package tenantmodules

import "testing"

// A module toggle must bite on the next request, not after the TTL, and it must
// only clear the tenant that changed.
func TestInvalidateTenantIsScoped(t *testing.T) {
	if !CacheEnabled() {
		t.Skip("module cache disabled in this environment")
	}
	t.Cleanup(Reset)
	Reset()

	cache.Set(key(7, "sales"), true)
	cache.Set(key(7, "pos"), true)
	cache.Set(key(8, "sales"), true)

	InvalidateTenant(7)

	if _, ok := cache.Get(key(7, "sales")); ok {
		t.Fatal("tenant 7 sales should be evicted")
	}
	if _, ok := cache.Get(key(7, "pos")); ok {
		t.Fatal("tenant 7 pos should be evicted")
	}
	if _, ok := cache.Get(key(8, "sales")); !ok {
		t.Fatal("tenant 8 must be untouched")
	}
}

// Keys must not collide across tenants whose ids share a prefix (1 vs 12).
func TestKeysDoNotCollideAcrossTenants(t *testing.T) {
	if key(1, "sales") == key(12, "sales") {
		t.Fatal("tenant 1 and 12 produced the same key")
	}
	if key(1, "2|sales") == key(12, "sales") {
		t.Fatal("separator is ambiguous")
	}
}
