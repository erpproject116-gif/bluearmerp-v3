package purchaserequest

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/taxcalc"
)

func loadTaxCalcType(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (taxcalc.TaxType, error) {
	var tt taxcalc.TaxType
	err := pool.QueryRow(ctx, `
		select tax_mode, rate_percent::float8
		from public.quo_tax_types
		where id = $1 and tenant_id = $2 and deleted_at is null and status = 'active'`,
		id, tenantID).Scan(&tt.TaxMode, &tt.RatePercent)
	return tt, err
}
