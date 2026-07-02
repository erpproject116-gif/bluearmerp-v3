package support

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/outbox"
)

type ticketCreatedPayload struct {
	TicketID        int64  `json:"ticket_id"`
	TicketNo        string `json:"ticket_no"`
	Subject         string `json:"subject"`
	PartnerID       int64  `json:"partner_id"`
	AssignedUserID  *int64 `json:"assigned_user_id,omitempty"`
	NotifyStub      bool   `json:"notify_stub"`
}

// HandleOutboxEvent processes support outbox events and sends assignee email when SMTP is configured.
func HandleOutboxEvent(ctx context.Context, pool *pgxpool.Pool, ev outbox.Event) error {
	if ev.EventType != "support.ticket_created" {
		return nil
	}
	var p ticketCreatedPayload
	if len(ev.Payload) > 0 {
		_ = json.Unmarshal(ev.Payload, &p)
	}
	cfg := outbox.LoadSMTPConfig()
	if !cfg.Enabled() {
		log.Printf("support outbox: tenant=%d ticket=%s — SMTP not configured, skipping email",
			ev.TenantID, p.TicketNo)
		return nil
	}
	var toEmail string
	if p.AssignedUserID != nil && *p.AssignedUserID > 0 {
		_ = pool.QueryRow(ctx, `
			select coalesce(email, '') from public.users where id = $1 and tenant_id = $2`,
			*p.AssignedUserID, ev.TenantID).Scan(&toEmail)
	}
	if strings.TrimSpace(toEmail) == "" {
		log.Printf("support outbox: tenant=%d ticket=%s — no assignee email", ev.TenantID, p.TicketNo)
		return nil
	}
	subject := fmt.Sprintf("[Support] New ticket %s: %s", p.TicketNo, p.Subject)
	body := fmt.Sprintf("A new support ticket was created.\n\nTicket: %s\nSubject: %s\n\nOpen the ERP Support module to respond.",
		p.TicketNo, p.Subject)
	if err := outbox.SendEmail(cfg, toEmail, subject, body); err != nil {
		return err
	}
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
