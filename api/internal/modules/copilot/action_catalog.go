package copilot

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/money"
)

// openDocSpec describes an approve-to-act "open UI to create/send" draft.
// Full document create stays in the ERP forms (policies, lines, tax) — Copilot tags context only.
type openDocSpec struct {
	Kind      string // tool suffix / matcher key
	DraftType string
	Label     string
	UI        string
	API       string
	PartnerAs string // customer | vendor | ""
	Hint      string
}

var openDocumentCatalog = []openDocSpec{
	{
		Kind: "quotation", DraftType: "open_quotation", Label: "Quotation",
		UI: "/app/quotation/quotations/new", API: "/api/v1/quotation/quotations",
		PartnerAs: "customer",
		Hint:      "Create the quotation in the UI — Copilot tags customer/items only; nothing is auto-posted.",
	},
	{
		Kind: "sales_order", DraftType: "open_sales_order", Label: "Sales order",
		UI: "/app/sales-order/sales-orders/new", API: "/api/v1/sales-order/sales-orders",
		PartnerAs: "customer",
		Hint:      "Create the sales order in the UI — Copilot does not auto-post.",
	},
	{
		Kind: "sales", DraftType: "open_sales", Label: "Sales invoice",
		UI: "/app/sales/sales/new", API: "/api/v1/sales/",
		PartnerAs: "customer",
		Hint:      "Create the sales invoice in the UI — Copilot does not auto-post.",
	},
	{
		Kind: "purchase_request", DraftType: "open_purchase_request", Label: "Purchase request",
		UI: "/app/purchase-request/purchase-requests/new", API: "/api/v1/purchase-request/purchase-requests",
		PartnerAs: "",
		Hint:      "Create the purchase request in the UI — Copilot does not auto-post.",
	},
	{
		Kind: "rfq", DraftType: "open_rfq", Label: "RFQ",
		UI: "/app/purchase-order/rfq", API: "/api/v1/purchase-order/rfq",
		PartnerAs: "vendor",
		Hint:      "Create or continue the RFQ in Purchase Order → RFQ. Copilot does not auto-post.",
	},
	{
		Kind: "purchase_order", DraftType: "open_purchase_order", Label: "Purchase order",
		UI: "/app/purchase-order/purchase-orders", API: "/api/v1/purchase-order/purchase-orders",
		PartnerAs: "vendor",
		Hint:      "Open Purchase Orders and create/confirm there — Copilot does not auto-post.",
	},
	{
		Kind: "purchases", DraftType: "open_purchases", Label: "Supplier invoice / Purchase",
		UI: "/app/purchases/purchases/new", API: "/api/v1/finance/supplier-invoices",
		PartnerAs: "vendor",
		Hint:      "Create the supplier invoice in Purchases — Copilot does not auto-post.",
	},
	{
		Kind: "product_bundle", DraftType: "open_product_bundle", Label: "Product bundle / PC build",
		UI: "/app/inventory/product-bundles", API: "/api/v1/inventory/product-bundles",
		PartnerAs: "",
		Hint:      "Build kits/PC bundles under Product Bundles. There is no separate PC-build module yet.",
	},
	{
		Kind: "bom", DraftType: "open_bom", Label: "BOM / item build",
		UI: "/app/inventory/serial-lot/manufacturing/boms", API: "/api/v1/manufacturing/boms",
		PartnerAs: "",
		Hint:      "Define manufacturing BOMs under Serial & Lot → Manufacturing. Copilot does not auto-create BOMs.",
	},
	{
		Kind: "bulk_inventory", DraftType: "bulk_inventory", Label: "Bulk inventory",
		UI: "/app/inventory/items", API: "/api/v1/inventory/items/import",
		PartnerAs: "",
		Hint:      "Use Items → Import CSV, Stock Entries, or Stock Adjustments for bulk work. High-risk posts stay in those screens.",
	},
}

