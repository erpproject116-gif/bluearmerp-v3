package auth

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"sync"
	"testing"
	"time"
)

func TestSessionIdleTimeoutDefault(t *testing.T) {
	t.Setenv("SESSION_IDLE_MINUTES", "")
	if got := sessionIdleTimeout(); got != 20*time.Minute {
		t.Fatalf("default idle timeout = %v, want 20m", got)
	}
}

func TestSessionIdleTimeoutEnv(t *testing.T) {
	t.Setenv("SESSION_IDLE_MINUTES", "30")
	if got := sessionIdleTimeout(); got != 30*time.Minute {
		t.Fatalf("env idle timeout = %v, want 30m", got)
	}
}

func TestShouldBumpSessionActivity(t *testing.T) {
	r := &http.Request{Header: make(http.Header), URL: mustURL("/api/v1/quotation/quotations")}
	r.Header.Set(UserActivityHeader, "1")
	if !shouldBumpSessionActivity(r) {
		t.Fatal("expected activity bump for user-initiated request")
	}
	r.URL = mustURL("/api/v1/presence/heartbeat")
	if shouldBumpSessionActivity(r) {
		t.Fatal("presence heartbeat must not bump activity")
	}
}

func mustURL(path string) *url.URL {
	u, err := url.Parse(path)
	if err != nil {
		panic(err)
	}
	return u
}

type fakeActivityStore struct {
	mu      sync.Mutex
	last    time.Time
	found   bool
	loads   int
	touches int
}

func (f *fakeActivityStore) loadActivity(context.Context, string) (time.Time, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.loads++
	return f.last, f.found, nil
}

func (f *fakeActivityStore) touchActivity(context.Context, string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.touches++
	f.found = true
	f.last = activityNow()
	return nil
}

func (f *fakeActivityStore) loadCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.loads
}

func TestActivityReadCacheSkipsSelectWithinTTL(t *testing.T) {
	t.Setenv("SESSION_ACTIVITY_READ_CACHE_SECONDS", "10")
	t.Setenv("SESSION_IDLE_MINUTES", "20")
	t.Setenv("SESSION_ACTIVITY_WRITE_SECONDS", "30")
	resetActivityCache()
	t.Cleanup(resetActivityCache)

	base := time.Date(2026, 9, 28, 12, 0, 0, 0, time.UTC)
	activityNow = func() time.Time { return base }
	t.Cleanup(func() { activityNow = time.Now })

	store := &fakeActivityStore{last: base.Add(-time.Minute), found: true}
	if err := enforceSessionActivityStore(context.Background(), store, "user-1", false); err != nil {
		t.Fatal(err)
	}
	if err := enforceSessionActivityStore(context.Background(), store, "user-1", false); err != nil {
		t.Fatal(err)
	}
	if got := store.loadCount(); got != 1 {
		t.Fatalf("loads = %d, want 1 inside the cache window", got)
	}

	activityNow = func() time.Time { return base.Add(11 * time.Second) }
	if err := enforceSessionActivityStore(context.Background(), store, "user-1", false); err != nil {
		t.Fatal(err)
	}
	if got := store.loadCount(); got != 2 {
		t.Fatalf("loads = %d, want 2 after cache expiry", got)
	}
}

func TestStaleActivityWithBumpRefreshes(t *testing.T) {
	t.Setenv("SESSION_ACTIVITY_READ_CACHE_SECONDS", "10")
	t.Setenv("SESSION_IDLE_MINUTES", "20")
	resetActivityCache()
	t.Cleanup(resetActivityCache)

	now := time.Date(2026, 9, 28, 12, 0, 0, 0, time.UTC)
	activityNow = func() time.Time { return now }
	t.Cleanup(func() { activityNow = time.Now })

	store := &fakeActivityStore{last: now.Add(-21 * time.Minute), found: true}
	err := enforceSessionActivityStore(context.Background(), store, "user-2", true)
	if err != nil {
		t.Fatalf("bump should refresh a stale row, got %v", err)
	}
	store.mu.Lock()
	touches := store.touches
	store.mu.Unlock()
	if touches != 1 {
		t.Fatalf("touches = %d, want 1", touches)
	}
}

func TestStaleActivityWithoutBumpIsIdleAndNotCached(t *testing.T) {
	t.Setenv("SESSION_ACTIVITY_READ_CACHE_SECONDS", "10")
	t.Setenv("SESSION_IDLE_MINUTES", "20")
	resetActivityCache()
	t.Cleanup(resetActivityCache)

	now := time.Date(2026, 9, 28, 12, 0, 0, 0, time.UTC)
	activityNow = func() time.Time { return now }
	t.Cleanup(func() { activityNow = time.Now })

	store := &fakeActivityStore{last: now.Add(-21 * time.Minute), found: true}
	if err := enforceSessionActivityStore(context.Background(), store, "user-3", false); !errors.Is(err, ErrSessionIdle) {
		t.Fatalf("got %v, want ErrSessionIdle", err)
	}
	if err := enforceSessionActivityStore(context.Background(), store, "user-3", false); !errors.Is(err, ErrSessionIdle) {
		t.Fatalf("second call got %v, want ErrSessionIdle", err)
	}
	if got := store.loadCount(); got != 2 {
		t.Fatalf("loads = %d, want 2 (idle must not be cached)", got)
	}
}
