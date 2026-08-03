package openlines

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPageSize(t *testing.T) {
	req := func(qs string) *http.Request {
		return httptest.NewRequest(http.MethodGet, "/x?"+qs, nil)
	}
	if got := PageSize(req(""), 0); got != DefaultPageSize {
		t.Fatalf("empty -> default: got %d", got)
	}
	if got := PageSize(req("pageSize=500"), 50); got != 500 {
		t.Fatalf("500: got %d", got)
	}
	if got := PageSize(req("pageSize=9999"), 50); got != MaxPageSize {
		t.Fatalf("clamp: got %d", got)
	}
	if got := PageSize(req("pageSize=abc"), 80); got != DefaultPageSize {
		t.Fatalf("invalid: got %d", got)
	}
	if got := PageSize(req(""), 80); got != 80 {
		t.Fatalf("fallback: got %d", got)
	}
}
