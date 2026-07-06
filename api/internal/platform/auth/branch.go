package auth

import (
	"context"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ActiveBranchHeader lets the client scope list queries to the user's selected branch.
const ActiveBranchHeader = "X-Branch-ID"

// parseActiveBranchHeader reads the requested branch from X-Branch-ID. 0 means unset.
func parseActiveBranchHeader(r *http.Request) int64 {
	raw := strings.TrimSpace(r.Header.Get(ActiveBranchHeader))
	if raw == "" {
		return 0
	}
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || id <= 0 {
		return 0
	}
	return id
}

// resolveActiveBranchID validates that branchID belongs to the tenant and is allowed
// for the user (respecting location data scopes when enforced). Returns 0 when invalid.
func resolveActiveBranchID(ctx context.Context, pool *pgxpool.Pool, tu TenantUser, branchID int64) int64 {
	if branchID <= 0 {
		return 0
	}

	var exists bool
	err := pool.QueryRow(ctx, `
		select exists (
		  select 1 from public.inv_locations
		  where id = $1 and tenant_id = $2 and status = 'active'
		)`, branchID, tu.TenantID).Scan(&exists)
	if err != nil || !exists {
		return 0
	}

	if tu.IsPlatformSuperadmin || tu.IsTenantOwner {
		return branchID
	}

	var applyScopes bool
	err = pool.QueryRow(ctx, `
		select coalesce(tr.apply_user_scopes, false)
		from public.tenant_roles tr
		where tr.tenant_id = $1 and tr.role_code = $2`,
		tu.TenantID, tu.TenantRole).Scan(&applyScopes)
	if err != nil || !applyScopes {
		return branchID
	}

	var inScope bool
	err = pool.QueryRow(ctx, `
		select exists (
		  select 1 from public.user_data_scopes
		  where tenant_id = $1 and user_id = $2
		    and scope_type in ('location', 'warehouse')
		    and record_id = $3
		)`, tu.TenantID, tu.AppUserID, branchID).Scan(&inScope)
	if err != nil || !inScope {
		// Role enforces scopes but this branch is not assigned — ignore header.
		return 0
	}
	return branchID
}
