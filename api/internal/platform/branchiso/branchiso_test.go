package branchiso

import (
	"testing"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func TestCanViewAllBranchCommercial(t *testing.T) {
	if !CanViewAllBranchCommercial(auth.TenantUser{IsTenantOwner: true}) {
		t.Fatal("owner")
	}
	if !CanViewAllBranchCommercial(auth.TenantUser{IsPlatformSuperadmin: true}) {
		t.Fatal("superadmin")
	}
	if !CanViewAllBranchCommercial(auth.TenantUser{SupportSessionID: 9}) {
		t.Fatal("support")
	}
	if CanViewAllBranchCommercial(auth.TenantUser{TenantRole: "store_admin"}) {
		t.Fatal("store_admin must not see all commercial branches")
	}
}

func TestIsStoreAdminRole(t *testing.T) {
	if !IsStoreAdminRole(auth.TenantUser{TenantRole: "store_admin"}) {
		t.Fatal("store_admin")
	}
	if !IsStoreAdminRole(auth.TenantUser{IsTenantOwner: true, TenantRole: "member"}) {
		t.Fatal("owner")
	}
	if IsStoreAdminRole(auth.TenantUser{TenantRole: "member"}) {
		t.Fatal("member")
	}
}

func TestResolveOperatingBranch(t *testing.T) {
	tu := auth.TenantUser{HomeLocationID: 10, ActiveBranchID: 99}
	allowed := []int64{10, 20}
	if got := ResolveOperatingBranch(tu, allowed, true); got != 10 {
		t.Fatalf("invalid active should fall back to home, got %d", got)
	}
	tu.ActiveBranchID = 20
	if got := ResolveOperatingBranch(tu, allowed, true); got != 20 {
		t.Fatalf("valid active, got %d", got)
	}
	owner := auth.TenantUser{IsTenantOwner: true, ActiveBranchID: 99}
	if got := ResolveOperatingBranch(owner, nil, true); got != 99 {
		t.Fatalf("owner keeps active, got %d", got)
	}
}
