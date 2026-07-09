package operations

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type AutomationRule struct {
	ID            int64          `json:"id"`
	WorkspaceID   *int64         `json:"workspace_id,omitempty"`
	RuleName      string         `json:"rule_name"`
	TriggerEvent  string         `json:"trigger_event"`
	TriggerConfig map[string]any `json:"trigger_config"`
	ActionType    string         `json:"action_type"`
	ActionConfig  map[string]any `json:"action_config"`
	IsActive      bool           `json:"is_active"`
}

type automationRuleBody struct {
	WorkspaceID   *int64         `json:"workspace_id"`
	RuleName      string         `json:"rule_name"`
	TriggerEvent  string         `json:"trigger_event"`
	TriggerConfig map[string]any `json:"trigger_config"`
	ActionType    string         `json:"action_type"`
	ActionConfig  map[string]any `json:"action_config"`
	IsActive      *bool          `json:"is_active"`
}

type automationRulePatchBody struct {
	RuleName      *string        `json:"rule_name"`
	TriggerEvent  *string        `json:"trigger_event"`
	TriggerConfig map[string]any `json:"trigger_config"`
	ActionType    *string        `json:"action_type"`
	ActionConfig  map[string]any `json:"action_config"`
	IsActive      *bool          `json:"is_active"`
}

func registerAutomationRoutes(r chi.Router, pool *pgxpool.Pool) {
	ar := r.With(auth.RequirePermission("operations.automation", auth.AccessRead))
	ar.Get("/automation-rules", listAutomationRules(pool))
	ar.Get("/automation-rules/{id}", getAutomationRule(pool))
	ar.With(auth.RequirePermission("operations.automation", auth.AccessWrite)).Post("/automation-rules", createAutomationRule(pool))
	ar.With(auth.RequirePermission("operations.automation", auth.AccessWrite)).Patch("/automation-rules/{id}", patchAutomationRule(pool))
	ar.With(auth.RequirePermission("operations.automation", auth.AccessWrite)).Delete("/automation-rules/{id}", deleteAutomationRule(pool))
}

