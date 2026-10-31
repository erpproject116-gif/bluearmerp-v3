package outbound

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	workerOnce sync.Once
	workerStop chan struct{}
)

// StartWorker polls pending deliveries and POSTs signed payloads with retry/backoff.
func StartWorker(pool *pgxpool.Pool) {
	if pool == nil {
		return
	}
	workerOnce.Do(func() {
		workerStop = make(chan struct{})
		go runDeliveryWorker(pool)
	})
}

func runDeliveryWorker(pool *pgxpool.Pool) {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-workerStop:
			return
		case <-ticker.C:
			processDueDeliveries(context.Background(), pool, 20)
		}
	}
}

type dueRow struct {
	ID         int64
	TenantID   int64
	EndpointID *int64
	Event      string
	BodyJSON   string
	Attempts   int
}

func processDueDeliveries(ctx context.Context, pool *pgxpool.Pool, limit int) {
	if limit <= 0 {
		limit = 20
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return
	}
	defer tx.Rollback(ctx)

	// Claim due rows by pushing next_attempt_at forward so another poll won't re-grab them.
	rows, err := tx.Query(ctx, `
		with due as (
		  select id
		  from public.tenant_outbound_webhook_deliveries
		  where status = 'pending' and next_attempt_at <= now()
		  order by next_attempt_at, id
		  limit $1
		  for update skip locked
		)
		update public.tenant_outbound_webhook_deliveries d
		set next_attempt_at = now() + interval '5 minutes'
		from due
		where d.id = due.id
		returning d.id, d.tenant_id, d.endpoint_id, d.event, d.body_json, d.attempts`, limit)
	if err != nil {
		return
	}
	var batch []dueRow
	for rows.Next() {
		var r dueRow
		if err := rows.Scan(&r.ID, &r.TenantID, &r.EndpointID, &r.Event, &r.BodyJSON, &r.Attempts); err != nil {
			continue
		}
		batch = append(batch, r)
	}
	rows.Close()
	if err := rows.Err(); err != nil || len(batch) == 0 {
		return
	}
	if err := tx.Commit(ctx); err != nil {
		return
	}

	for _, r := range batch {
		deliverOne(ctx, pool, r)
	}
}

func deliverOne(ctx context.Context, pool *pgxpool.Pool, r dueRow) {
	var cfg *config
	var err error
	if r.EndpointID != nil && *r.EndpointID > 0 {
		cfg, err = loadEndpoint(ctx, pool, r.TenantID, *r.EndpointID)
	} else {
		cfgs, e2 := loadActiveEndpoints(ctx, pool, r.TenantID)
		err = e2
		if len(cfgs) > 0 {
			c := cfgs[0]
			cfg = &c
		}
	}
	if err != nil || cfg == nil || !cfg.Active || cfg.URL == "" || cfg.Secret == "" {
		markFailed(ctx, pool, r.ID, r.Attempts, "webhook inactive or incomplete config")
		return
	}
	if err := ValidateTargetURL(cfg.URL); err != nil {
		markFailed(ctx, pool, r.ID, r.Attempts, "blocked target_url: "+err.Error())
		return
	}
	body := []byte(r.BodyJSON)
	sig := signBody(cfg.Secret, body)
	reqCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, cfg.URL, bytes.NewReader(body))
	if err != nil {
		scheduleRetry(ctx, pool, r, err.Error())
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Bluearm-Signature", "sha256="+sig)
	req.Header.Set("X-Bluearm-Event", r.Event)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		scheduleRetry(ctx, pool, r, err.Error())
		return
	}
	_ = resp.Body.Close()
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		_, _ = pool.Exec(ctx, `
			update public.tenant_outbound_webhook_deliveries
			set status = 'delivered', attempts = $2, last_error = '', delivered_at = now()
			where id = $1`, r.ID, r.Attempts+1)
		return
	}
	scheduleRetry(ctx, pool, r, fmt.Sprintf("http_status=%d", resp.StatusCode))
}

func scheduleRetry(ctx context.Context, pool *pgxpool.Pool, r dueRow, errMsg string) {
	nextAttempts := r.Attempts + 1
	if nextAttempts >= maxDeliveryAttempts {
		markFailed(ctx, pool, r.ID, nextAttempts, errMsg)
		return
	}
	nextAt := time.Now().UTC().Add(backoffDuration(nextAttempts))
	_, err := pool.Exec(ctx, `
		update public.tenant_outbound_webhook_deliveries
		set attempts = $2, last_error = $3, next_attempt_at = $4, status = 'pending'
		where id = $1`,
		r.ID, nextAttempts, truncateErr(errMsg), nextAt,
	)
	if err != nil {
		log.Printf("outbound webhook: retry schedule id=%d: %v", r.ID, err)
	}
}

func markFailed(ctx context.Context, pool *pgxpool.Pool, id int64, attempts int, errMsg string) {
	_, _ = pool.Exec(ctx, `
		update public.tenant_outbound_webhook_deliveries
		set status = 'failed', attempts = $2, last_error = $3
		where id = $1`, id, attempts, truncateErr(errMsg))
}

func truncateErr(s string) string {
	if len(s) > 500 {
		return s[:500]
	}
	return s
}
