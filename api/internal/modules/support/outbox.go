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
	TicketID       int64  `json:"ticket_id"`
	TicketNo       string `json:"ticket_no"`
	Subject        string `json:"subject"`
	PartnerID      *int64 `json:"partner_id,omitempty"`
	AssignedUserID *int64 `json:"assigned_user_id,omitempty"`
	NotifyStub     bool   `json:"notify_stub"`
}

// HandleOutboxEvent processes support outbox events and sends email when SMTP is configured.
func HandleOutboxEvent(ctx context.Context, pool *pgxpool.Pool, ev outbox.Event) error {
	switch ev.EventType {
	case "support.ticket_created":
		return handleTicketCreatedEmail(ctx, pool, ev)
	case "support.ticket_updated":
		return handleTicketUpdatedEmail(ctx, pool, ev)
	default:
		return nil
	}
}

func handleTicketCreatedEmail(ctx context.Context, pool *pgxpool.Pool, ev outbox.Event) error {
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
	return outbox.SendEmail(cfg, toEmail, subject, body)
}

func handleTicketUpdatedEmail(ctx context.Context, pool *pgxpool.Pool, ev outbox.Event) error {
	var p ticketUpdatedPayload
	if len(ev.Payload) > 0 {
		_ = json.Unmarshal(ev.Payload, &p)
	}
	cfg := outbox.LoadSMTPConfig()
	if !cfg.Enabled() {
		log.Printf("support outbox: tenant=%d ticket=%s updated — SMTP not configured, skipping email",
			ev.TenantID, p.TicketNo)
		return nil
	}

	recipients := map[int64]struct{}{}
	if p.CreatedByID != nil && *p.CreatedByID > 0 {
		recipients[*p.CreatedByID] = struct{}{}
	}
	if p.AssignedUserID != nil && *p.AssignedUserID > 0 {
		recipients[*p.AssignedUserID] = struct{}{}
	}
	delete(recipients, p.ActorUserID)

	statusLabel := strings.ReplaceAll(p.Status, "_", " ")
	subject := fmt.Sprintf("[Support] Ticket %s updated", p.TicketNo)
	body := fmt.Sprintf("Ticket %s (%s) was updated.\n\nStatus: %s\nPriority: %s\nChanged: %s\n\nOpen the ERP Support module for details.",
		p.TicketNo, p.Subject, statusLabel, p.Priority, strings.Join(p.ChangedFields, ", "))

	for userID := range recipients {
		var toEmail string
		_ = pool.QueryRow(ctx, `
			select coalesce(email, '') from public.users where id = $1 and tenant_id = $2`,
			userID, ev.TenantID).Scan(&toEmail)
		if strings.TrimSpace(toEmail) == "" {
			continue
		}
		if err := outbox.SendEmail(cfg, toEmail, subject, body); err != nil {
			return err
		}
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