func findOpenDocSpec(kind string) *openDocSpec {
	k := strings.ToLower(strings.TrimSpace(kind))
	for i := range openDocumentCatalog {
		if openDocumentCatalog[i].Kind == k || openDocumentCatalog[i].DraftType == k {
			return &openDocumentCatalog[i]
		}
	}
	switch k {
	case "quote", "generate_quotation", "new quotation":
		return findOpenDocSpec("quotation")
	case "so", "sales order":
		return findOpenDocSpec("sales_order")
	case "si", "sales invoice", "new sales":
		return findOpenDocSpec("sales")
	case "pr", "purchase request":
		return findOpenDocSpec("purchase_request")
	case "po", "purchase order":
		return findOpenDocSpec("purchase_order")
	case "supplier invoice", "purchase", "new purchases":
		return findOpenDocSpec("purchases")
	case "pc build", "pc_build", "item build", "item_build", "bundle":
		return findOpenDocSpec("product_bundle")
	case "item bom", "manufacturing bom":
		return findOpenDocSpec("bom")
	case "bulk stock", "inventory import":
		return findOpenDocSpec("bulk_inventory")
	}
	return nil
}

func toolDraftOpenDocument(kind string, args map[string]any) toolResult {
	spec := findOpenDocSpec(kind)
	if spec == nil {
		return toolResult{Name: "draft_open_" + kind, OK: false, Error: "Unknown document kind."}
	}
	entities := entitiesFromArgs(args)
	q, _ := args["q"].(string)
	payload := map[string]any{
		"ui":   spec.UI,
		"hint": spec.Hint,
		"kind": spec.Kind,
		"note": strings.TrimSpace(q),
	}
	summary := fmt.Sprintf("Open %s to create/continue — nothing is posted until you save in the form.", spec.Label)

	var partner *EntityRef
	if spec.PartnerAs == "customer" {
		partner = pickEntity(entities, "customer", "partner")
	} else if spec.PartnerAs == "vendor" {
		partner = pickEntity(entities, "vendor", "partner")
	}
	if partner != nil {
		payload["partner_id"] = partner.ID
		payload["partner_name"] = partner.Label
		payload["partner_code"] = partner.Code
		summary = fmt.Sprintf("Prepare %s for %s — approve to open %s with this partner tagged.", spec.Label, partner.Label, spec.Label)
	}

	items := pickAllEntities(entities, "item")
	if len(items) > 0 {
		payload["items"] = items
		codes := make([]string, 0, len(items))
		for _, it := range items {
			if it.Code != "" {
				codes = append(codes, it.Code)
			} else {
				codes = append(codes, it.Label)
			}
		}
		summary += " Items: " + strings.Join(codes, ", ") + "."
	}

	draft := &actionDraft{
		Type:    spec.DraftType,
		Summary: summary,
		API:     spec.API,
		Method:  "POST",
		Payload: payload,
	}
	raw, _ := json.Marshal(map[string]any{"draft": draft})
	return toolResult{
		Name:        "draft_open_" + spec.Kind,
		OK:          true,
		Data:        raw,
		ActionDraft: draft,
		DeepLinks:   []deepLink{{Label: spec.Label, Href: spec.UI}},
	}
}

func pickAllEntities(entities []EntityRef, types ...string) []EntityRef {
	want := map[string]struct{}{}
	for _, t := range types {
		want[t] = struct{}{}
	}
	var out []EntityRef
	for _, e := range entities {
		if _, ok := want[e.Type]; ok {
			out = append(out, e)
		}
	}
	return out
}

