package operations

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customfields"
)

const entityWorkItem = "ops_work_item"

func attachCustom(ctx context.Context, pool *pgxpool.Pool, tenantID, entityID int64) map[string]any {
	vals, err := customfields.LoadValues(ctx, pool, tenantID, entityWorkItem, entityID)
	if err != nil || len(vals) == 0 {
		return nil
	}
	return vals
}

func attachListCustom(ctx context.Context, pool *pgxpool.Pool, tenantID int64, out []WorkItem) {
	if len(out) == 0 {
		return
	}
	ids := make([]int64, len(out))
	for i, row := range out {
		ids[i] = row.ID
	}
	batch, err := customfields.LoadValuesBatch(ctx, pool, tenantID, entityWorkItem, ids)
	if err != nil {
		return
	}
	for i := range out {
		if vals, ok := batch[out[i].ID]; ok && len(vals) > 0 {
			out[i].CustomValues = vals
		}
	}
}

func saveCustom(ctx context.Context, tx pgx.Tx, tenantID, entityID int64, values map[string]any) map[string]string {
	return customfields.ValidateAndSave(ctx, tx, tenantID, entityWorkItem, entityID, values)
}
