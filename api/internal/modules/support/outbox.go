package support

import (
	"context"
	"encoding/json"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/outbox"
)

type ticketCreatedPayload struct {
	TicketID   int64  `json:"ticket_id"`
	TicketNo   string `json:"ticket_no"`
	Subject    string `json:"subject"`
	PartnerID  int64  `json:"partner_id"`
	NotifyStub bool   `json:"notify_stub"`
}

// HandleOutboxEvent processes support outbox events (email-on-create stub logs payload).
func HandleOutboxEvent(ctx context.Context, pool *pgxpool.Pool, ev outbox.Event) error {
	if ev.EventType != "support.ticket_created" {
		return nil
	}
	var p ticketCreatedPayload
	if len(ev.Payload) > 0 {
		_ = json.Unmarshal(ev.Payload, &p)
	}
	log.Printf("support outbox stub: tenant=%d ticket=%s (%d) subject=%q partner=%d — email notify placeholder",
		ev.TenantID, p.TicketNo, p.TicketID, p.Subject, p.PartnerID)
	return nil
}

// DrainOutbox processes pending support-related outbox events.
func DrainOutbox(ctx context.Context, pool *pgxpool.Pool) error {
	for {
		n, err := outbox.DrainPending(ctx, pool, HandleOutboxEvent)
		if err != nil {
			return err
		}
		if n == 0 {
			return nil
		}
	}
}
