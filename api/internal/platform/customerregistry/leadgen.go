package customerregistry

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/config"
)

// LeadgenTenantID resolves the home tenant that owns platform CRM leads (default BLUEARM).
func LeadgenTenantID(ctx context.Context, pool *pgxpool.Pool, leadgenCode string) (int64, bool) {
	code := strings.TrimSpace(leadgenCode)
	if code == "" {
		return 0, false
	}
	var id int64
	err := pool.QueryRow(ctx,
		`select id from public.tenants where company_code = $1`, code).Scan(&id)
	if err != nil {
		return 0, false
	}
	return id, true
}

func LeadgenTenantIDFromCfg(ctx context.Context, pool *pgxpool.Pool, cfg config.Config) (int64, bool) {
	return LeadgenTenantID(ctx, pool, cfg.DemoLeadgenTenantCode)
}
