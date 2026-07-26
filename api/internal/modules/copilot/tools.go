package copilot

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/dashboard"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/quotation"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

type toolResult struct {
	Name        string          `json:"name"`
	OK          bool            `json:"ok"`
	Denied      bool            `json:"denied,omitempty"`
	Error       string          `json:"error,omitempty"`
	Data        json.RawMessage `json:"data,omitempty"`
	DeepLinks   []deepLink      `json:"deep_links,omitempty"`
	ActionDraft *actionDraft    `json:"action_draft,omitempty"`
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
	if cached, ok := getCachedTool(tu.TenantID, tu.AppUserID, name, args); ok {
		return sanitizeToolResult(cached)
	}
	var tr toolResult
	switch name {
	case "get_financial_health":
		tr = toolFinancialHealth(ctx, pool, tu)
	case "list_overdue_ar":
		tr = toolOverdueAR(ctx, pool, tu)
	case "find_stock":
		q, _ := args["q"].(string)
		tr = toolFindStock(ctx, pool, tu, q)
	case "crm_follow_ups":
		tr = toolCRMFollowUps(ctx, pool, tu)
	case "lookup_entities":
		q, _ := args["q"].(string)
		tr = toolLookupEntities(ctx, pool, tu, entitiesFromArgs(args), q)
	case "smart_notifications":
		tr = toolSmartNotifications(ctx, pool, tu)
	case "recommend_items":
		q, _ := args["q"].(string)
		tr = toolRecommendItems(ctx, pool, tu, q)
	case "compare_pricing":
		q, _ := args["q"].(string)
		tr = toolComparePricing(ctx, pool, tu, q)
	case "draft_recurring_expense":
		tr = toolDraftRecurring(args)
	case "import_rfq_pdf":
		tr = toolImportRFQ(args)
	case "run_smart_rfq":
		tr = toolRunSmartRFQ(ctx, pool, tu, args)
	case "map_import_dataset":
		tr = toolMapImportDataset(tu, args)
	case "propose_serial_lot_import":
		tr = toolProposeSerialLotImport(tu, args)
	case "draft_quotation_from_rfq":
		tr = toolDraftQuotationFromRFQ(args)
	case "draft_follow_up":
		tr = toolDraftFollowUp(args)
	case "draft_generate_quotation":
		tr = toolDraftOpenDocument("quotation", args)
	case "draft_send_quotation_email", "draft_send_document_email":
		tr = toolDraftSendDocumentEmail(args)
	case "draft_open_document":
		kind, _ := args["kind"].(string)
		if kind == "" {
			kind = "quotation"
		}
		tr = toolDraftOpenDocument(kind, args)
	default:
		if strings.HasPrefix(name, "draft_open_") {
			tr = toolDraftOpenDocument(strings.TrimPrefix(name, "draft_open_"), args)
		} else {
			tr = toolResult{Name: name, OK: false, Error: "Unknown tool."}
		}
	}
	putCachedTool(tu.TenantID, tu.AppUserID, name, args, tr)
	return sanitizeToolResult(tr)
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
			"name":      name,
			"amount":    amount,
			"frequency": freq,
			"category":  strOr(args["category"], "general"),
			"is_active": true,
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

func toolRunSmartRFQ(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, args map[string]any) toolResult {
	if !tu.HasPermission("quotation.quotations", auth.AccessRead) {
		return toolResult{Name: "run_smart_rfq", Denied: true, Error: "Missing quotation read permission."}
	}
	rawInput, err := json.Marshal(args)
	if err != nil {
		return toolResult{Name: "run_smart_rfq", OK: false, Error: "Invalid Smart RFQ input."}
	}
	var input quotation.RfqRunInput
	if err := json.Unmarshal(rawInput, &input); err != nil {
		return toolResult{Name: "run_smart_rfq", OK: false, Error: "Invalid Smart RFQ pages or tables."}
	}
	if len(input.Pages) == 0 && len(input.Tables) == 0 {
		return toolImportRFQ(map[string]any{
			"note": "Attach an RFQ with extracted text/table data, or use Import RFQ from Quotations.",
		})
	}
	if len(input.Pages) > 100 || len(input.Tables) > 100 {
		return toolResult{Name: "run_smart_rfq", OK: false, Error: "Smart RFQ input is too large; use a page range (max 100 pages/tables in Copilot)."}
	}
	imageBytes := 0
	for _, image := range input.PageImages {
		imageBytes += len(image.ImageBase64)
		if imageBytes > 12_000_000 {
			return toolResult{Name: "run_smart_rfq", OK: false, Error: "Smart RFQ page images exceed the Copilot limit; use Import RFQ with a page range."}
		}
	}
	totalText := 0
	for i := range input.Pages {
		if len(input.Pages[i].Text) > 20_000 {
			input.Pages[i].Text = input.Pages[i].Text[:20_000] + "…[truncated]"
		}
		totalText += len(input.Pages[i].Text)
		if totalText > 250_000 {
			return toolResult{Name: "run_smart_rfq", OK: false, Error: "Smart RFQ extracted text exceeds the Copilot limit; use Import RFQ with a page range."}
		}
	}

	result, err := quotation.RunRfqImportPipeline(ctx, pool, tu, input)
	if err != nil {
		return toolResult{Name: "run_smart_rfq", OK: false, Error: err.Error()}
	}
	data, _ := json.Marshal(result)
	tr := toolResult{
		Name:      "run_smart_rfq",
		OK:        true,
		Data:      data,
		DeepLinks: []deepLink{{Label: "Quotations", Href: "/app/quotation/quotations"}},
	}
	if result.Blocked || len(result.Matched) == 0 {
		return tr
	}
	seedLines := make([]any, 0, len(result.Matched))
	for _, line := range result.Matched {
		seedLines = append(seedLines, map[string]any{
			"item_id":     line.ItemID,
			"item_code":   line.ItemCode,
			"item_name":   line.ItemName,
			"description": line.Description,
			"qty":         line.Qty,
			"unit":        line.Unit,
			"unit_id":     line.UnitID,
			"unit_code":   line.UnitCode,
			"unit_price":  line.SalesPrice,
			"remarks":     line.Remarks,
		})
	}
	draftArgs := map[string]any{
		"document_type": result.DocumentType,
		"lines":         seedLines,
	}
	if input.PartnerID != nil && *input.PartnerID > 0 {
		draftArgs["partner_id"] = *input.PartnerID
	}
	draftResult := toolDraftQuotationFromRFQ(draftArgs)
	tr.ActionDraft = draftResult.ActionDraft
	return tr
}

func toolDraftQuotationFromRFQ(args map[string]any) toolResult {
	payload := sanitizeRfqQuotationSeedPayload(args)
	lines, _ := payload["lines"].([]any)
	if len(lines) == 0 {
		return toolResult{Name: "draft_quotation_from_rfq", OK: false, Error: "No valid RFQ lines are available for a quotation draft."}
	}
	draft := &actionDraft{
		Type:    "create_quotation_from_rfq",
		Summary: fmt.Sprintf("Prepare a quotation draft from %d Smart RFQ line(s). Approve opens a prefilled form; it does not save or post.", len(lines)),
		API:     "/api/v1/quotation/quotations",
		Method:  "POST",
		Payload: payload,
	}
	raw, _ := json.Marshal(map[string]any{"draft": draft, "line_count": len(lines)})
	return toolResult{
		Name:        "draft_quotation_from_rfq",
		OK:          true,
		Data:        raw,
		ActionDraft: draft,
		DeepLinks:   []deepLink{{Label: "New quotation", Href: "/app/quotation/quotations/new"}},
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
		// href stays on the list view; detail deep-link varies by UI.
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
