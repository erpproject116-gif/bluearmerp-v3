package demodata

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// SeedTenant populates a single target tenant with the given industry template.
// It is best-effort (a failing late-chain step is recorded but does not abort the
// whole run) and skips the manufacturing-specific verify chain, making it suitable
// for self-service demo provisioning where a usable-but-partial seed beats none.
// Returns the per-script results for logging/diagnostics.
func SeedTenant(ctx context.Context, pool *pgxpool.Pool, industry string, tenantID int64) ([]StepResult, error) {
	return runPopulate(ctx, pool, industry, tenantID, false, true)
}