func toolDraftSendDocumentEmail(args map[string]any) toolResult {
	entities := entitiesFromArgs(args)
	q := strings.ToLower(strOr(args["q"], ""))

	type emailTarget struct {
		DocType string
		Label   string
		UI      string
		APIFmt  string
		Entity  *EntityRef
	}

	var target emailTarget
	if e := pickEntity(entities, "quotation", "quote"); e != nil || strings.Contains(q, "quotation") || strings.Contains(q, "quote") {
		target = emailTarget{DocType: "quotation", Label: "Quotation", UI: "/app/quotation/quotations", APIFmt: "/api/v1/quotation/quotations/%d/send-email", Entity: e}
	} else if e := pickEntity(entities, "sales_order"); e != nil || strings.Contains(q, "sales order") {
		target = emailTarget{DocType: "sales_order", Label: "Sales order", UI: "/app/sales-order/sales-orders", APIFmt: "/api/v1/sales-order/sales-orders/%d/send-email", Entity: e}
	} else if e := pickEntity(entities, "sales", "invoice"); e != nil || strings.Contains(q, "sales") || strings.Contains(q, "invoice") {
		target = emailTarget{DocType: "sales", Label: "Sales invoice", UI: "/app/sales/sales", APIFmt: "/api/v1/sales/%d/send-email", Entity: e}
	} else if e := pickEntity(entities, "purchase_order"); e != nil || strings.Contains(q, "purchase order") {
		target = emailTarget{DocType: "purchase_order", Label: "Purchase order", UI: "/app/purchase-order/purchase-orders", APIFmt: "/api/v1/purchase-order/purchase-orders/%d/send-email", Entity: e}
	} else {
		target = emailTarget{DocType: "quotation", Label: "Quotation", UI: "/app/quotation/quotations", APIFmt: "/api/v1/quotation/quotations/%d/send-email", Entity: pickEntity(entities, "quotation", "quote")}
	}

	payload := map[string]any{"ui": target.UI, "doc_type": target.DocType}
	summary := fmt.Sprintf("Prepare %s email — approve opens the document; mail is sent only from the compose screen.", target.Label)
	api := target.UI
	if target.Entity != nil {
		payload["doc_id"] = target.Entity.ID
		payload["doc_no"] = target.Entity.Code
		api = fmt.Sprintf(target.APIFmt, target.Entity.ID)
		payload["api"] = api
		summary = fmt.Sprintf("Prepare email for %s %s — approve to open; send from the document screen.", target.Label, target.Entity.Label)
	}
	if c := pickEntity(entities, "customer", "partner", "vendor"); c != nil {
		payload["partner_id"] = c.ID
		payload["partner_name"] = c.Label
	}

	draft := &actionDraft{
		Type:    "send_document_email",
		Summary: summary,
		API:     api,
		Method:  "POST",
		Payload: payload,
	}
	raw, _ := json.Marshal(map[string]any{"draft": draft})
	return toolResult{
		Name:        "draft_send_document_email",
		OK:          true,
		Data:        raw,
		ActionDraft: draft,
		DeepLinks:   []deepLink{{Label: target.Label, Href: target.UI}},
	}
}

func toolSmartNotifications(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser) toolResult {
	if !tu.HasPermission("crm.notifications", auth.AccessRead) && !tu.HasPermission("dashboard.kpis", auth.AccessRead) {
		return toolResult{Name: "smart_notifications", Denied: true, Error: "Missing crm.notifications permission."}
	}
	rows, err := pool.Query(ctx, `
		select id, coalesce(title, ''), coalesce(body, ''), coalesce(severity, ''),
		  case when read_at is null then false else true end,
		  created_at::text
		from public.crm_notifications
		where tenant_id = $1 and (user_id is null or user_id = $2)
		order by created_at desc
		limit 15`, tu.TenantID, tu.AppUserID)
	if err != nil {
		return toolResult{Name: "smart_notifications", OK: false, Error: "Notification query failed."}
	}
	defer rows.Close()
	type row struct {
		ID        int64  `json:"id"`
		Title     string `json:"title"`
		Body      string `json:"body"`
		Severity  string `json:"severity"`
		Read      bool   `json:"read"`
		CreatedAt string `json:"created_at"`
	}
	var out []row
	unread := 0
	for rows.Next() {
		var r row
		if rows.Scan(&r.ID, &r.Title, &r.Body, &r.Severity, &r.Read, &r.CreatedAt) != nil {
			continue
		}
		if !r.Read {
			unread++
		}
		out = append(out, r)
	}
	if out == nil {
		out = []row{}
	}
	raw, _ := json.Marshal(map[string]any{"notifications": out, "unread": unread})
	return toolResult{
		Name: "smart_notifications",
		OK:   true,
		Data: raw,
		DeepLinks: []deepLink{
			{Label: "Notifications", Href: "/app/crm/notifications"},
			{Label: "Alert rules", Href: "/app/crm/settings/alert-rules"},
		},
	}
}

