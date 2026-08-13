package support

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/outbox"
)

type ticketUpdatedPayload struct {
	TicketID       int64    `json:"ticket_id"`
	TicketNo       string   `json:"ticket_no"`
	Subject        string   `json:"subject"`
	Status         string   `json:"status"`
	Priority       string   `json:"priority"`
	AssignedUserID *int64   `json:"assigned_user_id,omitempty"`
	CreatedByID    *int64   `json:"created_by_user_id,omitempty"`
	ChangedFields  []string `json:"changed_fields"`
	ActorUserID    int64    `json:"actor_user_id"`
}

func ptrEqualInt64(a, b *int64) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return *a == *b
}

func notifyTicketUpdate(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, before, after Ticket) {
	var changed []string
	if before.Status != after.Status {
		changed = append(changed, "status")
	}
	if before.Priority != after.Priority {
		changed = append(changed, "priority")
	}
	if !ptrEqualInt64(before.AssignedUserID, after.AssignedUserID) {
		changed = append(changed, "assignee")
	}
	if before.Subject != after.Subject {
		changed = append(changed, "subject")
	}
	if len(changed) == 0 {
		return
	}

	payload := ticketUpdatedPayload{
		TicketID:       after.ID,
		TicketNo:       after.TicketNo,
		Subject:        after.Subject,
		Status:         after.Status,
		Priority:       after.Priority,
		AssignedUserID: after.AssignedUserID,
		CreatedByID:    after.CreatedByUserID,
		ChangedFields:  changed,
		ActorUserID:    tu.AppUserID,
	}
	idemKey := fmt.Sprintf("support.ticket_updated:%d:%d:%d", tu.TenantID, after.ID, time.Now().UnixNano())
	tx, err := pool.Begin(ctx)
	if err == nil {
		if e := outbox.EnqueueTx(ctx, tx, tu.TenantID, "support.ticket_updated", idemKey, payload); e != nil {
			log.Printf("support: enqueue ticket_updated %s: %v", after.TicketNo, e)
			_ = tx.Rollback(ctx)
		} else if e := tx.Commit(ctx); e != nil {
			log.Printf("support: commit ticket_updated outbox %s: %v", after.TicketNo, e)
		}
	} else {
		log.Printf("support: begin ticket_updated outbox %s: %v", after.TicketNo, err)
	}

	title := fmt.Sprintf("Ticket %s updated", after.TicketNo)
	body := fmt.Sprintf("%s — status is now %s.", after.Subject, strings.ReplaceAll(after.Status, "_", " "))
	if containsStr(changed, "assignee") {
		assignee := after.AssignedName
		if assignee == "" {
			assignee = "unassigned"
		}
		body = fmt.Sprintf("%s — assigned to %s (status: %s).", after.Subject, assignee, strings.ReplaceAll(after.Status, "_", " "))
	}

	recipients := ticketNotifyRecipients(after.CreatedByUserID, after.AssignedUserID, before.AssignedUserID, tu.AppUserID)

	entityType := "support_ticket"
	severity := ticketNotifySeverity(after.Priority, changed)
	assigneeKey := "0"
	if after.AssignedUserID != nil {
		assigneeKey = fmt.Sprintf("%d", *after.AssignedUserID)
	}
	for _, userID := range recipients {
		// Include resulting values so successive status changes still notify
		// (dedupe_key is unique per tenant; field names alone are not enough).
		dedupe := fmt.Sprintf("support.ticket_updated:%d:%d:%d:%s:%s:%s:%s",
			tu.TenantID, after.ID, userID, after.Status, after.Priority, assigneeKey, strings.Join(changed, ","))
		_, err := pool.Exec(ctx, `
			insert into public.crm_notifications (
			  tenant_id, user_id, severity, title, body, entity_type, entity_id, dedupe_key, actor_user_id, source
			) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'support')
			on conflict (tenant_id, dedupe_key) do nothing`,
			tu.TenantID, userID, severity, title, body, entityType, after.ID, dedupe, tu.AppUserID)
		if err != nil {
			log.Printf("support: notify user %d on ticket %s: %v", userID, after.TicketNo, err)
		}
	}

	_ = DrainOutbox(ctx, pool)
}

func containsStr(list []string, want string) bool {
	for _, s := range list {
		if s == want {
			return true
		}
	}
	return false
}

// ticketNotifySeverity picks bell severity from ticket priority and changed fields.
func ticketNotifySeverity(priority string, changed []string) string {
	p := strings.ToLower(strings.TrimSpace(priority))
	if p == "urgent" || p == "high" {
		return "critical"
	}
	if containsStr(changed, "status") || containsStr(changed, "assignee") {
		return "warning"
	}
	return "info"
}

// ticketNotifyRecipients returns user IDs that should receive a bell row (actor excluded).
func ticketNotifyRecipients(createdBy, assignedAfter, assignedBefore *int64, actorUserID int64) []int64 {
	set := map[int64]struct{}{}
	if createdBy != nil && *createdBy > 0 {
		set[*createdBy] = struct{}{}
	}
	if assignedAfter != nil && *assignedAfter > 0 {
		set[*assignedAfter] = struct{}{}
	}
	if assignedBefore != nil && *assignedBefore > 0 {
		set[*assignedBefore] = struct{}{}
	}
	delete(set, actorUserID)
	out := make([]int64, 0, len(set))
	for id := range set {
		out = append(out, id)
	}
	return out
}
