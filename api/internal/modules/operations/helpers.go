package operations

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func orderSQL(order string) string {
	if strings.EqualFold(order, "desc") {
		return "desc"
	}
	return "asc"
}

func workspaceBelongsToTenant(ctx context.Context, pool *pgxpool.Pool, tenantID, workspaceID int64) bool {
	var ok bool
	_ = pool.QueryRow(ctx, `
		select exists(select 1 from public.wm_workspaces where id = $1 and tenant_id = $2)`,
		workspaceID, tenantID).Scan(&ok)
	return ok
}

func firstActiveTaxTypeID(ctx context.Context, tx pgx.Tx, tenantID int64) (int64, error) {
	var id int64
	err := tx.QueryRow(ctx, `
		select id from public.quo_tax_types
		where tenant_id = $1 and status = 'active' and deleted_at is null
		order by id limit 1`, tenantID).Scan(&id)
	return id, err
}

func defaultCurrencyID(ctx context.Context, tx pgx.Tx, tenantID int64) (int64, error) {
	var id int64
	err := tx.QueryRow(ctx, `
		select id from public.inv_currencies
		where tenant_id = $1 and status = 'active' and deleted_at is null
		order by is_default desc, id limit 1`, tenantID).Scan(&id)
	return id, err
}

func firstActiveLocationID(ctx context.Context, tx pgx.Tx, tenantID int64) (int64, error) {
	var id int64
	err := tx.QueryRow(ctx, `
		select id from public.inv_locations
		where tenant_id = $1 and status = 'active' and deleted_at is null
		order by id limit 1`, tenantID).Scan(&id)
	return id, err
}
