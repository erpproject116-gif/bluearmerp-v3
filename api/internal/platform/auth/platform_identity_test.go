package auth

import "testing"

func TestTenantUserHasPlatformPermission(t *testing.T) {
	tu := TenantUser{
		IsPlatformSuperadmin: false,
		PlatformPermissions: map[string]bool{
			"platform.tickets.read": true,
		},
	}
	if !tu.HasPlatformPermission("platform.tickets.read") {
		t.Fatal("expected tickets.read")
	}
	if tu.HasPlatformPermission("platform.staff.manage") {
		t.Fatal("did not expect staff.manage")
	}
	tu.IsPlatformSuperadmin = true
	if !tu.HasPlatformPermission("platform.staff.manage") {
		t.Fatal("superadmin should have all permissions")
	}
}

func TestCanAccessPlatformCommand(t *testing.T) {
	tu := TenantUser{PlatformPermissions: map[string]bool{"platform.command.read": true}}
	if !tu.CanAccessPlatformCommand() {
		t.Fatal("expected command access")
	}
	tu2 := TenantUser{}
	if tu2.CanAccessPlatformCommand() {
		t.Fatal("empty user should not access command")
	}
}
