package datascope

import "github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"

// ResolveLocationFilter returns the location id to apply on list queries.
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
