package inventory

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customfields"
)

const (
	entityPartner    = "inv_partner"
	entityLocation   = "inv_location"
	entityProject    = "inv_project"
	entityDepartment = "inv_department"
	entityItem       = "inv_item"
)

func mergeCustomValues(ctx context.Context, pool *pgxpool.Pool, tenantID int64, entityType string, ids []int64, apply func(id int64, vals map[string]any)) {
	batch, err := customfields.LoadValuesBatch(ctx, pool, tenantID, entityType, ids)
	if err != nil {
		return
	}
	for id, vals := range batch {
		if len(vals) > 0 {
			apply(id, vals)
		}
	}
}

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

func persistCustom(ctx context.Context, pool *pgxpool.Pool, tenantID int64, entityType string, entityID int64, values map[string]any) map[string]string {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return map[string]string{"custom_values": "Failed to save custom fields."}
	}
	defer tx.Rollback(ctx)
	if errs := saveCustom(ctx, tx, tenantID, entityType, entityID, values); errs != nil {
		return errs
	}
	if err := tx.Commit(ctx); err != nil {
		return map[string]string{"custom_values": "Failed to save custom fields."}
	}
	return nil
}

func attachListCustom[T any](ctx context.Context, pool *pgxpool.Pool, tenantID int64, entityType string, out []T, idOf func(T) int64, set func(*T, map[string]any)) {
	ids := make([]int64, len(out))
	for i, row := range out {
		ids[i] = idOf(row)
	}
	mergeCustomValues(ctx, pool, tenantID, entityType, ids, func(id int64, vals map[string]any) {
		for i := range out {
			if idOf(out[i]) == id {
				set(&out[i], vals)
				return
			}
		}
	})
}