func toolRecommendItems(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, q string) toolResult {
	if !tu.HasPermission("inventory.items", auth.AccessRead) && !tu.HasPermission("inventory.stock_movements", auth.AccessRead) {
		return toolResult{Name: "recommend_items", Denied: true, Error: "Missing inventory.items permission."}
	}
	q = strings.TrimSpace(q)
	rows, err := pool.Query(ctx, `
		select i.id, i.item_code, i.item_name,
		  coalesce(i.sales_price, 0)::float8,
		  coalesce(i.purchase_price, 0)::float8,
		  coalesce(sum(b.qty_on_hand), 0)::float8 as qty_on_hand
		from public.inv_items i
		left join public.inv_item_location_balances b on b.tenant_id = i.tenant_id and b.item_id = i.id
		where i.tenant_id = $1 and i.deleted_at is null
		  and ($2 = '' or i.item_code ilike '%' || $2 || '%' or i.item_name ilike '%' || $2 || '%' or coalesce(i.spec_name,'') ilike '%' || $2 || '%')
		  and coalesce(i.status, 'active') <> 'inactive'
		group by i.id, i.item_code, i.item_name, i.sales_price, i.purchase_price
		order by
		  case when $2 <> '' and i.item_code ilike $2 || '%' then 0 else 1 end,
		  coalesce(sum(b.qty_on_hand), 0) desc,
		  i.item_code
		limit 12`, tu.TenantID, q)
	if err != nil {
		return toolResult{Name: "recommend_items", OK: false, Error: "Item search failed."}
	}
	defer rows.Close()
	type row struct {
		ID            int64   `json:"id"`
		ItemCode      string  `json:"item_code"`
		ItemName      string  `json:"item_name"`
		SalesPrice    float64 `json:"sales_price"`
		PurchasePrice float64 `json:"purchase_price"`
		QtyOnHand     float64 `json:"qty_on_hand"`
		SalesPriceFmt string  `json:"sales_price_fmt"`
	}
	var out []row
	for rows.Next() {
		var r row
		if rows.Scan(&r.ID, &r.ItemCode, &r.ItemName, &r.SalesPrice, &r.PurchasePrice, &r.QtyOnHand) != nil {
			continue
		}
		r.SalesPriceFmt = money.Format(r.SalesPrice, "PHP")
		out = append(out, r)
	}
	if out == nil {
		out = []row{}
	}
	raw, _ := json.Marshal(map[string]any{"q": q, "recommendations": out})
	href := "/app/inventory/items"
	if q != "" {
		href = href + "?q=" + q
	}
	return toolResult{
		Name:      "recommend_items",
		OK:        true,
		Data:      raw,
		DeepLinks: []deepLink{{Label: "Items", Href: href}, {Label: "Find Stock", Href: "/app/inventory/find-stock"}},
	}
}

