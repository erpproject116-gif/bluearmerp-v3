package notify

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// FromAudit mirrors create/update audit events into the in-app notification bell
// (crm_notifications). Actor is stored so list endpoints can hide the actor's own events.
func FromAudit(ctx context.Context, pool *pgxpool.Pool, tenantID, actorUserID int64, actionCode, targetType string, targetID *int64) {
	if pool == nil || !shouldNotify(actionCode) {
		return
	}
	title, body := describeAction(actionCode, targetType, targetID)
	dedupe := fmt.Sprintf("act:%s:%v:%d", actionCode, targetID, time.Now().UnixNano())
	var entityID any
	if targetID != nil {
		entityID = *targetID
	} else {
		entityID = nil
	}
	var actor any
	if actorUserID > 0 {
		actor = actorUserID
	} else {
		actor = nil
	}
	_, _ = pool.Exec(ctx, `
		insert into public.crm_notifications
		  (tenant_id, user_id, rule_id, severity, title, body, entity_type, entity_id, dedupe_key, actor_user_id)
		values ($1, null, null, 'info', $2, $3, $4, $5, $6, $7)
		on conflict (tenant_id, dedupe_key) do nothing`,
		tenantID, title, body, nullIfEmpty(targetType), entityID, dedupe, actor)
}

func shouldNotify(actionCode string) bool {
	if actionCode == "" {
		return false
	}
	if strings.Contains(actionCode, ".attachment.") {
		return false
	}
	if strings.Contains(actionCode, ".list") || strings.Contains(actionCode, ".export") {
		return false
	}
	interesting := strings.HasSuffix(actionCode, ".create") ||
		strings.HasSuffix(actionCode, ".update") ||
		strings.HasSuffix(actionCode, ".delete") ||
		strings.HasSuffix(actionCode, ".restore") ||
		strings.Contains(actionCode, ".progress") ||
		strings.Contains(actionCode, ".confirm") ||
		strings.Contains(actionCode, ".checkout") ||
		strings.Contains(actionCode, ".build") ||
		strings.Contains(actionCode, ".share") ||
		strings.HasSuffix(actionCode, ".post")
	if !interesting {
		return false
	}
	prefixes := []string{
		"quotation.", "sales.", "sales_order.", "purchase.", "purchase_order.", "purchase_request.",
		"goods_receipt.", "delivery_receipt.", "finance.", "inventory.", "crm.", "support.",
		"hr.", "pos.", "operations.", "shipping.",
	}
	for _, p := range prefixes {
		if strings.HasPrefix(actionCode, p) {
			return true
		}
	}
	return false
}

func describeAction(actionCode, targetType string, targetID *int64) (title, body string) {
	parts := strings.Split(actionCode, ".")
	verb := "updated"
	if len(parts) > 0 {
		last := parts[len(parts)-1]
		switch last {
		case "create":
			verb = "created"
		case "update", "patch":
			verb = "updated"
		case "delete":
			verb = "deleted"
		case "restore":
			verb = "restored"
		case "confirm":
			verb = "confirmed"
		case "checkout":
			verb = "checked out"
		case "post":
			verb = "posted"
		default:
			verb = strings.ReplaceAll(last, "_", " ")
		}
	}
	module := actionCode
	if len(parts) > 1 {
		module = strings.ReplaceAll(parts[0], "_", " ")
	}
	entity := strings.TrimSpace(targetType)
	if entity == "" && len(parts) > 1 {
		entity = parts[1]
	}
	entity = strings.ReplaceAll(entity, "_", " ")
	title = fmt.Sprintf("%s %s", capitalizeWord(module), verb)
	if targetID != nil {
		body = fmt.Sprintf("%s #%d was %s.", entity, *targetID, verb)
	} else {
		body = fmt.Sprintf("%s was %s (%s).", entity, verb, actionCode)
	}
	return title, body
}

func capitalizeWord(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "Activity"
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

func nullIfEmpty(s string) any {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return s
}
