package outbox

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Event struct {
	ID             int64
	TenantID       int64
	EventType      string
	IdempotencyKey string
	Payload        json.RawMessage
}

const drainBatchSize = 50

// DrainPending processes up to batchSize pending events; returns count processed.
func DrainPending(ctx context.Context, pool *pgxpool.Pool, handler func(ctx context.Context, pool *pgxpool.Pool, ev Event) error) (int, error) {
	rows, err := pool.Query(ctx, `
		select id, tenant_id, event_type, idempotency_key, payload
		from public.outbox_events
		where status = 'pending'
		order by created_at
		limit $1
		for update skip locked`, drainBatchSize)
	if err != nil {
		return 0, err
	}
	var events []Event
	for rows.Next() {
		var ev Event
		if err := rows.Scan(&ev.ID, &ev.TenantID, &ev.EventType, &ev.IdempotencyKey, &ev.Payload); err != nil {
			rows.Close()
			return 0, err
		}
		events = append(events, ev)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	processed := 0
	for _, ev := range events {
		tag, err := pool.Exec(ctx, `
			update public.outbox_events set status = 'processing'
			where id = $1 and status = 'pending'`, ev.ID)
		if err != nil || tag.RowsAffected() == 0 {
			continue
		}
		if err := handler(ctx, pool, ev); err != nil {
			_, _ = pool.Exec(ctx, `
				update public.outbox_events set status = 'failed', processed_at = $2
				where id = $1`, ev.ID, time.Now())
			continue
		}
		_, _ = pool.Exec(ctx, `
			update public.outbox_events set status = 'done', processed_at = $2
			where id = $1`, ev.ID, time.Now())
		processed++
	}
	return processed, nil
}