func toolComparePricing(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, q string) toolResult {
	if !tu.HasPermission("inventory.items", auth.AccessRead) {
		return toolResult{Name: "compare_pricing", Denied: true, Error: "Missing inventory.items permission."}
	}
	q = strings.TrimSpace(q)
	rows, err := pool.Query(ctx, `
		select i.item_code, i.item_name,
		  coalesce(i.purchase_price, 0)::float8,
		  coalesce(i.sales_price, 0)::float8,
		  coalesce(i.vip_price, 0)::float8,
		  coalesce(i.oe_price, 0)::float8
		from public.inv_items i
		where i.tenant_id = $1 and i.deleted_at is null
		  and ($2 = '' or i.item_code ilike '%' || $2 || '%' or i.item_name ilike '%' || $2 || '%')
		order by i.item_code
		limit 10`, tu.TenantID, q)
	if err != nil {
		return toolResult{Name: "compare_pricing", OK: false, Error: "Price compare query failed."}
	}
	defer rows.Close()
	type row struct {
		ItemCode      string  `json:"item_code"`
		ItemName      string  `json:"item_name"`
		PurchasePrice float64 `json:"purchase_price"`
		SalesPrice    float64 `json:"sales_price"`
		VIPPrice      float64 `json:"vip_price"`
		OEPrice       float64 `json:"oe_price"`
		PurchaseFmt   string  `json:"purchase_fmt"`
		SalesFmt      string  `json:"sales_fmt"`
		VIPFmt        string  `json:"vip_fmt"`
		OEFmt         string  `json:"oe_fmt"`
	}
	var out []row
	for rows.Next() {
		var r row
		if rows.Scan(&r.ItemCode, &r.ItemName, &r.PurchasePrice, &r.SalesPrice, &r.VIPPrice, &r.OEPrice) != nil {
			continue
		}
		r.PurchaseFmt = money.Format(r.PurchasePrice, "PHP")
		r.SalesFmt = money.Format(r.SalesPrice, "PHP")
		r.VIPFmt = money.Format(r.VIPPrice, "PHP")
		r.OEFmt = money.Format(r.OEPrice, "PHP")
		out = append(out, r)
	}
	if out == nil {
		out = []row{}
	}
	raw, _ := json.Marshal(map[string]any{
		"q":    q,
		"rows": out,
		"note": "Internal list prices. For multi-supplier quotes use RFQ → Supplier Quotations.",
	})
	return toolResult{
		Name: "compare_pricing",
		OK:   true,
		Data: raw,
		DeepLinks: []deepLink{
			{Label: "Price lists", Href: "/app/inventory/price-lists"},
			{Label: "RFQ / supplier quotes", Href: "/app/purchase-order/rfq"},
		},
	}
}

// matchActionTool picks the draft tool name for an action-mode query.
func matchActionTool(query string) (toolName string, kind string) {
	q := strings.ToLower(query)
	switch {
	case strings.Contains(q, "rfq pdf") || strings.Contains(q, "import rfq") || strings.Contains(q, "upload rfq"):
		return "import_rfq_pdf", ""
	case strings.Contains(q, "send email") || strings.Contains(q, "email quotation") || strings.Contains(q, "send quotation") ||
		strings.Contains(q, "email sales") || strings.Contains(q, "compose email"):
		return "draft_send_document_email", ""
	case strings.Contains(q, "follow-up") || strings.Contains(q, "follow up") || strings.Contains(q, "crm task"):
		return "draft_follow_up", ""
	case strings.Contains(q, "recurring"):
		return "draft_recurring_expense", ""
	case strings.Contains(q, "bulk inventory") || strings.Contains(q, "import items") || strings.Contains(q, "csv import") || strings.Contains(q, "stock entry"):
		return "draft_open_document", "bulk_inventory"
	case strings.Contains(q, "pc build") || strings.Contains(q, "product bundle") || (strings.Contains(q, "item build") && !strings.Contains(q, "bom")):
		return "draft_open_document", "product_bundle"
	case strings.Contains(q, "bom") || strings.Contains(q, "bill of materials"):
		return "draft_open_document", "bom"
	case strings.Contains(q, "purchase request") || strings.Contains(q, "create pr") || strings.Contains(q, "new pr"):
		return "draft_open_document", "purchase_request"
	case strings.Contains(q, "purchase order") || strings.Contains(q, "create po") || strings.Contains(q, "new po"):
		return "draft_open_document", "purchase_order"
	case strings.Contains(q, "supplier invoice") || strings.Contains(q, "new purchase") || (strings.Contains(q, "purchases") && (strings.Contains(q, "create") || strings.Contains(q, "new") || strings.Contains(q, "generate"))):
		return "draft_open_document", "purchases"
	case strings.Contains(q, "rfq") || strings.Contains(q, "request for quotation"):
		return "draft_open_document", "rfq"
	case strings.Contains(q, "sales order") || strings.Contains(q, "create so") || strings.Contains(q, "new so"):
		return "draft_open_document", "sales_order"
	case strings.Contains(q, "new sales") || strings.Contains(q, "sales invoice") || (strings.Contains(q, "create sales") && !strings.Contains(q, "order")):
		return "draft_open_document", "sales"
	case strings.Contains(q, "quotation") || strings.Contains(q, "generate quote") || strings.Contains(q, "create quote"):
		return "draft_open_document", "quotation"
	default:
		return "draft_open_document", "quotation"
	}
}
