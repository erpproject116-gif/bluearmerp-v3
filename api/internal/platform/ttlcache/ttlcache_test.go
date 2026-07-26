package ttlcache

import (
	"strconv"
	"testing"
	"time"
)

func TestGetSetInvalidate(t *testing.T) {
	c := New[bool]("TTLCACHE_TEST_UNSET", 30, 100)
	if !c.Enabled() {
		t.Fatal("expected default TTL to enable the cache")
	}

	if _, ok := c.Get("a"); ok {
		t.Fatal("empty cache must miss")
	}
	c.Set("a", true)
	if v, ok := c.Get("a"); !ok || !v {
		t.Fatalf("expected hit true, got %v ok=%v", v, ok)
	}
	c.Invalidate("a")
	if _, ok := c.Get("a"); ok {
		t.Fatal("expected invalidate to clear the key")
	}
}

func TestDisabledByEnvZero(t *testing.T) {
	t.Setenv("TTLCACHE_TEST_TTL", "0")
	c := New[bool]("TTLCACHE_TEST_TTL", 30, 100)
	if c.Enabled() {
		t.Fatal("TTL 0 must disable the cache")
	}
	c.Set("a", true)
	if _, ok := c.Get("a"); ok {
		t.Fatal("disabled cache must never hit")
	}
}

func TestEnvOverridesDefault(t *testing.T) {
	t.Setenv("TTLCACHE_TEST_TTL", "5")
	c := New[bool]("TTLCACHE_TEST_TTL", 30, 100)
	if c.ttl != 5*time.Second {
		t.Fatalf("expected 5s TTL from env, got %v", c.ttl)
	}
}

func TestExpiry(t *testing.T) {
	c := New[int]("TTLCACHE_TEST_UNSET", 30, 100)
	c.ttl = time.Millisecond
	c.Set("a", 1)
	time.Sleep(5 * time.Millisecond)
	if _, ok := c.Get("a"); ok {
		t.Fatal("expected the entry to expire")
	}
}

func TestInvalidatePrefixScopesToOneTenant(t *testing.T) {
	c := New[bool]("TTLCACHE_TEST_UNSET", 30, 100)
	c.Set("7|sales", true)
	c.Set("7|pos", true)
	c.Set("8|sales", true)

	c.InvalidatePrefix("7|")

	if _, ok := c.Get("7|sales"); ok {
		t.Fatal("tenant 7 entries should be gone")
	}
	if _, ok := c.Get("7|pos"); ok {
		t.Fatal("tenant 7 entries should be gone")
	}
	if _, ok := c.Get("8|sales"); !ok {
		t.Fatal("another tenant must not be evicted")
	}
}

func TestCapEvicts(t *testing.T) {
	c := New[int]("TTLCACHE_TEST_UNSET", 30, 10)
	for i := 0; i < 40; i++ {
		c.Set(strconv.Itoa(i), i)
	}
	if c.Len() > 10 {
		t.Fatalf("cache grew past its cap: %d", c.Len())
	}
}
