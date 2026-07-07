package ratelimit

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// FixedWindow tracks request counts per key within a rolling window.
type FixedWindow struct {
	mu      sync.Mutex
	window  time.Duration
	entries map[string]*windowEntry
}

type windowEntry struct {
	count   int
	resetAt time.Time
}

func NewFixedWindow(window time.Duration) *FixedWindow {
	return &FixedWindow{
		window:  window,
		entries: make(map[string]*windowEntry),
	}
}

func (fw *FixedWindow) Allow(key string, limit int) bool {
	if limit <= 0 {
		return true
	}
	now := time.Now()
	fw.mu.Lock()
	defer fw.mu.Unlock()
	e, ok := fw.entries[key]
	if !ok || now.After(e.resetAt) {
		fw.entries[key] = &windowEntry{count: 1, resetAt: now.Add(fw.window)}
		return true
	}
	if e.count >= limit {
		return false
	}
	e.count++
	return true
}

// ClientIP returns the client IP, honoring X-Forwarded-For when present.
func ClientIP(r *http.Request) string {
	if xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); xff != "" {
		if i := strings.IndexByte(xff, ','); i >= 0 {
			return strings.TrimSpace(xff[:i])
		}
		return xff
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

type Tier int

const (
	TierExempt Tier = iota
	TierPublicStrict
	TierPublicProvision
	TierAuthenticated
	TierExpensive
)

// TierForPath classifies a request for rate-limit buckets.
func TierForPath(method, path string) Tier {
	p := strings.ToLower(path)
	if p == "/health" || p == "/health/db" {
		return TierExempt
	}
	if method == http.MethodOptions {
		return TierExempt
	}
	if strings.Contains(p, "/jobs/") {
		return TierExempt
	}
	for _, prefix := range []string{
		"/api/v1/demo/signup",
		"/api/v1/platform/intake",
		"/api/v1/portal/auth/request-link",
	} {
		if p == prefix || strings.HasPrefix(p, prefix+"/") {
			return TierPublicStrict
		}
	}
	for _, prefix := range []string{
		"/api/v1/demo/provision",
		"/api/v1/platform/trial/provision",
	} {
		if p == prefix || strings.HasPrefix(p, prefix+"/") {
			return TierPublicProvision
		}
	}
	if strings.Contains(p, "/serial-units/resolve-scan") ||
		strings.Contains(p, "/goods-receipts/") && strings.Contains(p, "/scan") ||
		strings.HasSuffix(p, "/export") {
		return TierExpensive
	}
	if strings.HasPrefix(p, "/api/v1/") {
		return TierAuthenticated
	}
	return TierExempt
}
