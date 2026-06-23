package audit

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/config"
)

type logEvent struct {
	tenantID    int64
	actorUserID int64
	actionCode  string
	targetType  string
	targetID    *int64
	oldJSON     []byte
	newJSON     []byte
}

var (
	asyncEnabled = true
	batchSize    = 100
	flushEvery   = 75 * time.Millisecond
	channelCap   = 4096

	workerOnce sync.Once
	workerPool *pgxpool.Pool
	eventCh    chan logEvent
	stopCh     chan struct{}
	wg         sync.WaitGroup
)

func Configure(cfg config.Config) {
	asyncEnabled = cfg.AuditAsync
	batchSize = cfg.AuditBatchSize
	if batchSize < 1 {
		batchSize = 100
	}
	flushEvery = time.Duration(cfg.AuditFlushIntervalMs) * time.Millisecond
	if flushEvery < time.Millisecond {
		flushEvery = 75 * time.Millisecond
	}
	channelCap = cfg.AuditChannelSize
	if channelCap < 64 {
		channelCap = 4096
	}
	if os.Getenv("AUDIT_ASYNC") == "false" {
		asyncEnabled = false
	}
}

// IsCriticalActionCode reports whether an audit event must be written synchronously.
func IsCriticalActionCode(actionCode string) bool {
	if actionCode == "sales.price_batch" {
		return true
	}
	criticalPrefixes := []string{
		"finance.",
		"inventory.stock_",
		"user.",
		"role.",
		"group.",
		"crm.job.",
	}
	for _, p := range criticalPrefixes {
		if strings.HasPrefix(actionCode, p) {
			return true
		}
	}
	return false
}

func Log(ctx context.Context, pool *pgxpool.Pool, tenantID, actorUserID int64, actionCode, targetType string, targetID *int64, oldValues, newValues any) error {
	if IsCriticalActionCode(actionCode) || !asyncEnabled {
		return LogSync(ctx, pool, tenantID, actorUserID, actionCode, targetType, targetID, oldValues, newValues)
	}
	Enqueue(ctx, tenantID, actorUserID, actionCode, targetType, targetID, oldValues, newValues)
	return nil
}

func LogSync(ctx context.Context, pool *pgxpool.Pool, tenantID, actorUserID int64, actionCode, targetType string, targetID *int64, oldValues, newValues any) error {
	ev, err := buildEvent(tenantID, actorUserID, actionCode, targetType, targetID, oldValues, newValues)
	if err != nil {
		return err
	}
	return insertOne(ctx, pool, ev)
}

func Enqueue(ctx context.Context, tenantID, actorUserID int64, actionCode, targetType string, targetID *int64, oldValues, newValues any) {
	ev, err := buildEvent(tenantID, actorUserID, actionCode, targetType, targetID, oldValues, newValues)
	if err != nil {
		log.Printf("audit: enqueue marshal: %v", err)
		return
	}
	if eventCh == nil {
		return
	}
	select {
	case eventCh <- ev:
	default:
		deadline := time.NewTimer(50 * time.Millisecond)
		defer deadline.Stop()
		select {
		case eventCh <- ev:
		case <-deadline.C:
			if workerPool != nil {
				if err := insertOne(context.Background(), workerPool, ev); err != nil {
					log.Printf("audit: sync fallback failed: %v", err)
				} else {
					log.Printf("audit: channel full, sync fallback for %s", actionCode)
				}
			}
		case <-ctx.Done():
		}
	}
}

func buildEvent(tenantID, actorUserID int64, actionCode, targetType string, targetID *int64, oldValues, newValues any) (logEvent, error) {
	var ev logEvent
	ev.tenantID = tenantID
	ev.actorUserID = actorUserID
	ev.actionCode = actionCode
	ev.targetType = targetType
	ev.targetID = targetID
	if oldValues != nil {
		b, err := json.Marshal(oldValues)
		if err != nil {
			return ev, err
		}
		ev.oldJSON = b
	}
	if newValues != nil {
		b, err := json.Marshal(newValues)
		if err != nil {
			return ev, err
		}
		ev.newJSON = b
	}
	return ev, nil
}

func insertOne(ctx context.Context, pool *pgxpool.Pool, ev logEvent) error {
	_, err := pool.Exec(ctx, `
		insert into public.audit_logs
		  (tenant_id, actor_user_id, action_code, target_type, target_id, old_values, new_values)
		values ($1, $2, $3, $4, $5, $6, $7)`,
		ev.tenantID, ev.actorUserID, ev.actionCode, ev.targetType, ev.targetID, ev.oldJSON, ev.newJSON)
	return err
}

func insertBatch(ctx context.Context, pool *pgxpool.Pool, batch []logEvent) error {
	for _, ev := range batch {
		if err := insertOne(ctx, pool, ev); err != nil {
			return err
		}
	}
	return nil
}

func StartWorker(pool *pgxpool.Pool, cfg config.Config) {
	if !cfg.AuditAsync {
		return
	}
	workerOnce.Do(func() {
		Configure(cfg)
		workerPool = pool
		eventCh = make(chan logEvent, channelCap)
		stopCh = make(chan struct{})
		wg.Add(1)
		go runWorker()
	})
}

func runWorker() {
	defer wg.Done()
	ticker := time.NewTicker(flushEvery)
	defer ticker.Stop()
	batch := make([]logEvent, 0, batchSize)
	flush := func() {
		if len(batch) == 0 || workerPool == nil {
			return
		}
		toFlush := batch
		batch = make([]logEvent, 0, batchSize)
		if err := insertBatch(context.Background(), workerPool, toFlush); err != nil {
			log.Printf("audit: batch insert failed (%d rows): %v", len(toFlush), err)
			for _, ev := range toFlush {
				if err := insertOne(context.Background(), workerPool, ev); err != nil {
					log.Printf("audit: row fallback failed: %v", err)
				}
			}
		}
	}
	for {
		select {
		case ev := <-eventCh:
			batch = append(batch, ev)
			if len(batch) >= batchSize {
				flush()
				ticker.Reset(flushEvery)
			}
		case <-ticker.C:
			flush()
		case <-stopCh:
			for {
				select {
				case ev := <-eventCh:
					batch = append(batch, ev)
				default:
					flush()
					return
				}
			}
		}
	}
}

func Shutdown(ctx context.Context) error {
	if stopCh == nil {
		return nil
	}
	close(stopCh)
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
