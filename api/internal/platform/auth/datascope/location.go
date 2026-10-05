package datascope

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/branchiso"
)

// ResolveLocationFilter returns the location id to apply when user data scopes are already on.
// Explicit ?location_id= takes precedence over the active branch (X-Branch-ID).
func ResolveLocationFilter(tu auth.TenantUser, explicit *int64) *int64 {
	if explicit != nil && *explicit > 0 {
		return explicit
	}
	if tu.ActiveBranchID > 0 {
		id := tu.ActiveBranchID
		return &id
	}
	return nil
}

// RoleAppliesUserScopes reports whether the tenant role enforces user_data_scopes.
// Owners and platform superadmins never apply scopes.
// The flag comes from the cached TenantUser; ctx/pool are kept so callers stay
// unchanged and a future scope source can go back to the database.
func RoleAppliesUserScopes(_ context.Context, _ *pgxpool.Pool, tu auth.TenantUser) (bool, error) {
	if tu.IsPlatformSuperadmin || tu.IsTenantOwner {
		return false, nil
	}
	return tu.ApplyUserScopes, nil
}

// ResolveReportLocationFilter applies location narrowing for reports.
// Precedence: explicit ?location_id= > ActiveBranch for view-all users (owner/platform/support)
// > ActiveBranch when apply_user_scopes > none. Independent of strict_branch_isolation.
func ResolveReportLocationFilter(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, explicit *int64) (*int64, error) {
	if explicit != nil && *explicit > 0 {
		return explicit, nil
	}
	// Owner/platform/support voluntary view-scope (same as ApplyActiveBranchViewSQL).
	if branchiso.CanViewAllBranchCommercial(tu) && tu.ActiveBranchID > 0 {
		id := tu.ActiveBranchID
		return &id, nil
	}
	apply, err := RoleAppliesUserScopes(ctx, pool, tu)
	if err != nil {
		return nil, err
	}
	if apply && tu.ActiveBranchID > 0 {
		id := tu.ActiveBranchID
		return &id, nil
	}
	return nil, nil
}
