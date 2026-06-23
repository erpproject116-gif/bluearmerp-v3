package crm

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type AlertRule struct {
	ID              int64           `json:"id"`
	RuleType        string          `json:"rule_type"`
	Name            string          `json:"name"`
	IsEnabled       bool            `json:"is_enabled"`
	LeadValue       int             `json:"lead_value"`
	LeadUnit        string          `json:"lead_unit"`
	ThresholdJSON   json.RawMessage `json:"threshold_json"`
	NotifyRoleCodes []string        `json:"notify_role_codes"`
	NotifyUserIDs   []int64         `json:"notify_user_ids"`
	SortOrder       int             `json:"sort_order"`
}

type alertRulePatchBody struct {
	Name            *string          `json:"name"`
	IsEnabled       *bool            `json:"is_enabled"`
	LeadValue       *int             `json:"lead_value"`
	LeadUnit        *string          `json:"lead_unit"`
	ThresholdJSON   *json.RawMessage `json:"threshold_json"`
	NotifyRoleCodes *[]string        `json:"notify_role_codes"`
	NotifyUserIDs   *[]int64         `json:"notify_user_ids"`
	SortOrder       *int             `json:"sort_order"`
}

func listAlertRules(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, rule_type, name, is_enabled, lead_value, lead_unit,
			  threshold_json, notify_role_codes, notify_user_ids, sort_order
			from public.crm_alert_rules
			where tenant_id = $1
			order by sort_order, name`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list rules.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []AlertRule
		for rows.Next() {
			var row AlertRule
			if err := rows.Scan(
				&row.ID, &row.RuleType, &row.Name, &row.IsEnabled, &row.LeadValue, &row.LeadUnit,
				&row.ThresholdJSON, &row.NotifyRoleCodes, &row.NotifyUserIDs, &row.SortOrder,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read rules.", "ERR_INTERNAL")
				return
			}
			if row.NotifyRoleCodes == nil {
				row.NotifyRoleCodes = []string{}
			}
			if row.NotifyUserIDs == nil {
				row.NotifyUserIDs = []int64{}
			}
			out = append(out, row)
		}
		if out == nil {
			out = []AlertRule{}
		}
		response.OK(w, out, "OK")
	}
}

func patchAlertRule(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body alertRulePatchBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		sets := []string{"updated_at = now()"}
		args := []any{id, tu.TenantID}
		n := 3
		if body.Name != nil {
			sets = append(sets, fmt.Sprintf("name = $%d", n))
			args = append(args, strings.TrimSpace(*body.Name))
			n++
		}
		if body.IsEnabled != nil {
			sets = append(sets, fmt.Sprintf("is_enabled = $%d", n))
			args = append(args, *body.IsEnabled)
			n++
		}
		if body.LeadValue != nil {
			sets = append(sets, fmt.Sprintf("lead_value = $%d", n))
			args = append(args, *body.LeadValue)
			n++
		}
		if body.LeadUnit != nil {
			unit := strings.TrimSpace(*body.LeadUnit)
			if unit != "days" && unit != "months" {
				response.Validation(w, map[string]string{"lead_unit": "Must be days or months."})
				return
			}
			sets = append(sets, fmt.Sprintf("lead_unit = $%d", n))
			args = append(args, unit)
			n++
		}
		if body.ThresholdJSON != nil {
			sets = append(sets, fmt.Sprintf("threshold_json = $%d", n))
			args = append(args, *body.ThresholdJSON)
			n++
		}
		if body.NotifyRoleCodes != nil {
			sets = append(sets, fmt.Sprintf("notify_role_codes = $%d", n))
			args = append(args, *body.NotifyRoleCodes)
			n++
		}
		if body.NotifyUserIDs != nil {
			sets = append(sets, fmt.Sprintf("notify_user_ids = $%d", n))
			args = append(args, *body.NotifyUserIDs)
			n++
		}
		if body.SortOrder != nil {
			sets = append(sets, fmt.Sprintf("sort_order = $%d", n))
			args = append(args, *body.SortOrder)
			n++
		}
		q := fmt.Sprintf("update public.crm_alert_rules set %s where id = $1 and tenant_id = $2", strings.Join(sets, ", "))
		tag, err := pool.Exec(r.Context(), q, args...)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "crm.rule.update", "crm_alert_rule", &id, nil, body)
		var row AlertRule
		err = pool.QueryRow(r.Context(), `
			select id, rule_type, name, is_enabled, lead_value, lead_unit,
			  threshold_json, notify_role_codes, notify_user_ids, sort_order
			from public.crm_alert_rules where id = $1`, id).Scan(
			&row.ID, &row.RuleType, &row.Name, &row.IsEnabled, &row.LeadValue, &row.LeadUnit,
			&row.ThresholdJSON, &row.NotifyRoleCodes, &row.NotifyUserIDs, &row.SortOrder)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load rule.", "ERR_INTERNAL")
			return
		}
		response.OK(w, row, "Updated.")
	}
}
