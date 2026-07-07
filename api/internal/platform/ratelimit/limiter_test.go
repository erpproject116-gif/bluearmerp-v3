package ratelimit

import (
	"testing"
	"time"
)

func TestFixedWindow_AllowsUpToLimit(t *testing.T) {
	fw := NewFixedWindow(time.Minute)
	key := "test:1"
	for i := 0; i < 5; i++ {
		if !fw.Allow(key, 5) {
			t.Fatalf("request %d should be allowed", i+1)
		}
	}
	if fw.Allow(key, 5) {
		t.Fatal("6th request should be blocked")
	}
}

func TestFixedWindow_ResetsAfterWindow(t *testing.T) {
	fw := NewFixedWindow(10 * time.Millisecond)
	key := "test:2"
	if !fw.Allow(key, 1) {
		t.Fatal("first request should be allowed")
	}
	if fw.Allow(key, 1) {
		t.Fatal("second request should be blocked")
	}
	time.Sleep(15 * time.Millisecond)
	if !fw.Allow(key, 1) {
		t.Fatal("request after window should be allowed")
	}
}

func TestTierForPath(t *testing.T) {
	cases := []struct {
		method string
		path   string
		want   Tier
	}{
		{"GET", "/health", TierExempt},
		{"POST", "/api/v1/demo/signup", TierPublicStrict},
		{"POST", "/api/v1/demo/provision", TierPublicProvision},
		{"POST", "/api/v1/inventory/serial-units/resolve-scan", TierExpensive},
		{"GET", "/api/v1/sales/sales", TierAuthenticated},
	}
	for _, tc := range cases {
		if got := TierForPath(tc.method, tc.path); got != tc.want {
			t.Fatalf("%s %s: got tier %d want %d", tc.method, tc.path, got, tc.want)
		}
	}
}
