// Package ttlcache is the process-local L1 cache shared by the tenant gating
// middlewares (entitlement, module enablement, setup readiness).
//
// It is deliberately the same shape as the auth session cache: a map guarded by
// an RWMutex, a fixed TTL, an entry cap with oldest-first eviction, and explicit
// invalidation from the writers that change the underlying data. There is no
// shared/L2 tier — each API instance keeps its own copy, so the worst case after
// a write on another instance is TTL-bounded staleness.
package ttlcache

import (
	"os"
	"strings"
	"sync"
	"time"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/config"
)

type entry[V any] struct {
	value     V
	expiresAt time.Time
}

// Cache is a TTL map keyed by string. A zero or negative TTL disables it, which
// makes every environment variable in this package a working kill switch.
type Cache[V any] struct {
	mu   sync.RWMutex
	data map[string]entry[V]
	ttl  time.Duration
	max  int
}

// New builds a cache whose TTL comes from envVar (seconds), falling back to
// defaultSeconds. Setting the variable to 0 disables caching entirely.
func New[V any](envVar string, defaultSeconds int, max int) *Cache[V] {
	secs := config.ParseIntDefault(strings.TrimSpace(os.Getenv(envVar)), defaultSeconds)
	if secs < 0 {
		secs = defaultSeconds
	}
	if max <= 0 {
		max = 5000
	}
	return &Cache[V]{
		data: map[string]entry[V]{},
		ttl:  time.Duration(secs) * time.Second,
		max:  max,
	}
}

// Enabled reports whether the cache stores anything.
func (c *Cache[V]) Enabled() bool { return c != nil && c.ttl > 0 }

func (c *Cache[V]) Get(key string) (V, bool) {
	var zero V
	if !c.Enabled() {
		return zero, false
	}
	c.mu.RLock()
	e, ok := c.data[key]
	c.mu.RUnlock()
	if !ok {
		return zero, false
	}
	if time.Now().After(e.expiresAt) {
		c.mu.Lock()
		delete(c.data, key)
		c.mu.Unlock()
		return zero, false
	}
	return e.value, true
}

func (c *Cache[V]) Set(key string, value V) {
	if !c.Enabled() {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.data) >= c.max {
		c.evictOldestLocked()
	}
	c.data[key] = entry[V]{value: value, expiresAt: time.Now().Add(c.ttl)}
}

// Invalidate drops one key.
func (c *Cache[V]) Invalidate(key string) {
	if c == nil {
		return
	}
	c.mu.Lock()
	delete(c.data, key)
	c.mu.Unlock()
}

// InvalidatePrefix drops every key starting with prefix (e.g. "12|" for a tenant).
func (c *Cache[V]) InvalidatePrefix(prefix string) {
	if c == nil || prefix == "" {
		return
	}
	c.mu.Lock()
	for k := range c.data {
		if strings.HasPrefix(k, prefix) {
			delete(c.data, k)
		}
	}
	c.mu.Unlock()
}

// Reset clears everything (tests, and administrative flushes).
func (c *Cache[V]) Reset() {
	if c == nil {
		return
	}
	c.mu.Lock()
	c.data = map[string]entry[V]{}
	c.mu.Unlock()
}

// Len reports the number of stored entries, expired or not (tests).
func (c *Cache[V]) Len() int {
	if c == nil {
		return 0
	}
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.data)
}

func (c *Cache[V]) evictOldestLocked() {
	now := time.Now()
	for k, e := range c.data {
		if now.After(e.expiresAt) {
			delete(c.data, k)
		}
	}
	if len(c.data) < c.max {
		return
	}
	var oldestKey string
	var oldest time.Time
	first := true
	for k, e := range c.data {
		if first || e.expiresAt.Before(oldest) {
			oldestKey, oldest, first = k, e.expiresAt, false
		}
	}
	if oldestKey != "" {
		delete(c.data, oldestKey)
	}
}
