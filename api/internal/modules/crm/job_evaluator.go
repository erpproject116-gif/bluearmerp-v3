package crm

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/outbox"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type evaluateAlertsResult struct {
	NotificationsCreated int `json:"notifications_created"`
	TasksCreated         int `json:"tasks_created"`
	TenantsProcessed     int `json:"tenants_processed"`
}

func evaluateAlertsJob(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		secret := strings.TrimSpace(os.Getenv("CRM_JOB_SECRET"))
		if secret == "" {
			response.Err(w, http.StatusServiceUnavailable, "CRM job secret not configured.", "ERR_UNAVAILABLE")
			return
		}
		if strings.TrimSpace(r.Header.Get("X-CRM-Job-Secret")) != secret {
			response.Err(w, http.StatusUnauthorized, "Invalid job secret.", "ERR_UNAUTHORIZED")
			return
		}

		tu, hasUser := auth.FromContext(r.Context())
		tenantFilter := int64(0)
		if hasUser {
			tenantFilter = tu.TenantID
		}
		if v := strings.TrimSpace(r.URL.Query().Get("tenant_id")); v != "" && tenantFilter == 0 {
			var id int64
			if _, err := fmt.Sscan(v, &id); err == nil && id > 0 {
				tenantFilter = id
			}
		}

		result, err := runAlertEvaluator(r.Context(), pool, tenantFilter)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Alert evaluation failed.", "ERR_INTERNAL")
			return
		}
		if hasUser {
			_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "crm.job.evaluate", "crm_job", nil, nil, result)
		}
		response.OK(w, result, "Evaluated.")
	}
}

