package datascope

import (
	"context"
	"strings"
	"testing"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func TestResolveReportLocationFilter_ownerActiveBranch(t *testing.T) {
	ctx := context.Background()
	owner := auth.TenantUser{IsTenantOwner: true, ActiveBranchID: 11, StrictBranchIsolation: false}

	// Rule 1: owner + ActiveBranch, isolation OFF
	got, err := ResolveReportLocationFilter(ctx, nil, owner, nil)
	if err != nil || got == nil || *got != 11 {
		t.Fatalf("owner active: got=%v err=%v", got, err)
	}

	// Rule 2: All branches
	owner.ActiveBranchID = 0
	got, err = ResolveReportLocationFilter(ctx, nil, owner, nil)
	if err != nil || got != nil {
		t.Fatalf("all branches: got=%v err=%v", got, err)
	}

	// Rule 3: ExplicitLocationID wins over ActiveBranch
	owner.ActiveBranchID = 11
	explicit := int64(22)
	got, err = ResolveReportLocationFilter(ctx, nil, owner, &explicit)
	if err != nil || got == nil || *got != 22 {
		t.Fatalf("explicit wins: got=%v err=%v", got, err)
	}
}

func TestApplyUserScopesSQL_ownerActiveBranchIsolationOff(t *testing.T) {
	ctx := context.Background()
	owner := auth.TenantUser{IsTenantOwner: true, ActiveBranchID: 15, StrictBranchIsolation: false}
	var args []any
	frag, _, err := ApplyUserScopesSQL(ctx, nil, owner, ListFilter{LocationColumn: "s.location_id"}, 1, &args)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(frag, "s.location_id = $1") || len(args) != 1 || args[0] != int64(15) {
		t.Fatalf("expected owner view-scope, frag=%q args=%v", frag, args)
	}

	// Explicit wins
	owner.ActiveBranchID = 15
	ex := int64(99)
	args = nil
	frag, _, err = ApplyUserScopesSQL(ctx, nil, owner, ListFilter{
		LocationColumn:     "s.location_id",
		ExplicitLocationID: &ex,
	}, 1, &args)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(frag, "s.location_id = $1") || len(args) != 1 || args[0] != int64(99) {
		t.Fatalf("explicit should win alone, frag=%q args=%v", frag, args)
	}
	// Must not double-filter to ActiveBranch
	if strings.Count(frag, "location_id") > 1 {
		t.Fatalf("double location filter: %q", frag)
	}

	// All branches
	owner.ActiveBranchID = 0
	args = nil
	frag, _, err = ApplyUserScopesSQL(ctx, nil, owner, ListFilter{LocationColumn: "s.location_id"}, 1, &args)
	if err != nil {
		t.Fatal(err)
	}
	if frag != "" || len(args) != 0 {
		t.Fatalf("all branches should be empty, frag=%q args=%v", frag, args)
	}
}
