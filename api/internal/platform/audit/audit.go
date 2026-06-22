package audit

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5/pgxpool"
)

func Log(ctx context.Context, pool *pgxpool.Pool, tenantID, actorUserID int64, actionCode, targetType string, targetID *int64, oldValues, newValues any) error {
	var oldJSON, newJSON []byte
	var err error
	if oldValues != nil {
		oldJSON, err = json.Marshal(oldValues)
		if err != nil {
			return err
		}
	}
	if newValues != nil {
		newJSON, err = json.Marshal(newValues)
		if err != nil {
			return err
		}
	}
	_, err = pool.Exec(ctx, `
		insert into public.audit_logs
		  (tenant_id, actor_user_id, action_code, target_type, target_id, old_values, new_values)
		values ($1, $2, $3, $4, $5, $6, $7)`,
		tenantID, actorUserID, actionCode, targetType, targetID, oldJSON, newJSON)
	return err
}