func listAutomationRules(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "rule_name", map[string]string{"rule_name": "r.rule_name"})
		offset := httputil.Offset(p)
		where := "r.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if wsID, err := strconv.ParseInt(r.URL.Query().Get("workspace_id"), 10, 64); err == nil && wsID > 0 {
			where += fmt.Sprintf(" and r.workspace_id = $%d", n)
			args = append(args, wsID)
			n++
		}
		q := fmt.Sprintf(`
			select r.id, r.workspace_id, r.rule_name, r.trigger_event, r.trigger_config,
			  r.action_type, r.action_config, r.is_active, count(*) over()
			from public.wm_automation_rules r
			where %s
			order by r.rule_name asc
			limit $%d offset $%d`, where, n, n+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list automation rules.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []AutomationRule
		var total int64
		for rows.Next() {
			var row AutomationRule
			var triggerRaw, actionRaw []byte
			if err := rows.Scan(
				&row.ID, &row.WorkspaceID, &row.RuleName, &row.TriggerEvent, &triggerRaw,
				&row.ActionType, &actionRaw, &row.IsActive, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read automation rules.", "ERR_INTERNAL")
				return
			}
			_ = json.Unmarshal(triggerRaw, &row.TriggerConfig)
			_ = json.Unmarshal(actionRaw, &row.ActionConfig)
			if row.TriggerConfig == nil {
				row.TriggerConfig = map[string]any{}
			}
			if row.ActionConfig == nil {
				row.ActionConfig = map[string]any{}
			}
			out = append(out, row)
		}
		if out == nil {
			out = []AutomationRule{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getAutomationRule(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		row, err := loadAutomationRule(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Rule not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, row, "OK")
	}
}

func createAutomationRule(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body automationRuleBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateAutomationRuleBody(body); errs != nil {
			response.Validation(w, errs)
			return
		}
		if body.WorkspaceID != nil && !workspaceBelongsToTenant(r.Context(), pool, tu.TenantID, *body.WorkspaceID) {
			response.Validation(w, map[string]string{"workspace_id": "Workspace not found."})
			return
		}
		triggerCfg, _ := json.Marshal(defaultMap(body.TriggerConfig))
		actionCfg, _ := json.Marshal(defaultMap(body.ActionConfig))
		active := true
		if body.IsActive != nil {
			active = *body.IsActive
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.wm_automation_rules (
			  tenant_id, workspace_id, rule_name, trigger_event, trigger_config,
			  action_type, action_config, is_active
			) values ($1,$2,$3,$4,$5,$6,$7,$8)
			returning id`,
			tu.TenantID, body.WorkspaceID, strings.TrimSpace(body.RuleName),
			strings.TrimSpace(body.TriggerEvent), triggerCfg,
			strings.TrimSpace(body.ActionType), actionCfg, active,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create rule.", "ERR_INTERNAL")
			return
		}
		row, _ := loadAutomationRule(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "operations.automation_rule.create", "wm_automation_rule", &id, nil, body)
		response.OK(w, row, "Created.")
	}
}

func patchAutomationRule(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body automationRulePatchBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		sets := []string{"updated_at = now()"}
		args := []any{id, tu.TenantID}
		n := 3
		if body.RuleName != nil {
			sets = append(sets, fmt.Sprintf("rule_name = $%d", n))
			args = append(args, strings.TrimSpace(*body.RuleName))
			n++
		}
		if body.TriggerEvent != nil {
			sets = append(sets, fmt.Sprintf("trigger_event = $%d", n))
			args = append(args, strings.TrimSpace(*body.TriggerEvent))
			n++
		}
		if body.TriggerConfig != nil {
			raw, _ := json.Marshal(body.TriggerConfig)
			sets = append(sets, fmt.Sprintf("trigger_config = $%d", n))
			args = append(args, raw)
			n++
		}
		if body.ActionType != nil {
			sets = append(sets, fmt.Sprintf("action_type = $%d", n))
			args = append(args, strings.TrimSpace(*body.ActionType))
			n++
		}
		if body.ActionConfig != nil {
			raw, _ := json.Marshal(body.ActionConfig)
			sets = append(sets, fmt.Sprintf("action_config = $%d", n))
			args = append(args, raw)
			n++
		}
		if body.IsActive != nil {
			sets = append(sets, fmt.Sprintf("is_active = $%d", n))
			args = append(args, *body.IsActive)
			n++
		}
		q := fmt.Sprintf(`update public.wm_automation_rules set %s where id = $1 and tenant_id = $2`, strings.Join(sets, ", "))
		tag, err := pool.Exec(r.Context(), q, args...)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Rule not found.", "ERR_NOT_FOUND")
			return
		}
		row, _ := loadAutomationRule(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "operations.automation_rule.update", "wm_automation_rule", &id, nil, row)
		response.OK(w, row, "Updated.")
	}
}

func deleteAutomationRule(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			delete from public.wm_automation_rules where id = $1 and tenant_id = $2`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Rule not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "operations.automation_rule.delete", "wm_automation_rule", &id, nil, nil)
		response.OK(w, map[string]any{"id": id}, "Deleted.")
	}
}

func loadAutomationRule(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (AutomationRule, error) {
	var row AutomationRule
	var triggerRaw, actionRaw []byte
	err := pool.QueryRow(ctx, `
		select id, workspace_id, rule_name, trigger_event, trigger_config,
		  action_type, action_config, is_active
		from public.wm_automation_rules
		where id = $1 and tenant_id = $2`, id, tenantID).Scan(
		&row.ID, &row.WorkspaceID, &row.RuleName, &row.TriggerEvent, &triggerRaw,
		&row.ActionType, &actionRaw, &row.IsActive,
	)
	if err != nil {
		return row, err
	}
	_ = json.Unmarshal(triggerRaw, &row.TriggerConfig)
	_ = json.Unmarshal(actionRaw, &row.ActionConfig)
	if row.TriggerConfig == nil {
		row.TriggerConfig = map[string]any{}
	}
	if row.ActionConfig == nil {
		row.ActionConfig = map[string]any{}
	}
	return row, nil
}

func validateAutomationRuleBody(body automationRuleBody) map[string]string {
	errs := map[string]string{}
	if strings.TrimSpace(body.RuleName) == "" {
		errs["rule_name"] = "Rule name is required."
	}
	if strings.TrimSpace(body.TriggerEvent) == "" {
		errs["trigger_event"] = "Trigger event is required."
	}
	if strings.TrimSpace(body.ActionType) == "" {
		errs["action_type"] = "Action type is required."
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func defaultMap(m map[string]any) map[string]any {
	if m == nil {
		return map[string]any{}
	}
	return m
}
