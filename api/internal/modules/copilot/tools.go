package copilot

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/dashboard"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

type toolResult struct {
	Name         string          `json:"name"`
	OK           bool            `json:"ok"`
	Denied       bool            `json:"denied,omitempty"`
	Error        string          `json:"error,omitempty"`
	Data         json.RawMessage `json:"data,omitempty"`
	DeepLinks    []deepLink      `json:"deep_links,omitempty"`
	ActionDraft  *actionDraft    `json:"action_draft,omitempty"`
}

type deepLink struct {
	Label string `json:"label"`
	Href  string `json:"href"`
}

type actionDraft struct {
	Type    string         `json:"type"`
	Summary string         `json:"summary"`
	Payload map[string]any `json:"payload"`
	API     string         `json:"api,omitempty"`
	Method  string         `json:"method,omitempty"`
}

func runTool(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, name string, args map[string]any) toolResult {
	name = strings.TrimSpace(strings.ToLower(name))
	switch name {
	case "get_financial_health":
		return toolFinancialHealth(ctx, pool, tu)
	case "list_overdue_ar":
		return toolOverdueAR(ctx, pool, tu)
	case "find_stock":
		q, _ := args["q"].(string)
		return toolFindStock(ctx, pool, tu, q)
	case "crm_follow_ups":
		return toolCRMFollowUps(ctx, pool, tu)
	case "lookup_entities":
		q, _ := args["q"].(string)
		return toolLookupEntities(ctx, pool, tu, entitiesFromArgs(args), q)
	case "draft_recurring_expense":
		return toolDraftRecurring(args)
	case "import_rfq_pdf":
		return toolImportRFQ(args)
	case "draft_follow_up":
		return toolDraftFollowUp(args)
	case "draft_generate_quotation":
		return toolDraftGenerateQuotation(args)
	case "draft_send_quotation_email":
		return toolDraftSendQuotationEmail(args)
	default:
		return toolResult{Name: name, OK: false, Error: "Unknown tool."}
	}
}

func entitiesFromArgs(args map[string]any) []EntityRef {
	if args == nil {
		return nil
	}
	raw, ok := args["entities"]
	if !ok || raw == nil {
		return nil
	}
	switch v := raw.(type) {
	case []EntityRef:
		return v
	case []any:
		b, err := json.Marshal(v)
		if err != nil {
			return nil
		}
		var out []EntityRef
		if json.Unmarshal(b, &out) != nil {
			return nil
		}
		return out
	default:
		b, err := json.Marshal(v)
		if err != nil {
			return nil
		}
		var out []EntityRef
		if json.Unmarshal(b, &out) != nil {
			return nil
		}
		return out
	}
}

func toolFinancialHealth(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser) toolResult {
	if !tu.HasPermission("dashboard.kpis", auth.AccessRead) {
		return toolResult{Name: "get_financial_health", Denied: true, Error: "Missing dashboard.kpis permission."}
	}
	snap := dashboard.LoadFinancialHealth(ctx, pool, tu.TenantID)
	raw, _ := json.Marshal(snap)
	return toolResult{
		Name: "get_financial_health",
		OK:   true,
		Data: raw,
		DeepLinks: []deepLink{
			{Label: "Dashboard", Href: "/app/dashboard"},
			{Label: "AR aging", Href: "/app/finance/reports/ar-aging"},
		},
	}
}

func toolOverdueAR(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser) toolResult {
	if !tu.HasPermission("dashboard.kpis", auth.AccessRead) {
		return toolResult{Name: "list_overdue_ar", Denied: true, Error: "Missing dashboard.kpis permission."}
	}
	snap := dashboard.LoadFinancialHealth(ctx, pool, tu.TenantID)
	payload := map[string]any{
		"overdue_total": snap.Receivables.Overdue,
		"alert_count":   snap.OverdueAlertCount,
		"alerts":        snap.OverdueAlerts,
	}
	raw, _ := json.Marshal(payload)
	return toolResult{
		Name: "list_overdue_ar",
		OK:   true,
		Data: raw,
		DeepLinks: []deepLink{
			{Label: "Overdue invoices", Href: "/app/finance/reports/ar-aging"},
			{Label: "CRM follow-ups", Href: "/app/crm/follow-up-tasks"},
		},
	}
}

