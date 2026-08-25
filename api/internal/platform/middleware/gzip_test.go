package middleware

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSelectiveGzip_DoesNotDuplicateCORSHeaders(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"success":false}`))
	})
	h := SelectiveGzip(true)(inner)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	req.Header.Set("Origin", "https://app.bluearmerp.com")

	rr := httptest.NewRecorder()
	// Simulate upstream CORS middleware writing on the outer writer first.
	rr.Header().Set("Access-Control-Allow-Origin", "https://app.bluearmerp.com")
	rr.Header().Set("Access-Control-Allow-Credentials", "true")
	rr.Header().Set("Vary", "Origin")

	h.ServeHTTP(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	_, _ = io.ReadAll(res.Body)

	if got := res.Header.Values("Access-Control-Allow-Origin"); len(got) != 1 {
		t.Fatalf("Access-Control-Allow-Origin count=%d values=%v", len(got), got)
	}
	if got := res.Header.Values("Content-Type"); len(got) != 1 {
		t.Fatalf("Content-Type count=%d values=%v", len(got), got)
	}
	if res.Header.Get("Access-Control-Allow-Origin") != "https://app.bluearmerp.com" {
		t.Fatalf("unexpected ACAO %q", res.Header.Get("Access-Control-Allow-Origin"))
	}
}

func TestSelectiveGzip_CompressesLargeBody(t *testing.T) {
	payload := strings.Repeat("x", gzipMinBytes+100)
	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write([]byte(payload))
	})
	h := SelectiveGzip(true)(inner)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/big", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.Header.Get("Content-Encoding") != "gzip" {
		t.Fatalf("expected gzip, got %q", res.Header.Get("Content-Encoding"))
	}
}
