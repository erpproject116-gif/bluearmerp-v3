package approval

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/outbox"
)

type pendingApprovalPayload struct {
	EntityType  string `json:"entity_type"`
	EntityID    int64  `json:"entity_id"`
	EntityLabel string `json:"entity_label,omitempty"`
	Submitter   string `json:"submitter,omitempty"`
}

// EnqueuePendingApprovalTx queues email notification for approvers (same transaction as submit).
func EnqueuePendingApprovalTx(ctx context.Context, tx pgx.Tx, tenantID int64, entityType string, entityID int64, entityLabel, submitter string) error {
	payload := pendingApprovalPayload{
		EntityType:  entityType,
		EntityID:    entityID,
		EntityLabel: entityLabel,
		Submitter:   submitter,
	}
	key := fmt.Sprintf("approval.pending:%s:%d", entityType, entityID)
	return outbox.EnqueueTx(ctx, tx, tenantID, "approval.pending", key, payload)
}

// HandleOutboxEvent sends pending approval emails when SMTP is configured.
func HandleOutboxEvent(ctx context.Context, pool *pgxpool.Pool, ev outbox.Event) error {
	if ev.EventType != "approval.pending" {
		return nil
	}
	var p pendingApprovalPayload
	if err := json.Unmarshal(ev.Payload, &p); err != nil {
		return err
	}
	cfg := outbox.LoadSMTPConfig()
	if !cfg.Enabled() {
		log.Printf("approval outbox: tenant=%d entity=%s/%d — SMTP not configured", ev.TenantID, p.EntityType, p.EntityID)
		return nil
	}
	perm := approverPermissionForEntity(p.EntityType)
	if perm == "" {
		return nil
	}
	rows, err := pool.Query(ctx, `
		select distinct u.email
		from public.users u
		join public.tenant_user_roles tur on tur.user_id = u.id and tur.tenant_id = $1
		join public.tenant_role_permissions trp on trp.tenant_id = tur.tenant_id and trp.role_code = tur.role_code
		where u.tenant_id = $1 and u.is_active = true
		  and trp.permission_code = $2 and trp.access_level in ('write', 'submit')
		  and coalesce(trim(u.email), '') <> ''`, ev.TenantID, perm)
	if err != nil {
		return err
	}
	defer rows.Close()
	label := p.EntityLabel
	if label == "" {
		label = fmt.Sprintf("%s #%d", p.EntityType, p.EntityID)
	}
	subject := fmt.Sprintf("[Bluearm ERP] Approval pending: %s", label)
	body := fmt.Sprintf("An item requires your approval.\n\nType: %s\nReference: %s\nSubmitted by: %s\n\nOpen the Approvals queue in Bluearm ERP to review.",
		p.EntityType, label, strings.TrimSpace(p.Submitter))
	sent := 0
	for rows.Next() {
		var email string
		if err := rows.Scan(&email); err != nil {
			return err
		}
		if err := outbox.SendEmail(cfg, email, subject, body); err != nil {
			log.Printf("approval outbox: failed to email %s: %v", email, err)
			continue
		}
		sent++
	}
	if sent == 0 {
		log.Printf("approval outbox: tenant=%d no approver emails for %s", ev.TenantID, perm)
	}
	return nil
}

// DrainOutbox processes pending approval outbox events.
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

func approverPermissionForEntity(entityType string) string {
	switch strings.TrimSpace(entityType) {
	case "purchase_request", "pr_purchase_request":
		return "purchase_request.approve"
	case "journal_entry", "fin_journal_entry":
		return "finance.journal_entries"
	default:
		return "purchase_request.approve"
	}
}
