package auth

import "testing"

func TestNormalizeEmail(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"  User@Example.COM ", "user@example.com"},
		{"", ""},
		{"a@b.co", "a@b.co"},
	}
	for _, tc := range tests {
		if got := normalizeEmail(tc.in); got != tc.want {
			t.Fatalf("normalizeEmail(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestIsBootstrapSuperadminEmail(t *testing.T) {
	for _, email := range []string{
		"itsjohnranel@gmail.com",
		"bluearmph@gmail.com",
		"erpproject116@gmail.com",
		"ItsJohnRanel@Gmail.com",
	} {
		if !isBootstrapSuperadminEmail(email) {
			t.Fatalf("expected platform console email %q", email)
		}
	}
	if isBootstrapSuperadminEmail("other@example.com") {
		t.Fatal("unexpected bootstrap email")
	}
	if !IsOperatorCompanyCode("BLUEARM") || IsOperatorCompanyCode("ACME") {
		t.Fatal("operator company code check failed")
	}
	if !IsOperatorStoreOwnerEmail("BluearmPH@gmail.com") || IsOperatorStoreOwnerEmail("glen.bluearm@gmail.com") {
		t.Fatal("operator store owner email check failed")
	}
	if IsPlatformConsoleEmail("demo@customer.com") {
		t.Fatal("customer email must not access platform console")
	}
}

func TestProductOwnerEmailHasOwnerCapability(t *testing.T) {
	// On a customer workspace: superadmin scan powers, not commercial ownership.
	tu := TenantUser{Email: "bluearmph@gmail.com", TenantRole: "member", TenantID: 42, CompanyCode: "TRIAL-x"}
	if !tu.hasOwnerCapability() {
		t.Fatal("bluearmph must have the same unrestricted access as a platform superadmin")
	}
	if tu.PermissionLevel("finance.journal_entries") != AccessWrite {
		t.Fatal("superadmin must have write on every permission code")
	}
	applyBootstrapOwnerFlags(&tu)
	if !tu.IsPlatformSuperadmin {
		t.Fatal("bluearmph must be a platform superadmin like itsjohnranel@gmail.com")
	}
	if !tu.IsStoreAdmin {
		t.Fatal("bluearmph must keep store_admin scan capability on customer workspaces")
	}
	if tu.IsTenantOwner {
		t.Fatal("bluearmph must not become commercial owner of customer workspaces")
	}
	if !tu.CanAccessPlatformCommand() {
		t.Fatal("superadmin must access Platform Command")
	}

	// BLUEARM operator tenant: bluearmph remains the required store owner.
	op := TenantUser{Email: "bluearmph@gmail.com", TenantID: 1, CompanyCode: "BLUEARM"}
	applyBootstrapOwnerFlags(&op)
	if !op.IsTenantOwner || !op.IsStoreAdmin {
		t.Fatal("bluearmph must be store owner of BLUEARM")
	}

	john := TenantUser{Email: "itsjohnranel@gmail.com", TenantID: 42, CompanyCode: "TRIAL-x"}
	applyBootstrapOwnerFlags(&john)
	if !john.IsPlatformSuperadmin {
		t.Fatal("itsjohnranel must be a platform superadmin")
	}
	if john.IsTenantOwner {
		t.Fatal("itsjohnranel is superadmin, not the store owner")
	}
}

func TestNonOwnerEmailDoesNotGainBootstrapAccess(t *testing.T) {
	tu := TenantUser{Email: "store.member@example.com", TenantRole: "member"}
	if tu.hasOwnerCapability() {
		t.Fatal("customer member must not inherit bootstrap superadmin access")
	}
}

func TestProductOwnerAndStoreAdminSeeAllSupportTickets(t *testing.T) {
	owner := TenantUser{Email: "bluearmph@gmail.com"}
	if !owner.CanManageAllSupportTickets() {
		t.Fatal("bluearmph must see every tenant support ticket")
	}
	admin := TenantUser{IsStoreAdmin: true, Email: "itdesk@example.com"}
	if !admin.CanManageAllSupportTickets() {
		t.Fatal("store admin / IT desk must see every tenant support ticket")
	}
	member := TenantUser{Email: "staff@example.com", TenantRole: "member"}
	if member.CanManageAllSupportTickets() {
		t.Fatal("plain member must only see tickets they opened")
	}
}
