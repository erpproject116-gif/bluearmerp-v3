package outbound

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Emit posts a signed JSON event to the tenant outbound webhook when configured.
// Safe to call from CRM/booking/ops paths; failures are logged only.
func Emit(ctx context.Context, pool *pgxpool.Pool, tenantID int64, event string, payload map[string]any) {
	if pool == nil || tenantID <= 0 || strings.TrimSpace(event) == "" {
		return
	}
	cfg, err := loadConfig(ctx, pool, tenantID)
	if err != nil || cfg == nil || !cfg.Active || strings.TrimSpace(cfg.URL) == "" || strings.TrimSpace(cfg.Secret) == "" {
		return
	}
	if !eventAllowed(cfg.Filter, event) {
		return
	}
	body := map[string]any{
		"event":      event,
		"tenant_id":  tenantID,
		"occurred_at": time.Now().UTC().Format(time.RFC3339),
		"payload":    payload,
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return
	}
	sig := signBody(cfg.Secret, raw)
	go func() {
		reqCtx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, cfg.URL, bytes.NewReader(raw))
		if err != nil {
			log.Printf("outbound webhook: tenant=%d build req: %v", tenantID, err)
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Bluearm-Signature", "sha256="+sig)
		req.Header.Set("X-Bluearm-Event", event)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			log.Printf("outbound webhook: tenant=%d event=%s post: %v", tenantID, event, err)
			return
		}
		_ = resp.Body.Close()
		if resp.StatusCode >= 300 {
			log.Printf("outbound webhook: tenant=%d event=%s status=%d", tenantID, event, resp.StatusCode)
		}
	}()
}

type config struct {
	URL    string
	Secret string
	Active bool
	Filter []string
}

func loadConfig(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (*config, error) {
	var url, secret string
	var active bool
	var filterRaw []byte
	err := pool.QueryRow(ctx, `
		select coalesce(target_url,''), coalesce(signing_secret,''), is_active, coalesce(event_filter,'[]'::jsonb)
		from public.tenant_outbound_webhooks where tenant_id = $1`, tenantID,
	).Scan(&url, &secret, &active, &filterRaw)
	if err != nil {
		return nil, err
	}
	var filter []string
	_ = json.Unmarshal(filterRaw, &filter)
	return &config{URL: url, Secret: secret, Active: active, Filter: filter}, nil
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
