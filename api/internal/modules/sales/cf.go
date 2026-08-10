package sales

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customfields"
)

const entitySales = "sa_sales"

func attachCustom(ctx context.Context, pool *pgxpool.Pool, tenantID int64, entityType string, entityID int64) map[string]any {
	vals, err := customfields.LoadValues(ctx, pool, tenantID, entityType, entityID)
	if err != nil || len(vals) == 0 {
		return nil
	}
	return vals
}

func saveCustom(ctx context.Context, tx pgx.Tx, tenantID int64, entityType string, entityID int64, values map[string]any) map[string]string {
	return customfields.ValidateAndSave(ctx, tx, tenantID, entityType, entityID, values)
}
