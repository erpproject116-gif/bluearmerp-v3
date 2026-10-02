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
