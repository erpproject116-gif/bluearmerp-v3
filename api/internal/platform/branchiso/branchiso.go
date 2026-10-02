// Package branchiso enforces multi-branch commercial isolation and related helpers.
package branchiso

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

var (
	ErrForbiddenLocation = errors.New("branchiso: location not allowed")
	ErrIsolationClosed   = errors.New("branchiso: no home branch assigned")
)

// Flags are tenant process-policy toggles (default off).
type Flags struct {
	StrictBranchIsolation bool
	TransferHandoffV2     bool
}

func LoadFlags(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (Flags, error) {
	var f Flags
	err := pool.QueryRow(ctx, `
		select coalesce(strict_branch_isolation, false), coalesce(transfer_handoff_v2, false)
		from public.tenant_process_policies
		where tenant_id = $1`, tenantID).Scan(&f.StrictBranchIsolation, &f.TransferHandoffV2)
	if err == pgx.ErrNoRows {
		return Flags{}, nil
	}
	return f, err
}

// CanViewAllBranchCommercial: owner / platform / support scan.
func CanViewAllBranchCommercial(tu auth.TenantUser) bool {
	if tu.IsTenantOwner || tu.IsPlatformSuperadmin {
		return true
	}
	if tu.SupportSessionID > 0 {
		return true
	}
	return false
}

// IsStoreAdminRole is the explicit store_admin ladder (not form-settings).
func IsStoreAdminRole(tu auth.TenantUser) bool {
	role := strings.ToLower(strings.TrimSpace(tu.TenantRole))
	return role == "store_admin" || role == "owner" || tu.IsTenantOwner
}

// OperatingStockLocationSQL returns a SQL predicate excluding RMA and in-transit
// locations from operating-branch stock aggregates (alias is the locations table alias).
func OperatingStockLocationSQL(alias string) string {
	a := strings.TrimSpace(alias)
	if a == "" {
		a = "l"
	}
	return fmt.Sprintf("coalesce(%s.is_rma, false) = false and coalesce(%s.location_type, 'location') <> 'in_transit'", a, a)
}

// CanOperateTransfer: request / approve / ship.
func CanOperateTransfer(tu auth.TenantUser) bool {
	return CanViewAllBranchCommercial(tu) || IsStoreAdminRole(tu)
}

// CanReceiveTransfer: destination receive permission or store admin+.
func CanReceiveTransfer(tu auth.TenantUser) bool {
	if CanOperateTransfer(tu) {
		return true
	}
	return tu.HasPermission("inventory.stock_transfer_receive", auth.AccessWrite)
}

// CommercialLocationIDs returns locations the user may use for commercial docs
// when strict isolation is on. Empty slice means fail-closed (no access).
func CommercialLocationIDs(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser) ([]int64, error) {
	if CanViewAllBranchCommercial(tu) {
		return nil, nil // nil = unrestricted
	}
	ids := map[int64]struct{}{}
	if tu.HomeLocationID > 0 {
		ids[tu.HomeLocationID] = struct{}{}
	}
	rows, err := pool.Query(ctx, `
		select record_id from public.user_data_scopes
		where tenant_id = $1 and user_id = $2
		  and scope_type in ('location', 'warehouse')`, tu.TenantID, tu.AppUserID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		if id > 0 {
			ids[id] = struct{}{}
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]int64, 0, len(ids))
	for id := range ids {
		out = append(out, id)
	}
	return out, nil
}

// ResolveOperatingBranch returns the branch id to apply for commercial lists.
// When isolation is on for non-owners: invalid/missing header → home (never widen).
func ResolveOperatingBranch(tu auth.TenantUser, allowed []int64, isolationOn bool) int64 {
	if !isolationOn || CanViewAllBranchCommercial(tu) {
		return tu.ActiveBranchID
	}
	active := tu.ActiveBranchID
	if active > 0 && containsID(allowed, active) {
		return active
	}
	if tu.HomeLocationID > 0 && containsID(allowed, tu.HomeLocationID) {
		return tu.HomeLocationID
	}
	if len(allowed) == 1 {
		return allowed[0]
	}
	return 0
}

func containsID(ids []int64, want int64) bool {
	for _, id := range ids {
		if id == want {
			return true
		}
	}
	return false
}

// isolationOn reports whether strict commercial isolation applies for this request.
func isolationOn(tu auth.TenantUser) bool {
	return tu.StrictBranchIsolation
}

// AssertCommercialLocationAccess denies when isolation is on and location is outside the allowed set.
func AssertCommercialLocationAccess(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, locationID int64) error {
	if locationID <= 0 {
		return ErrForbiddenLocation
	}
	if !isolationOn(tu) || CanViewAllBranchCommercial(tu) {
		return nil
	}
	allowed, err := CommercialLocationIDs(ctx, pool, tu)
	if err != nil {
		return err
	}
	if len(allowed) == 0 {
		return ErrIsolationClosed
	}
	if !containsID(allowed, locationID) {
		return ErrForbiddenLocation
	}
	return nil
}

// ApplyCommercialLocationSQL appends location filters when isolation is on.
// unrestricted (owner): only ActiveBranch voluntary narrow is NOT applied (owner sees all unless explicit).
// restricted: location IN allowed AND operating branch equality when resolved > 0.
func ApplyCommercialLocationSQL(
	ctx context.Context,
	pool *pgxpool.Pool,
	tu auth.TenantUser,
	locationColumn string,
	argIdx int,
	args *[]any,
) (string, int, error) {
	if locationColumn == "" {
		return "", argIdx, nil
	}
	if !isolationOn(tu) || CanViewAllBranchCommercial(tu) {
		return "", argIdx, nil
	}
	allowed, err := CommercialLocationIDs(ctx, pool, tu)
	if err != nil {
		return "", argIdx, err
	}
	if len(allowed) == 0 {
		return " and 1=0", argIdx, nil
	}
	op := ResolveOperatingBranch(tu, allowed, true)
	if op > 0 {
		frag := fmt.Sprintf(" and %s = $%d", locationColumn, argIdx)
		*args = append(*args, op)
		return frag, argIdx + 1, nil
	}
	placeholders := make([]string, len(allowed))
	for i, id := range allowed {
		placeholders[i] = fmt.Sprintf("$%d", argIdx)
		*args = append(*args, id)
		argIdx++
	}
	frag := fmt.Sprintf(" and %s in (%s)", locationColumn, strings.Join(placeholders, ","))
	return frag, argIdx, nil
}

// EnsureInTransitLocation returns the tenant's in-transit location id, creating if needed.
func EnsureInTransitLocation(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (int64, error) {
	var id int64
	err := pool.QueryRow(ctx, `
		select id from public.inv_locations
		where tenant_id = $1 and location_type = 'in_transit' and deleted_at is null
		order by id limit 1`, tenantID).Scan(&id)
	if err == nil {
		return id, nil
	}
	if err != pgx.ErrNoRows {
		return 0, err
	}
	err = pool.QueryRow(ctx, `
		insert into public.inv_locations (
		  tenant_id, location_code, location_name, location_type, production_process, status, is_rma
		) values ($1, 'INTRN', 'In Transit', 'in_transit', 'bundle', 'active', false)
		returning id`, tenantID).Scan(&id)
	return id, err
}

// HTTPStatus maps branchiso errors to status + message.
func HTTPStatus(err error) (int, string, string) {
	switch {
	case errors.Is(err, ErrForbiddenLocation):
		return 403, "You cannot access records for that branch.", "ERR_BRANCH_FORBIDDEN"
	case errors.Is(err, ErrIsolationClosed):
		return 403, "No home branch is assigned. Ask an owner to set your home location.", "ERR_BRANCH_HOME_REQUIRED"
	default:
		return 500, "Failed to check branch access.", "ERR_INTERNAL"
	}
}