func toolFindStock(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, q string) toolResult {
	if !tu.HasPermission("inventory.stock_movements", auth.AccessRead) {
		return toolResult{Name: "find_stock", Denied: true, Error: "Missing inventory.stock_movements permission."}
	}
	q = strings.TrimSpace(q)
	rows, err := pool.Query(ctx, `
		select i.item_code, i.item_name,
		  coalesce(sum(b.qty_on_hand), 0)::float8 as qty_on_hand,
		  coalesce(sum(b.qty_on_hand - coalesce(b.qty_reserved, 0)), 0)::float8 as available_qty,
		  coalesce(max(l.location_name), '') as location_name
		from public.inv_items i
		left join public.inv_item_location_balances b on b.tenant_id = i.tenant_id and b.item_id = i.id
		left join public.inv_locations l on l.id = b.location_id and l.tenant_id = i.tenant_id
		where i.tenant_id = $1 and i.deleted_at is null
		  and ($2 = '' or i.item_code ilike '%' || $2 || '%' or i.item_name ilike '%' || $2 || '%')
		group by i.id, i.item_code, i.item_name
		order by i.item_code
		limit 12`, tu.TenantID, q)
	if err != nil {
		return toolResult{Name: "find_stock", OK: false, Error: "Stock query failed."}
	}
	defer rows.Close()
	type row struct {
		ItemCode     string  `json:"item_code"`
		ItemName     string  `json:"item_name"`
		QtyOnHand    float64 `json:"qty_on_hand"`
		AvailableQty float64 `json:"available_qty"`
		LocationName string  `json:"location_name"`
	}
	var out []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.ItemCode, &r.ItemName, &r.QtyOnHand, &r.AvailableQty, &r.LocationName); err != nil {
			continue
		}
		out = append(out, r)
	}
	if out == nil {
		out = []row{}
	}
	raw, _ := json.Marshal(map[string]any{"q": q, "rows": out})
	href := "/app/inventory/find-stock"
	if q != "" {
		href = href + "?q=" + q
	}
	return toolResult{
		Name:      "find_stock",
		OK:        true,
		Data:      raw,
		DeepLinks: []deepLink{{Label: "Find Stock", Href: href}},
	}
}

func toolCRMFollowUps(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser) toolResult {
	if !tu.HasPermission("crm.follow_up_tasks", auth.AccessRead) && !tu.HasPermission("dashboard.kpis", auth.AccessRead) {
		return toolResult{Name: "crm_follow_ups", Denied: true, Error: "Missing CRM follow-up permission."}
	}
	rows, err := pool.Query(ctx, `
		select id, coalesce(title, ''), coalesce(stage, ''), coalesce(due_date::text, ''), coalesce(task_type, '')
		from public.crm_follow_up_tasks
		where tenant_id = $1 and stage in ('due_soon', 'overdue', 'scheduled')
		order by due_date nulls last
		limit 15`, tu.TenantID)
	if err != nil {
		return toolResult{Name: "crm_follow_ups", OK: false, Error: "CRM query failed."}
	}
	defer rows.Close()
	type row struct {
		ID       int64  `json:"id"`
		Title    string `json:"title"`
		Stage    string `json:"stage"`
		DueDate  string `json:"due_date"`
		TaskType string `json:"task_type"`
	}
	var out []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.ID, &r.Title, &r.Stage, &r.DueDate, &r.TaskType); err != nil {
			continue
		}
		out = append(out, r)
	}
	if out == nil {
		out = []row{}
	}
	raw, _ := json.Marshal(map[string]any{"tasks": out, "as_of": time.Now().UTC().Format(time.RFC3339)})
	return toolResult{
		Name:      "crm_follow_ups",
		OK:        true,
		Data:      raw,
		DeepLinks: []deepLink{{Label: "Follow-up tasks", Href: "/app/crm/follow-up-tasks"}},
	}
}

