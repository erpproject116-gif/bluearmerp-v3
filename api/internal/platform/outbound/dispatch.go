package outbound

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const maxDeliveryAttempts = 5

// Emit enqueues a signed JSON event for each active tenant outbound webhook endpoint.
// Safe to call from CRM/booking/ops paths; does not wait on remote HTTP.
func Emit(ctx context.Context, pool *pgxpool.Pool, tenantID int64, event string, payload map[string]any) {
	if pool == nil || tenantID <= 0 || strings.TrimSpace(event) == "" {
		return
	}
	cfgs, err := loadActiveEndpoints(ctx, pool, tenantID)
	if err != nil || len(cfgs) == 0 {
		return
	}
	body := map[string]any{
		"event":       event,
		"tenant_id":   tenantID,
		"occurred_at": time.Now().UTC().Format(time.RFC3339),
		"payload":     payload,
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return
	}
	for _, cfg := range cfgs {
		if !eventAllowed(cfg.Filter, event) {
			continue
		}
		if strings.TrimSpace(cfg.URL) == "" || strings.TrimSpace(cfg.Secret) == "" {
			continue
		}
		_, err = pool.Exec(ctx, `
			insert into public.tenant_outbound_webhook_deliveries (
			  tenant_id, endpoint_id, event, body_json, status, next_attempt_at
			) values ($1, $2, $3, $4, 'pending', now())`,
			tenantID, cfg.ID, event, string(raw),
		)
		if err != nil {
			log.Printf("outbound webhook: tenant=%d endpoint=%d enqueue: %v", tenantID, cfg.ID, err)
		}
	}
}

type config struct {
	ID     int64
	URL    string
	Secret string
	Active bool
	Filter []string
}

func loadActiveEndpoints(ctx context.Context, pool *pgxpool.Pool, tenantID int64) ([]config, error) {
	rows, err := pool.Query(ctx, `
		select id, coalesce(target_url,''), coalesce(signing_secret,''), is_active, coalesce(event_filter,'[]'::jsonb)
		from public.tenant_outbound_webhook_endpoints
		where tenant_id = $1 and is_active = true`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []config
	for rows.Next() {
		var c config
		var filterRaw []byte
		if err := rows.Scan(&c.ID, &c.URL, &c.Secret, &c.Active, &filterRaw); err != nil {
			continue
		}
		_ = json.Unmarshal(filterRaw, &c.Filter)
		out = append(out, c)
	}
	return out, rows.Err()
}

func loadEndpoint(ctx context.Context, pool *pgxpool.Pool, tenantID, endpointID int64) (*config, error) {
	var c config
	var filterRaw []byte
	err := pool.QueryRow(ctx, `
		select id, coalesce(target_url,''), coalesce(signing_secret,''), is_active, coalesce(event_filter,'[]'::jsonb)
		from public.tenant_outbound_webhook_endpoints
		where tenant_id = $1 and id = $2`, tenantID, endpointID,
	).Scan(&c.ID, &c.URL, &c.Secret, &c.Active, &filterRaw)
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal(filterRaw, &c.Filter)
	return &c, nil
}

func eventAllowed(filter []string, event string) bool {
	if len(filter) == 0 {
		return true
	}
	for _, f := range filter {
		f = strings.TrimSpace(f)
		if f == "" || f == "*" || strings.EqualFold(f, event) {
			return true
		}
		if strings.HasSuffix(f, ".*") {
			prefix := strings.TrimSuffix(f, ".*")
			if strings.HasPrefix(event, prefix+".") {
				return true
			}
		}
	}
	return false
}

func signBody(secret string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

// VerifySignature checks X-Bluearm-Signature for receivers (tests / docs).
func VerifySignature(secret, header string, body []byte) bool {
	header = strings.TrimSpace(header)
	header = strings.TrimPrefix(header, "sha256=")
	want := signBody(secret, body)
	return hmac.Equal([]byte(want), []byte(header))
}

func backoffDuration(attemptsAfterFail int) time.Duration {
	if attemptsAfterFail < 1 {
		attemptsAfterFail = 1
	}
	sec := 30 << (attemptsAfterFail - 1)
	if sec > 900 {
		sec = 900
	}
	return time.Duration(sec) * time.Second
}