func runAlertEvaluator(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (evaluateAlertsResult, error) {
	var result evaluateAlertsResult
	for {
		n, err := outbox.DrainPending(ctx, pool, handleCRMOutboxEvent)
		if err != nil {
			return result, err
		}
		if n == 0 {
			break
		}
	}
	tenantQ := `select id from public.tenants where status = 'active'`
	args := []any{}
	if tenantID > 0 {
		tenantQ += ` and id = $1`
		args = append(args, tenantID)
	}
	tenantRows, err := pool.Query(ctx, tenantQ, args...)
	if err != nil {
		return result, err
	}
	defer tenantRows.Close()

	for tenantRows.Next() {
		var tid int64
		if err := tenantRows.Scan(&tid); err != nil {
			return result, err
		}
		result.TenantsProcessed++
		n, t, err := evaluateTenantAlerts(ctx, pool, tid)
		if err != nil {
			return result, err
		}
		result.NotificationsCreated += n
		result.TasksCreated += t
	}
	return result, tenantRows.Err()
}

type alertRule struct {
	ID            int64
	RuleType      string
	Name          string
	LeadValue     int
	LeadUnit      string
	ThresholdJSON json.RawMessage
}

func evaluateTenantAlerts(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (notifCount, taskCount int, err error) {
	today := todayDate()
	rules, err := loadEnabledRules(ctx, pool, tenantID)
	if err != nil {
		return 0, 0, err
	}
	for _, rule := range rules {
		switch rule.RuleType {
		case "warranty_follow_up":
			n, t, e := evalWarrantyFollowUp(ctx, pool, tenantID, rule, today)
			if e != nil {
				return notifCount, taskCount, e
			}
			notifCount += n
			taskCount += t
		case "quote_expiring":
			n, e := evalQuoteExpiring(ctx, pool, tenantID, rule, today)
			if e != nil {
				return notifCount, taskCount, e
			}
			notifCount += n
		case "low_stock":
			n, e := evalLowStock(ctx, pool, tenantID, rule, today)
			if e != nil {
				return notifCount, taskCount, e
			}
			notifCount += n
		case "quote_unconverted":
			n, e := evalQuoteUnconverted(ctx, pool, tenantID, rule, today)
			if e != nil {
				return notifCount, taskCount, e
			}
			notifCount += n
		}
	}
	return notifCount, taskCount, nil
}

func loadEnabledRules(ctx context.Context, pool *pgxpool.Pool, tenantID int64) ([]alertRule, error) {
	rows, err := pool.Query(ctx, `
		select id, rule_type, name, lead_value, lead_unit, threshold_json
		from public.crm_alert_rules
		where tenant_id = $1 and is_enabled = true
		order by sort_order`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []alertRule
	for rows.Next() {
		var r alertRule
		if err := rows.Scan(&r.ID, &r.RuleType, &r.Name, &r.LeadValue, &r.LeadUnit, &r.ThresholdJSON); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func insertNotification(ctx context.Context, pool *pgxpool.Pool, tenantID int64, userID *int64, ruleID int64,
	severity, title, body, entityType string, entityID int64, dedupeKey string) (bool, error) {
	tag, err := pool.Exec(ctx, `
		insert into public.crm_notifications (
		  tenant_id, user_id, rule_id, severity, title, body, entity_type, entity_id, dedupe_key
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		on conflict (tenant_id, dedupe_key) do nothing`,
		tenantID, userID, ruleID, severity, title, body, entityType, entityID, dedupeKey)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func evalWarrantyFollowUp(ctx context.Context, pool *pgxpool.Pool, tenantID int64, rule alertRule, today time.Time) (int, int, error) {
	notifCount, taskCount := 0, 0
	for _, leadDays := range warrantyLeadDays(rule) {
		n, t, err := evalWarrantyFollowUpForLead(ctx, pool, tenantID, rule, today, leadDays, "days")
		if err != nil {
			return notifCount, taskCount, err
		}
		notifCount += n
		taskCount += t
	}
	if rule.LeadUnit == "months" {
		n, t, err := evalWarrantyFollowUpForLead(ctx, pool, tenantID, rule, today, rule.LeadValue, "months")
		if err != nil {
			return notifCount, taskCount, err
		}
		notifCount += n
		taskCount += t
	}
	return notifCount, taskCount, nil
}

func warrantyLeadDays(rule alertRule) []int {
	seen := map[int]bool{}
	if rule.LeadUnit == "days" {
		seen[rule.LeadValue] = true
	}
	if len(rule.ThresholdJSON) > 0 {
		var th struct {
			DaysBeforeEnd []int `json:"days_before_end"`
		}
		if json.Unmarshal(rule.ThresholdJSON, &th) == nil {
			for _, d := range th.DaysBeforeEnd {
				seen[d] = true
			}
		}
	}
	if len(seen) == 0 {
		seen[rule.LeadValue] = true
	}
	out := make([]int, 0, len(seen))
	for d := range seen {
		out = append(out, d)
	}
	sort.Ints(out)
	return out
}

func evalWarrantyFollowUpForLead(ctx context.Context, pool *pgxpool.Pool, tenantID int64, rule alertRule, today time.Time, leadValue int, leadUnit string) (int, int, error) {
	notifCount, taskCount := 0, 0
	endExpr := "($2::date + make_interval(days => $3))::date"
	if leadUnit == "months" {
		endExpr = "($2::date + make_interval(months => $3))::date"
	}
	q := fmt.Sprintf(`
		select wa.id, wa.serial_no, wa.item_name, wa.partner_id, wa.warranty_end, wa.pic_user_id, wa.pic_name
		from public.crm_warranty_assets wa
		where wa.tenant_id = $1 and wa.status = 'active'
		  and wa.warranty_end = %s`, endExpr)
	rows, err := pool.Query(ctx, q, tenantID, today, leadValue)
	if err != nil {
		return 0, 0, err
	}
	defer rows.Close()
	for rows.Next() {
		var assetID, partnerID int64
		var serial, itemName, picName string
		var warrantyEnd time.Time
		var picUserID *int64
		if err := rows.Scan(&assetID, &serial, &itemName, &partnerID, &warrantyEnd, &picUserID, &picName); err != nil {
			return notifCount, taskCount, err
		}
		key := dedupeKey(rule.RuleType, rule.ID, "crm_warranty_asset", assetID, today)
		key = fmt.Sprintf("%s:lead%d", key, leadValue)
		title := fmt.Sprintf("Warranty follow-up: %s", serial)
		body := fmt.Sprintf("%s warranty ends on %s.", itemName, warrantyEnd.Format("2006-01-02"))
		ok, err := insertNotification(ctx, pool, tenantID, picUserID, rule.ID, "warning", title, body, "crm_warranty_asset", assetID, key)
		if err != nil {
			return notifCount, taskCount, err
		}
		if ok {
			notifCount++
		}
		dueDate := subtractLead(warrantyEnd, leadValue, leadUnit)
		var exists bool
		_ = pool.QueryRow(ctx, `
			select exists(
			  select 1 from public.crm_follow_up_tasks
			  where tenant_id = $1 and warranty_asset_id = $2 and task_type = 'warranty_follow_up' and due_date = $3::date
			)`, tenantID, assetID, dueDate).Scan(&exists)
		if !exists {
			_, err = pool.Exec(ctx, `
				insert into public.crm_follow_up_tasks (
				  tenant_id, task_type, stage, due_date, partner_id, pic_user_id, pic_name,
				  warranty_asset_id, title, notes
				) values ($1, 'warranty_follow_up', 'scheduled', $2, $3, $4, $5, $6, $7, $8)`,
				tenantID, dueDate, partnerID, picUserID, picName, assetID, title, body)
			if err == nil {
				taskCount++
			}
		}
	}
	return notifCount, taskCount, rows.Err()
}

func evalQuoteExpiring(ctx context.Context, pool *pgxpool.Pool, tenantID int64, rule alertRule, today time.Time) (int, error) {
	count := 0
	leadEnd := addLead(today, rule.LeadValue, rule.LeadUnit)
	rows, err := pool.Query(ctx, `
		select q.id, q.reference_no, p.company_name, q.valid_until
		from public.quo_quotations q
		join public.inv_partners p on p.id = q.partner_id
		where q.tenant_id = $1 and q.deleted_at is null
		  and q.valid_until is not null
		  and q.valid_until >= $2::date and q.valid_until <= $3::date`,
		tenantID, today, leadEnd)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	for rows.Next() {
		var qid int64
		var ref, customer string
		var validUntil time.Time
		if err := rows.Scan(&qid, &ref, &customer, &validUntil); err != nil {
			return count, err
		}
		key := dedupeKey(rule.RuleType, rule.ID, "quo_quotation", qid, today)
		title := fmt.Sprintf("Quote expiring: %s", ref)
		body := fmt.Sprintf("%s quote for %s expires on %s.", ref, customer, validUntil.Format("2006-01-02"))
		ok, err := insertNotification(ctx, pool, tenantID, nil, rule.ID, "warning", title, body, "quo_quotation", qid, key)
		if err != nil {
			return count, err
		}
		if ok {
			count++
		}
	}
	return count, rows.Err()
}

func evalLowStock(ctx context.Context, pool *pgxpool.Pool, tenantID int64, rule alertRule, today time.Time) (int, error) {
	count := 0
	rows, err := pool.Query(ctx, `
		select bal.id, i.item_code, i.item_name, l.location_name, bal.qty_on_hand,
		  coalesce(bal.reorder_level, i.reorder_level)
		from public.inv_item_location_balances bal
		join public.inv_items i on i.id = bal.item_id and i.tenant_id = bal.tenant_id
		join public.inv_locations l on l.id = bal.location_id
		where bal.tenant_id = $1
		  and coalesce(bal.reorder_level, i.reorder_level) is not null
		  and bal.qty_on_hand < coalesce(bal.reorder_level, i.reorder_level)`, tenantID)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	for rows.Next() {
		var balID int64
		var itemCode, itemName, locName string
		var qty, reorder float64
		if err := rows.Scan(&balID, &itemCode, &itemName, &locName, &qty, &reorder); err != nil {
			return count, err
		}
		key := dedupeKey(rule.RuleType, rule.ID, "inv_item_location_balance", balID, today)
		title := fmt.Sprintf("Low stock: %s", itemCode)
		body := fmt.Sprintf("%s at %s: on hand %.2f, reorder %.2f.", itemName, locName, qty, reorder)
		ok, err := insertNotification(ctx, pool, tenantID, nil, rule.ID, "critical", title, body, "inv_item_location_balance", balID, key)
		if err != nil {
			return count, err
		}
		if ok {
			count++
		}
	}
	return count, rows.Err()
}

func evalQuoteUnconverted(ctx context.Context, pool *pgxpool.Pool, tenantID int64, rule alertRule, today time.Time) (int, error) {
	count := 0
	rows, err := pool.Query(ctx, `
		select q.id, q.reference_no, p.company_name
		from public.quo_quotations q
		join public.inv_partners p on p.id = q.partner_id
		where q.tenant_id = $1 and q.deleted_at is null
		  and q.voucher_status = 'none'
		  and q.order_date <= ($2::date - make_interval(days => $3))::date`,
		tenantID, today, rule.LeadValue)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	for rows.Next() {
		var qid int64
		var ref, customer string
		if err := rows.Scan(&qid, &ref, &customer); err != nil {
			return count, err
		}
		key := dedupeKey(rule.RuleType, rule.ID, "quo_quotation", qid, today)
		title := fmt.Sprintf("Unconverted quote: %s", ref)
		body := fmt.Sprintf("Quote %s for %s has not been converted to a sales order.", ref, customer)
		ok, err := insertNotification(ctx, pool, tenantID, nil, rule.ID, "info", title, body, "quo_quotation", qid, key)
		if err != nil {
			return count, err
		}
		if ok {
			count++
		}
	}
	return count, rows.Err()
}

func handleCRMOutboxEvent(ctx context.Context, pool *pgxpool.Pool, ev outbox.Event) error {
	log.Printf("crm outbox: tenant=%d type=%s key=%s", ev.TenantID, ev.EventType, ev.IdempotencyKey)
	return nil
}
