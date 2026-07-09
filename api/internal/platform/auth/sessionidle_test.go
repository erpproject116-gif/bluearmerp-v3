package auth

import (
	"net/http"
	"net/url"
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
