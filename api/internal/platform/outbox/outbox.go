package outbox

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5"
)

// EnqueueTx inserts a pending outbox row in the same transaction as business data.
func EnqueueTx(ctx context.Context, tx pgx.Tx, tenantID int64, eventType, idempotencyKey string, payload any) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		insert into public.outbox_events (tenant_id, event_type, idempotency_key, payload)
		values ($1, $2, $3, $4)
		on conflict (tenant_id, idempotency_key) do nothing`,
		tenantID, eventType, idempotencyKey, raw)
	return err
}
