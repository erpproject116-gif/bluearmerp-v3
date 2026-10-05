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

func TestApplyActiveBranchViewSQL(t *testing.T) {
	// Rule 1: owner + ActiveBranch, isolation OFF → narrow
	owner := auth.TenantUser{IsTenantOwner: true, ActiveBranchID: 42, StrictBranchIsolation: false}
	var args []any
	frag, next := ApplyActiveBranchViewSQL(owner, "so.location_id", 1, &args)
	if frag != " and so.location_id = $1" || next != 2 || len(args) != 1 || args[0] != int64(42) {
		t.Fatalf("owner active view: frag=%q next=%d args=%v", frag, next, args)
	}

	// Rule 2: ActiveBranch unset → no filter
	owner.ActiveBranchID = 0
	args = nil
	frag, next = ApplyActiveBranchViewSQL(owner, "so.location_id", 1, &args)
	if frag != "" || next != 1 || len(args) != 0 {
		t.Fatalf("all branches: frag=%q next=%d args=%v", frag, next, args)
	}

	// Platform with branch
	plat := auth.TenantUser{IsPlatformSuperadmin: true, ActiveBranchID: 7}
	args = nil
	frag, next = ApplyActiveBranchViewSQL(plat, "po.location_id", 3, &args)
	if frag != " and po.location_id = $3" || next != 4 || args[0] != int64(7) {
		t.Fatalf("platform: frag=%q next=%d args=%v", frag, next, args)
	}

	// Rule 4: store_admin is not view-all — no voluntary view-scope here
	sa := auth.TenantUser{TenantRole: "store_admin", ActiveBranchID: 42, StrictBranchIsolation: false}
	args = nil
	frag, next = ApplyActiveBranchViewSQL(sa, "so.location_id", 1, &args)
	if frag != "" || next != 1 {
		t.Fatalf("store_admin must not get view-all narrow: frag=%q", frag)
	}
}
