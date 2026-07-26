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
	// ExplicitLocationID is set from ?location_id= when the caller wants to override
	// the active branch header. When nil, ApplyUserScopesSQL uses X-Branch-ID only
	// for roles that enforce user data scopes.
	ExplicitLocationID *int64
}

// applyExplicitLocationSQL appends an equality filter when the client asked for a
// voluntary ?location_id= (owners and unscoped roles can still narrow the grid).
func applyExplicitLocationSQL(f ListFilter, argIdx int, args *[]any) (string, int) {
	if f.ExplicitLocationID == nil || *f.ExplicitLocationID <= 0 || f.LocationColumn == "" {
		return "", argIdx
	}
	frag := fmt.Sprintf(" and %s = $%d", f.LocationColumn, argIdx)
	*args = append(*args, *f.ExplicitLocationID)
	return frag, argIdx + 1
}

// ApplyUserScopesSQL appends AND fragments when the user's role enforces data scopes.
// Owners, platform superadmins, and roles without apply_user_scopes still honor
// ExplicitLocationID so voluntary UI filters work company-wide.
func ApplyUserScopesSQL(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, f ListFilter, argIdx int, args *[]any) (string, int, error) {
	if tu.IsPlatformSuperadmin || tu.IsTenantOwner {
		frag, argIdx := applyExplicitLocationSQL(f, argIdx, args)
		return frag, argIdx, nil
	}
	// apply_user_scopes rides on TenantUser (loaded with the session), so a handler
	// that filters several queries no longer repeats the tenant_roles lookup.
	if !tu.ApplyUserScopes {
		frag, argIdx := applyExplicitLocationSQL(f, argIdx, args)
		return frag, argIdx, nil
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

	locID := ResolveLocationFilter(tu, f.ExplicitLocationID)
	if locID != nil && f.LocationColumn != "" {
		frag.WriteString(fmt.Sprintf(" and %s = $%d", f.LocationColumn, argIdx))
		*args = append(*args, *locID)
		argIdx++
	}
	return frag.String(), argIdx, nil
}
