package pos

import (
	"context"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func TestSetupWarningStopOnlyRequiredTracked(t *testing.T) {
	if stop, ok := setupWarningStop(true, false, "optional", "required"); ok || stop != "" {
		t.Fatalf("optional serial must not stop, got %q %v", stop, ok)
	}
	if stop, ok := setupWarningStop(true, false, "", "optional"); !ok || stop != "serial" {
		t.Fatalf("empty serial policy is required, got %q %v", stop, ok)
	}
	if stop, ok := setupWarningStop(true, false, "unknown", "optional"); !ok || stop != "serial" {
		t.Fatalf("unknown serial policy is required, got %q %v", stop, ok)
	}
	if stop, ok := setupWarningStop(false, true, "optional", "optional"); ok || stop != "" {
		t.Fatalf("optional lot must not stop, got %q %v", stop, ok)
	}
	if stop, ok := setupWarningStop(false, true, "optional", "required"); !ok || stop != "lot" {
		t.Fatalf("required lot, got %q %v", stop, ok)
	}
	if stop, ok := setupWarningStop(false, true, "optional", ""); !ok || stop != "lot" {
		t.Fatalf("empty lot policy is required, got %q %v", stop, ok)
	}
	if stop, ok := setupWarningStop(true, true, "required", "required"); !ok || stop != "serial" {
		t.Fatalf("both required stays one serial row, got %q %v", stop, ok)
	}
	if stop, ok := setupWarningStop(false, false, "required", "required"); ok || stop != "" {
		t.Fatalf("untracked item must not stop, got %q %v", stop, ok)
	}
}

func TestSetupWarningItemIncluded(t *testing.T) {
	if !setupWarningItemIncluded("active", false, true) {
		t.Fatal("active visible item")
	}
	if setupWarningItemIncluded("inactive", false, true) {
		t.Fatal("inactive")
	}
	if setupWarningItemIncluded("active", true, true) {
		t.Fatal("deleted")
	}
	if setupWarningItemIncluded("active", false, false) {
		t.Fatal("hidden from POS")
	}
}

func TestSetupWarningsDeniesTerminalOnly(t *testing.T) {
	h := getPosSetupWarnings(nil)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/pos/setup-warnings", nil)
	tu := tenantUserWithPermissions(map[string]string{"pos.terminal": auth.AccessRead})
	req = req.WithContext(context.WithValue(req.Context(), auth.UserContextKey, tu))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", rr.Code)
	}
}

func tenantUserWithPermissions(perms map[string]string) auth.TenantUser {
	tu := auth.TenantUser{}
	field := reflect.ValueOf(&tu).Elem().FieldByName("permissions")
	reflect.NewAt(field.Type(), field.Addr().UnsafePointer()).Elem().Set(reflect.ValueOf(perms))
	return tu
}
