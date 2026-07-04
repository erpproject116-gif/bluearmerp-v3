package datascope

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

// ListFilter configures optional column references for data-scope filtering.
type ListFilter struct {
	CustomerColumn string // e.g. "so.partner_id"
	LocationColumn string // e.g. "so.location_id"
}

// ApplyUserScopesSQL appends AND fragments when the user's role enforces data scopes.
func ApplyUserScopesSQL(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, f ListFilter, argIdx int, args *[]any) (string, int, error) {
	if tu.IsPlatformSuperadmin || tu.IsTenantOwner {
		return "", argIdx, nil
	}
	var apply bool
	err := pool.QueryRow(ctx, `
		select coalesce(tr.apply_user_scopes, false)
		from public.tenant_roles tr
		where tr.tenant_id = $1 and tr.role_code = $2`,
		tu.TenantID, tu.TenantRole).Scan(&apply)
	if err != nil || !apply {
		return "", argIdx, err
	}

	rows, err := pool.Query(ctx, `
		select scope_type, record_id from public.user_data_scopes
		where tenant_id = $1 and user_id = $2`,
		tu.TenantID, tu.AppUserID)
	if err != nil {
		return "", argIdx, err
	}
	defer rows.Close()

	var customers, locations []int64
	for rows.Next() {
		var scopeType string
		var recordID int64
		if err := rows.Scan(&scopeType, &recordID); err != nil {
			return "", argIdx, err
		}
		switch scopeType {
		case "customer":
			customers = append(customers, recordID)
		case "location", "warehouse":
			locations = append(locations, recordID)
		}
	}
	if err := rows.Err(); err != nil {
		return "", argIdx, err
	}

	// Fail closed: a user whose role enforces data scopes but who has NO scope rows at all
	// sees nothing, instead of everything. (Zero scope rows almost always means an admin
	// enabled scoping on the role but has not yet assigned the user any branches/customers.)
	// Users with only customer scopes or only location scopes are unaffected: they keep the
	// existing per-dimension filtering below.
	if len(customers) == 0 && len(locations) == 0 {
		return " and 1=0", argIdx, nil
	}

	var frag strings.Builder
	if len(customers) > 0 && f.CustomerColumn != "" {
		placeholders := make([]string, len(customers))
		for i, id := range customers {
			placeholders[i] = fmt.Sprintf("$%d", argIdx)
			*args = append(*args, id)
			argIdx++
		}
		frag.WriteString(fmt.Sprintf(" and %s in (%s)", f.CustomerColumn, strings.Join(placeholders, ",")))
	}
	if len(locations) > 0 && f.LocationColumn != "" {
		placeholders := make([]string, len(locations))
		for i, id := range locations {
			placeholders[i] = fmt.Sprintf("$%d", argIdx)
			*args = append(*args, id)
			argIdx++
		}
		frag.WriteString(fmt.Sprintf(" and %s in (%s)", f.LocationColumn, strings.Join(placeholders, ",")))
	}
	return frag.String(), argIdx, nil
}
