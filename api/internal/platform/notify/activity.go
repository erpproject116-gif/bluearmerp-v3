package notify

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// FromAudit mirrors create/update audit events into the in-app notification bell
// (crm_notifications) and the owner change-alert digest queue.
// Actor is stored so list endpoints can hide the actor's own events.
func FromAudit(ctx context.Context, pool *pgxpool.Pool, tenantID, actorUserID int64, actionCode, targetType string, targetID *int64, oldJSON, newJSON []byte) {
	if pool == nil || !shouldNotify(actionCode) {
		return
	}
	title, body := describeAction(actionCode, targetType, targetID)
	body = enrichTrailBody(ctx, pool, tenantID, actorUserID, actionCode, targetType, targetID, body, oldJSON, newJSON)
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
	QueueChangeAlert(ctx, pool, tenantID, actorUserID, actionCode, title, body, targetType, targetID)
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
		strings.HasSuffix(actionCode, ".post") ||
		strings.Contains(actionCode, ".send_email")
	if !interesting {
		return false
	}
	prefixes := []string{
		"quotation.", "sales.", "sales_order.", "purchase.", "purchase_order.", "purchase_request.",
		"goods_receipt.", "delivery_receipt.", "finance.", "inventory.", "crm.", "support.",
		"hr.", "pos.", "operations.", "shipping.", "booking.",
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
		case "send_email":
			verb = "emailed"
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

func enrichTrailBody(ctx context.Context, pool *pgxpool.Pool, tenantID, actorUserID int64, actionCode, targetType string, targetID *int64, body string, oldJSON, newJSON []byte) string {
	var parts []string
	parts = append(parts, body)

	if actor := lookupActorLabel(ctx, pool, tenantID, actorUserID); actor != "" {
		parts = append(parts, "by "+actor)
	}
	if ref := lookupDocRef(ctx, pool, tenantID, targetType, targetID); ref != "" {
		parts = append(parts, "doc "+ref)
	}
	if diff := summarizeFieldChanges(oldJSON, newJSON); diff != "" {
		parts = append(parts, "changed: "+diff)
	}
	parts = append(parts, "at "+time.Now().UTC().Format("2006-01-02 15:04 UTC"))
	return strings.Join(parts, " · ")
}

func lookupActorLabel(ctx context.Context, pool *pgxpool.Pool, tenantID, actorUserID int64) string {
	if actorUserID <= 0 {
		return ""
	}
	var name, email string
	err := pool.QueryRow(ctx, `
		select coalesce(nullif(trim(full_name), ''), ''), coalesce(nullif(trim(email), ''), '')
		from public.users where id = $1 and tenant_id = $2`, actorUserID, tenantID).Scan(&name, &email)
	if err != nil {
		return ""
	}
	if name != "" && email != "" {
		return name + " <" + email + ">"
	}
	if name != "" {
		return name
	}
	return email
}

func lookupDocRef(ctx context.Context, pool *pgxpool.Pool, tenantID int64, targetType string, targetID *int64) string {
	if targetID == nil || *targetID <= 0 {
		return ""
	}
	id := *targetID
	var ref string
	var err error
	switch strings.TrimSpace(targetType) {
	case "quo_quotation", "quotation":
		err = pool.QueryRow(ctx, `
			select coalesce(nullif(trim(reference_no), ''), id::text)
			from public.quo_quotations where id = $1 and tenant_id = $2`, id, tenantID).Scan(&ref)
	case "so_sales_order", "sales_order":
		err = pool.QueryRow(ctx, `
			select coalesce(nullif(trim(sales_order_no), ''), id::text)
			from public.so_sales_orders where id = $1 and tenant_id = $2`, id, tenantID).Scan(&ref)
	case "sa_sale", "sales", "sa_sales":
		err = pool.QueryRow(ctx, `
			select coalesce(nullif(trim(sales_no), ''), id::text)
			from public.sa_sales where id = $1 and tenant_id = $2`, id, tenantID).Scan(&ref)
	case "po_purchase_order", "purchase_order":
		err = pool.QueryRow(ctx, `
			select coalesce(nullif(trim(purchase_order_no), ''), id::text)
			from public.po_purchase_orders where id = $1 and tenant_id = $2`, id, tenantID).Scan(&ref)
	case "fin_supplier_invoice", "supplier_invoice", "purchase":
		err = pool.QueryRow(ctx, `
			select coalesce(nullif(trim(invoice_no), ''), id::text)
			from public.fin_supplier_invoices where id = $1 and tenant_id = $2`, id, tenantID).Scan(&ref)
	case "pr_purchase_request", "purchase_request":
		err = pool.QueryRow(ctx, `
			select coalesce(nullif(trim(purchase_request_no), ''), id::text)
			from public.pr_purchase_requests where id = $1 and tenant_id = $2`, id, tenantID).Scan(&ref)
	default:
		return ""
	}
	if err != nil {
		if err != pgx.ErrNoRows {
			return ""
		}
		return ""
	}
	return ref
}

func summarizeFieldChanges(oldJSON, newJSON []byte) string {
	if len(oldJSON) == 0 && len(newJSON) == 0 {
		return ""
	}
	var oldMap, newMap map[string]any
	_ = json.Unmarshal(oldJSON, &oldMap)
	_ = json.Unmarshal(newJSON, &newMap)
	if oldMap == nil {
		oldMap = map[string]any{}
	}
	if newMap == nil {
		newMap = map[string]any{}
	}
	skip := map[string]bool{
		"updated_at": true, "created_at": true, "deleted_at": true,
		"lines": true, "items": true,
	}
	keys := map[string]struct{}{}
	for k := range oldMap {
		keys[k] = struct{}{}
	}
	for k := range newMap {
		keys[k] = struct{}{}
	}
	var changed []string
	for k := range keys {
		if skip[k] || strings.HasSuffix(k, "_id") && k != "partner_id" && k != "status" {
			// still allow partner_id / status-like fields that matter
			if k != "partner_id" && k != "progress_status" && k != "status" && strings.HasSuffix(k, "_id") {
				continue
			}
			if skip[k] {
				continue
			}
		}
		ov, oOk := oldMap[k]
		nv, nOk := newMap[k]
		if !oOk && nOk {
			changed = append(changed, k+"="+shortVal(nv))
			continue
		}
		if oOk && !nOk {
			changed = append(changed, k+" removed")
			continue
		}
		if fmt.Sprint(ov) != fmt.Sprint(nv) {
			changed = append(changed, fmt.Sprintf("%s: %s→%s", k, shortVal(ov), shortVal(nv)))
		}
	}
	if len(changed) == 0 {
		if len(newMap) > 0 && len(oldMap) == 0 {
			return "new record"
		}
		return ""
	}
	if len(changed) > 8 {
		changed = append(changed[:8], fmt.Sprintf("+%d more", len(changed)-8))
	}
	return strings.Join(changed, ", ")
}

func shortVal(v any) string {
	s := strings.TrimSpace(fmt.Sprint(v))
	if len(s) > 40 {
		return s[:37] + "..."
	}
	if s == "" {
		return "∅"
	}
	return s
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
