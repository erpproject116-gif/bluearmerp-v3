package console

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func TestRequirePlatformAccessDeniesAnonymous(t *testing.T) {
	h := requirePlatformAccess(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/platform/console/command", nil)
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", rr.Code)
	}
}

func TestRequirePlatformPermissionAllowsSuperadmin(t *testing.T) {
	h := requirePlatformPermission("platform.staff.manage")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/platform/console/staff", nil)
	tu := auth.TenantUser{IsPlatformSuperadmin: true, Email: "owner@example.com"}
	req = req.WithContext(context.WithValue(req.Context(), auth.UserContextKey, tu))
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rr.Code)
	}
}

func TestRequirePlatformPermissionDeniesMissing(t *testing.T) {
	h := requirePlatformPermission("platform.staff.manage")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/platform/console/staff", nil)
	tu := auth.TenantUser{
		Email: "agent@example.com",
		PlatformPermissions: map[string]bool{"platform.tickets.read": true},
	}
	req = req.WithContext(context.WithValue(req.Context(), auth.UserContextKey, tu))
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", rr.Code)
	}
}
