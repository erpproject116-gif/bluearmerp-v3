package auth

import (
	"net/http"
	"testing"
)

func TestHasOwnerCapabilityDefeatedByRolePreview(t *testing.T) {
	tu := TenantUser{
		Email:                "itsjohnranel@gmail.com",
		IsPlatformSuperadmin: true,
		IsTenantOwner:        true,
		RolePreviewActive:    true,
	}
	if tu.hasOwnerCapability() {
		t.Fatal("role preview must defeat hasOwnerCapability including bootstrap email")
	}
	cleared := TenantUser{Email: "itsjohnranel@gmail.com", RolePreviewActive: true}
	applyBootstrapOwnerFlags(&cleared)
	if cleared.IsPlatformSuperadmin || cleared.IsTenantOwner {
		t.Fatal("applyBootstrapOwnerFlags must not re-elevate during role preview")
	}
}

func TestRolePreviewMutatingAllowlist(t *testing.T) {
	if !rolePreviewMutatingAllowed(http.MethodGet, "/api/v1/sales") {
		t.Fatal("GET should be allowed")
	}
	if rolePreviewMutatingAllowed(http.MethodPost, "/api/v1/sales") {
		t.Fatal("POST sales should be denied")
	}
	if !rolePreviewMutatingAllowed(http.MethodPost, "/api/v1/auth/role-preview/end") {
		t.Fatal("end should be allowed")
	}
	if !rolePreviewMutatingAllowed(http.MethodPost, "/api/v1/auth/role-preview/extend") {
		t.Fatal("extend should be allowed")
	}
}

func TestIsOwnerEquivalentRole(t *testing.T) {
	if !isOwnerEquivalentRole("owner") || !isOwnerEquivalentRole("store_owner") {
		t.Fatal("owner roles must be rejected")
	}
	if isOwnerEquivalentRole("store_admin") || isOwnerEquivalentRole("member") {
		t.Fatal("normal roles must be allowed")
	}
}

func TestCanAccessPlatformCommandDuringPreview(t *testing.T) {
	tu := TenantUser{IsPlatformSuperadmin: true, Email: "itsjohnranel@gmail.com", RolePreviewActive: true}
	if tu.CanAccessPlatformCommand() {
		t.Fatal("platform command must be blocked during role preview")
	}
}

func TestLoadEffectivePermissionsSkipsOverridesConcept(t *testing.T) {
	// Structural: RolePreviewActive forces hasOwnerCapability false and skip-overrides branch.
	tu := TenantUser{RolePreviewActive: true, TenantRole: "member", TenantID: 1, AppUserID: 1}
	if tu.hasOwnerCapability() {
		t.Fatal("preview member must not have owner capability")
	}
}

func TestRestoreRolePreviewIdentityAfterSoftFail(t *testing.T) {
	tu := TenantUser{
		AppUserID:            2,
		TenantID:             2,
		Email:                "itsjohnranel@gmail.com",
		IsTenantOwner:        true,
		IsPlatformSuperadmin: true,
		TenantRole:           "store_admin",
		PlatformRole:         "superadmin",
		PlatformPermissions:  map[string]bool{"platform.console": true},
		HomeLocationID:       9,
		CanStartRolePreview:  true,
	}
	tu.canManageUsersRole = true
	tu.IsStoreAdmin = true
	tu.permissions = map[string]string{"sales": "write"}

	snap := snapshotRolePreviewIdentity(&tu)

	// Simulate half-applied overlay strip.
	tu.RealIsTenantOwner = true
	tu.RealIsPlatformSuperadmin = true
	tu.RealTenantRole = "store_admin"
	tu.RolePreviewActive = true
	tu.RolePreviewRoleCode = "receiving"
	tu.IsTenantOwner = false
	tu.IsPlatformSuperadmin = false
	tu.TenantRole = "receiving"
	tu.PlatformPermissions = nil
	tu.PlatformRole = ""
	tu.permissions = nil
	tu.CanStartRolePreview = false

	restoreRolePreviewIdentity(&tu, snap)

	if tu.RolePreviewActive || tu.RolePreviewRoleCode != "" {
		t.Fatal("preview flags must be cleared after restore")
	}
	if !tu.IsTenantOwner || !tu.IsPlatformSuperadmin {
		t.Fatal("real owner/superadmin must be restored")
	}
	if tu.TenantRole != "store_admin" || tu.PlatformRole != "superadmin" {
		t.Fatal("real roles must be restored")
	}
	if tu.PlatformPermissions["platform.console"] != true {
		t.Fatal("platform permissions must be restored")
	}
	if tu.HomeLocationID != 9 || !tu.CanStartRolePreview {
		t.Fatal("home location and can_start must be restored")
	}
	if tu.permissions["sales"] != "write" {
		t.Fatal("effective permissions must be restored")
	}
}

func TestCanStartRolePreviewRealDuringActivePreview(t *testing.T) {
	tu := TenantUser{
		RolePreviewActive:        true,
		RealIsPlatformSuperadmin: true,
		IsPlatformSuperadmin:     false,
	}
	if !canStartRolePreviewReal(tu) {
		t.Fatal("real superadmin must be able to end/extend lifecycle during preview")
	}
	tu.RealIsPlatformSuperadmin = false
	tu.RealIsTenantOwner = false
	if canStartRolePreviewReal(tu) {
		t.Fatal("stripped identity without Real* power must not start preview")
	}
}

func TestIsMissingRolePreviewSchema(t *testing.T) {
	cases := []struct {
		msg  string
		want bool
	}{
		{"ERROR: column \"role_preview_role_code\" does not exist (SQLSTATE 42703)", true},
		{"undefined_column: role_preview_expires_at", true},
		{"connection refused", false},
		{"column \"tenant_role\" does not exist", false},
	}
	for _, tc := range cases {
		err := errString(tc.msg)
		if got := isMissingRolePreviewSchema(err); got != tc.want {
			t.Fatalf("%q: got %v want %v", tc.msg, got, tc.want)
		}
	}
	if isMissingRolePreviewSchema(nil) {
		t.Fatal("nil must be false")
	}
}

type errString string

func (e errString) Error() string { return string(e) }

func TestRolePreviewAllowlistStaysTiny(t *testing.T) {
	// D6: do not widen business mutate paths.
	denied := []string{
		"/api/v1/sales",
		"/api/v1/pos/sessions/1/pay",
		"/api/v1/inventory/items",
		"/api/v1/user-management/users",
	}
	for _, p := range denied {
		if rolePreviewMutatingAllowed(http.MethodPost, p) {
			t.Fatalf("POST %s must stay denied under role preview", p)
		}
	}
}
