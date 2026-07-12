package operations

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
)

// EmitERPEvent evaluates active workspace automation rules for the given event.
// Event names match rule trigger_event values (e.g. work_item.created).
func EmitERPEvent(ctx context.Context, pool *pgxpool.Pool, tenantID int64, event string, payload map[string]any) {
	if pool == nil || strings.TrimSpace(event) == "" {
		return
	}
	if err := runAutomation(ctx, pool, tenantID, event, payload); err != nil {
		log.Printf("operations automation: event=%s tenant=%d err=%v", event, tenantID, err)
	}
}

func runAutomation(ctx context.Context, pool *pgxpool.Pool, tenantID int64, event string, payload map[string]any) error {
	workspaceID := int64From(payload["workspace_id"])
	workItemID := int64From(payload["work_item_id"])

	where := "tenant_id = $1 and is_active = true and trigger_event = $2"
	args := []any{tenantID, event}
	n := 3
	if workspaceID > 0 {
		where += fmt.Sprintf(" and (workspace_id is null or workspace_id = $%d)", n)
		args = append(args, workspaceID)
		n++
	}

	q := fmt.Sprintf(`
		select id, workspace_id, rule_name, trigger_event, trigger_config, action_type, action_config
		from public.wm_automation_rules
		where %s
		order by id`, where)
	rows, err := pool.Query(ctx, q, args...)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var rule AutomationRule
		var triggerRaw, actionRaw []byte
		if err := rows.Scan(
			&rule.ID, &rule.WorkspaceID, &rule.RuleName, &rule.TriggerEvent,
			&triggerRaw, &rule.ActionType, &actionRaw,
		); err != nil {
			return err
		}
		_ = json.Unmarshal(triggerRaw, &rule.TriggerConfig)
		_ = json.Unmarshal(actionRaw, &rule.ActionConfig)
		if rule.TriggerConfig == nil {
			rule.TriggerConfig = map[string]any{}
		}
		if rule.ActionConfig == nil {
			rule.ActionConfig = map[string]any{}
		}
		if !triggerMatches(rule.TriggerConfig, payload) {
			continue
		}
		if err := executeAction(ctx, pool, tenantID, workItemID, rule, event, payload); err != nil {
			log.Printf("operations automation: rule=%d action=%s err=%v", rule.ID, rule.ActionType, err)
		}
	}
	return rows.Err()
}

func triggerMatches(cfg, payload map[string]any) bool {
	if len(cfg) == 0 {
		return true
	}
	if v, ok := cfg["column_id"]; ok {
		want := int64From(v)
		got := int64From(payload["column_id"])
		if want > 0 && want != got {
			return false
		}
	}
	if v, ok := cfg["column_key"]; ok {
		want := strings.TrimSpace(fmt.Sprint(v))
		got := strings.TrimSpace(fmt.Sprint(payload["column_key"]))
		if want != "" && !strings.EqualFold(want, got) {
			return false
		}
	}
	if v, ok := cfg["to_column_key"]; ok {
		want := strings.TrimSpace(fmt.Sprint(v))
		got := strings.TrimSpace(fmt.Sprint(payload["column_key"]))
		if want != "" && !strings.EqualFold(want, got) {
			return false
		}
	}
	if v, ok := cfg["status"]; ok {
		want := strings.TrimSpace(fmt.Sprint(v))
		got := strings.TrimSpace(fmt.Sprint(payload["status"]))
		if want != "" && !strings.EqualFold(want, got) {
			return false
		}
	}
	return true
}

func executeAction(ctx context.Context, pool *pgxpool.Pool, tenantID, workItemID int64, rule AutomationRule, event string, payload map[string]any) error {
	msg := strings.TrimSpace(fmt.Sprint(rule.ActionConfig["message"]))
	if msg == "" {
		msg = fmt.Sprintf("Automation “%s” ran (%s).", rule.RuleName, event)
	}

	switch strings.TrimSpace(rule.ActionType) {
	case "notify", "log":
		actorID := int64From(payload["actor_user_id"])
		detail := map[string]any{
			"rule_id":      rule.ID,
			"rule_name":    rule.RuleName,
			"event":        event,
			"message":      msg,
			"work_item_id": workItemID,
			"payload":      payload,
		}
		action := "operations.automation.log"
		if rule.ActionType == "notify" {
			action = "operations.automation.notify"
		}
		var target *int64
		if workItemID > 0 {
			target = &workItemID
		}
		return audit.Log(ctx, pool, tenantID, actorID, action, "wm_work_item", target, nil, detail)

	case "set_status":
		if workItemID <= 0 {
			return nil
		}
		status := defaultItemStatus(fmt.Sprint(rule.ActionConfig["status"]))
		_, err := pool.Exec(ctx, `
			update public.wm_work_items set status = $3, updated_at = now()
			where id = $1 and tenant_id = $2`, workItemID, tenantID, status)
		return err

	case "set_priority":
		if workItemID <= 0 {
			return nil
		}
		priority := defaultPriority(fmt.Sprint(rule.ActionConfig["priority"]))
		_, err := pool.Exec(ctx, `
			update public.wm_work_items set priority = $3, updated_at = now()
			where id = $1 and tenant_id = $2`, workItemID, tenantID, priority)
		return err

	default:
		actorID := int64From(payload["actor_user_id"])
		detail := map[string]any{
			"rule_id": rule.ID, "rule_name": rule.RuleName,
			"action_type": rule.ActionType, "event": event, "message": msg,
		}
		var target *int64
		if workItemID > 0 {
			target = &workItemID
		}
		return audit.Log(ctx, pool, tenantID, actorID, "operations.automation.unknown_action", "wm_work_item", target, nil, detail)
	}
}

func int64From(v any) int64 {
	switch t := v.(type) {
	case nil:
		return 0
	case int64:
		return t
	case int:
		return int64(t)
	case float64:
		return int64(t)
	case json.Number:
		n, _ := t.Int64()
		return n
	case string:
		n, _ := strconv.ParseInt(strings.TrimSpace(t), 10, 64)
		return n
	default:
		n, _ := strconv.ParseInt(strings.TrimSpace(fmt.Sprint(t)), 10, 64)
		return n
	}
}