func toolDraftRecurring(args map[string]any) toolResult {
	name, _ := args["name"].(string)
	if strings.TrimSpace(name) == "" {
		name = "Untitled recurring expense"
	}
	amount, _ := toFloat(args["amount"])
	freq, _ := args["frequency"].(string)
	if freq == "" {
		freq = "monthly"
	}
	draft := &actionDraft{
		Type:    "create_recurring_expense",
		Summary: fmt.Sprintf("Create recurring expense %q (%.2f / %s)", name, amount, freq),
		API:     "/api/v1/finance/recurring-expenses",
		Method:  "POST",
		Payload: map[string]any{
			"name":       name,
			"amount":     amount,
			"frequency":  freq,
			"category":   strOr(args["category"], "general"),
			"is_active":  true,
		},
	}
	raw, _ := json.Marshal(map[string]any{"draft": draft})
	return toolResult{
		Name:        "draft_recurring_expense",
		OK:          true,
		Data:        raw,
		ActionDraft: draft,
		DeepLinks:   []deepLink{{Label: "Recurring expenses", Href: "/app/finance"}},
	}
}

func toolImportRFQ(args map[string]any) toolResult {
	note, _ := args["note"].(string)
	draft := &actionDraft{
		Type:    "import_rfq_pdf",
		Summary: "Open Smart RFQ import — upload a PDF, then match lines (approve before creating a quotation).",
		API:     "/api/v1/quotation/rfq-import/extract-pdf",
		Method:  "POST",
		Payload: map[string]any{
			"hint": note,
			"ui":   "/app/quotation/quotations",
		},
	}
	raw, _ := json.Marshal(map[string]any{"draft": draft})
	return toolResult{
		Name:        "import_rfq_pdf",
		OK:          true,
		Data:        raw,
		ActionDraft: draft,
		DeepLinks:   []deepLink{{Label: "Quotations / Import RFQ", Href: "/app/quotation/quotations"}},
	}
}

func pickEntity(entities []EntityRef, types ...string) *EntityRef {
	want := map[string]struct{}{}
	for _, t := range types {
		want[t] = struct{}{}
	}
	for i := range entities {
		if _, ok := want[entities[i].Type]; ok {
			e := entities[i]
			return &e
		}
	}
	return nil
}

func toolDraftFollowUp(args map[string]any) toolResult {
	entities := entitiesFromArgs(args)
	q, _ := args["q"].(string)
	customer := pickEntity(entities, "customer", "partner", "vendor")
	quote := pickEntity(entities, "quotation", "quote")
	sale := pickEntity(entities, "sales", "invoice")
	title := "Follow-up"
	if customer != nil {
		title = "Follow-up: " + customer.Label
	} else if quote != nil {
		title = "Follow-up: " + quote.Label
	} else if sale != nil {
		title = "Follow-up: " + sale.Label
	} else if strings.TrimSpace(q) != "" {
		title = "Follow-up from Copilot"
	}
	payload := map[string]any{
		"task_type": "quote_follow_up",
		"stage":     "scheduled",
		"title":     title,
		"due_date":  time.Now().UTC().Add(48 * time.Hour).Format("2006-01-02"),
		"notes":     strings.TrimSpace(q),
	}
	if customer != nil {
		payload["partner_id"] = customer.ID
	}
	if quote != nil {
		payload["quotation_id"] = quote.ID
		payload["task_type"] = "quote_follow_up"
	}
	if sale != nil {
		payload["sales_id"] = sale.ID
	}
	draft := &actionDraft{
		Type:    "create_follow_up",
		Summary: fmt.Sprintf("Create CRM follow-up %q (due %s)", title, payload["due_date"]),
		API:     "/api/v1/crm/follow-up-tasks",
		Method:  "POST",
		Payload: payload,
	}
	raw, _ := json.Marshal(map[string]any{"draft": draft})
	return toolResult{
		Name:        "draft_follow_up",
		OK:          true,
		Data:        raw,
		ActionDraft: draft,
		DeepLinks:   []deepLink{{Label: "Follow-up tasks", Href: "/app/crm/follow-up-tasks"}},
	}
}

