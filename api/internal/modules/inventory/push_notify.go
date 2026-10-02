package inventory

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/jackc/pgx/v5/pgxpool"
)

// trySendTransferPush delivers Web Push when VAPID is configured and subscriptions exist.
// Without secrets this is a documented no-op (USER ACTION: set VAPID keys + redeploy).
func trySendTransferPush(ctx context.Context, pool *pgxpool.Pool, tenantID, entryID int64, title, body string) error {
	pub := strings.TrimSpace(os.Getenv("VAPID_PUBLIC_KEY"))
	priv := strings.TrimSpace(os.Getenv("VAPID_PRIVATE_KEY"))
	if pub == "" || priv == "" {
		return nil
	}
	rows, err := pool.Query(ctx, `
		select endpoint, p256dh, auth
		from public.user_push_subscriptions
		where tenant_id = $1`, tenantID)
	if err != nil {
		return err
	}
	defer rows.Close()

	deepLink := fmt.Sprintf("/app/inventory/stock-entries?focus=%d", entryID)
	payload, _ := json.Marshal(map[string]any{
		"title": title,
		"body":  body,
		"url":   deepLink,
		"data":  map[string]any{"url": deepLink, "entry_id": entryID},
	})
	subject := strings.TrimSpace(os.Getenv("VAPID_SUBJECT"))
	if subject == "" {
		subject = "mailto:ops@bluearmerp.com"
	}
	opts := &webpush.Options{
		Subscriber:      subject,
		VAPIDPublicKey:  pub,
		VAPIDPrivateKey: priv,
		TTL:             60,
	}

	sent := 0
	for rows.Next() {
		var endpoint, p256dh, authKey string
		if err := rows.Scan(&endpoint, &p256dh, &authKey); err != nil {
			continue
		}
		resp, err := webpush.SendNotification(payload, &webpush.Subscription{
			Endpoint: endpoint,
			Keys: webpush.Keys{
				P256dh: p256dh,
				Auth:   authKey,
			},
		}, opts)
		if err != nil {
			log.Printf("webpush: send failed tenant=%d entry=%d: %v", tenantID, entryID, err)
			continue
		}
		if resp != nil {
			_ = resp.Body.Close()
			if resp.StatusCode == 404 || resp.StatusCode == 410 {
				_, _ = pool.Exec(ctx, `
					delete from public.user_push_subscriptions
					where tenant_id = $1 and endpoint = $2`, tenantID, endpoint)
			}
			if resp.StatusCode >= 200 && resp.StatusCode < 300 {
				sent++
			}
		}
	}
	if sent > 0 {
		log.Printf("webpush: transfer tenant=%d entry=%d delivered=%d", tenantID, entryID, sent)
	}
	return nil
}