func toolDraftGenerateQuotation(args map[string]any) toolResult {
	entities := entitiesFromArgs(args)
	customer := pickEntity(entities, "customer", "partner")
	item := pickEntity(entities, "item")
	href := "/app/quotation/quotations"
	payload := map[string]any{"ui": href}
	summary := "Open Quotations to create a new quotation (approve opens the form — nothing is posted automatically)."
	if customer != nil {
		payload["partner_id"] = customer.ID
		payload["partner_name"] = customer.Label
		summary = fmt.Sprintf("Prepare a quotation for %s — approve to open Quotations with this customer tagged.", customer.Label)
	}
	if item != nil {
		payload["item_id"] = item.ID
		payload["item_code"] = item.Code
		payload["item_name"] = item.Label
	}
	draft := &actionDraft{
		Type:    "generate_quotation",
		Summary: summary,
		API:     "/api/v1/quotation/quotations",
		Method:  "POST",
		Payload: payload,
	}
	raw, _ := json.Marshal(map[string]any{"draft": draft})
	return toolResult{
		Name:        "draft_generate_quotation",
		OK:          true,
		Data:        raw,
		ActionDraft: draft,
		DeepLinks:   []deepLink{{Label: "Quotations", Href: href}},
	}
}

func toolDraftSendQuotationEmail(args map[string]any) toolResult {
	entities := entitiesFromArgs(args)
	quote := pickEntity(entities, "quotation", "quote")
	customer := pickEntity(entities, "customer", "partner")
	href := "/app/quotation/quotations"
	payload := map[string]any{"ui": href}
	summary := "Open the quotation and use Send email (approve opens the document — email is not sent until you confirm in Quotation)."
	if quote != nil {
		payload["quotation_id"] = quote.ID
		payload["reference_no"] = quote.Code
		if quote.Code != "" {
			href = href // list; detail deep-link varies by UI
		}
		summary = fmt.Sprintf("Prepare email for quotation %s — approve to open Quotations; send from the document screen.", quote.Label)
		payload["api"] = fmt.Sprintf("/api/v1/quotation/quotations/%d/send-email", quote.ID)
	} else if customer != nil {
		payload["partner_id"] = customer.ID
		summary = fmt.Sprintf("Find a quotation for %s, then send email from the document screen.", customer.Label)
	}
	draft := &actionDraft{
		Type:    "send_quotation_email",
		Summary: summary,
		API:     strOr(payload["api"], "/api/v1/quotation/quotations"),
		Method:  "POST",
		Payload: payload,
	}
	raw, _ := json.Marshal(map[string]any{"draft": draft})
	return toolResult{
		Name:        "draft_send_quotation_email",
		OK:          true,
		Data:        raw,
		ActionDraft: draft,
		DeepLinks:   []deepLink{{Label: "Quotations", Href: href}},
	}
}

func toFloat(v any) (float64, bool) {
	switch t := v.(type) {
	case float64:
		return t, true
	case float32:
		return float64(t), true
	case int:
		return float64(t), true
	case int64:
		return float64(t), true
	case json.Number:
		f, err := t.Float64()
		return f, err == nil
	case string:
		var f float64
		_, err := fmt.Sscanf(strings.TrimSpace(t), "%f", &f)
		return f, err == nil
	default:
		return 0, false
	}
}

func strOr(v any, fallback string) string {
	s, _ := v.(string)
	s = strings.TrimSpace(s)
	if s == "" {
		return fallback
	}
	return s
}
