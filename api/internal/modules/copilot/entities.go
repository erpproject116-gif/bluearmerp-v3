package copilot

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// EntityRef is a tagged ERP object from @-mentions or resolved lookups.
type EntityRef struct {
	Type  string `json:"type"` // item | customer | vendor | partner | serial | sales | quotation | purchase_order | sales_order | load_slip
	ID    int64  `json:"id"`
	Code  string `json:"code,omitempty"`
	Label string `json:"label"`
	Extra string `json:"extra,omitempty"`
	Href  string `json:"href,omitempty"`
}

var mentionTokenRe = regexp.MustCompile(`@\[([a-z_]+):(\d+)\|([^\]]+)\]`)

type entitySearchBody struct {
	Q     string   `json:"q"`
	Types []string `json:"types"` // empty = all common
	Limit int      `json:"limit"`
}

func postEntitySearch(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		var body entitySearchBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			// Also allow GET-style via query for convenience
			body.Q = strings.TrimSpace(r.URL.Query().Get("q"))
		}
		q := strings.TrimSpace(body.Q)
		if q == "" {
			response.Validation(w, map[string]string{"q": "Query is required."})
			return
		}
		if len(q) > 120 {
			q = q[:120]
		}
		limit := body.Limit
		if limit <= 0 {
			limit = 8
		}
		if limit > 20 {
			limit = 20
		}
		types := body.Types
		if len(types) == 0 {
			// Infer from leading keyword: @item foo → type item
			types = inferTypesFromQuery(q)
		}
		out := searchEntities(r.Context(), pool, tu, q, types, limit)
		response.OK(w, map[string]any{"entities": out, "q": q}, "OK")
	}
}

func getEntitySearch(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		if q == "" {
			response.Validation(w, map[string]string{"q": "Query is required."})
			return
		}
		typeParam := strings.TrimSpace(r.URL.Query().Get("type"))
		var types []string
		if typeParam != "" {
			types = []string{typeParam}
		} else {
			types = inferTypesFromQuery(q)
		}
		out := searchEntities(r.Context(), pool, tu, q, types, 8)
		response.OK(w, map[string]any{"entities": out, "q": q}, "OK")
	}
}

func inferTypesFromQuery(q string) []string {
	lower := strings.ToLower(strings.TrimSpace(q))
	switch {
	case strings.HasPrefix(lower, "item:") || strings.HasPrefix(lower, "sku:") || strings.HasPrefix(lower, "code:"):
		return []string{"item"}
	case strings.HasPrefix(lower, "customer:") || strings.HasPrefix(lower, "cust:"):
		return []string{"customer"}
	case strings.HasPrefix(lower, "vendor:") || strings.HasPrefix(lower, "supplier:"):
		return []string{"vendor"}
	case strings.HasPrefix(lower, "serial:") || strings.HasPrefix(lower, "sn:"):
		return []string{"serial"}
	case strings.HasPrefix(lower, "invoice:") || strings.HasPrefix(lower, "si:") || strings.HasPrefix(lower, "sales:"):
		return []string{"sales"}
	case strings.HasPrefix(lower, "quote:") || strings.HasPrefix(lower, "quotation:") || strings.HasPrefix(lower, "qt:"):
		return []string{"quotation"}
	case strings.HasPrefix(lower, "po:") || strings.HasPrefix(lower, "purchase:"):
		return []string{"purchase_order"}
	case strings.HasPrefix(lower, "so:") || strings.HasPrefix(lower, "order:"):
		return []string{"sales_order"}
	case strings.HasPrefix(lower, "partner:"):
		return []string{"partner"}
	case strings.HasPrefix(lower, "slip:") || strings.HasPrefix(lower, "load:") || strings.HasPrefix(lower, "loadslip:"):
		return []string{"load_slip"}
	case strings.HasPrefix(lower, "txn:") || strings.HasPrefix(lower, "transaction:"):
		return []string{"sales", "purchase_order", "sales_order", "quotation"}
	default:
		return []string{"item", "customer", "vendor", "serial", "sales", "quotation", "purchase_order", "sales_order", "load_slip"}
	}
}

func stripTypePrefix(q string) string {
	lower := strings.ToLower(q)
	for _, p := range []string{
		"item:", "sku:", "code:", "customer:", "cust:", "vendor:", "supplier:",
		"serial:", "sn:", "invoice:", "si:", "sales:", "quote:", "quotation:", "qt:",
		"po:", "purchase:", "so:", "order:", "partner:", "slip:", "load:", "loadslip:",
		"txn:", "transaction:",
	} {
		if strings.HasPrefix(lower, p) {
			return strings.TrimSpace(q[len(p):])
		}
	}
	return strings.TrimSpace(q)
}

// parseMentionTokens extracts @[type:id|label] chips from free text.
func parseMentionTokens(text string) []EntityRef {
	matches := mentionTokenRe.FindAllStringSubmatch(text, -1)
	if len(matches) == 0 {
		return nil
	}
	var out []EntityRef
	seen := map[string]struct{}{}
	for _, m := range matches {
		id, err := strconv.ParseInt(m[2], 10, 64)
		if err != nil || id <= 0 {
			continue
		}
		etype := strings.ToLower(m[1])
		key := etype + ":" + m[2]
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, EntityRef{
			Type:  etype,
			ID:    id,
			Label: strings.TrimSpace(m[3]),
			Code:  strings.TrimSpace(m[3]),
			Href:  defaultHrefForType(etype),
		})
	}
	return out
}

func defaultHrefForType(t string) string {
	switch t {
	case "item":
		return "/app/inventory/items"
	case "customer", "vendor", "partner":
		return "/app/inventory/partners"
	case "serial":
		return "/app/inventory/serial-lot"
	case "sales", "invoice":
		return "/app/sales"
	case "quotation", "quote":
		return "/app/quotation/quotations"
	case "purchase_order", "po":
		return "/app/purchase-order"
	case "sales_order", "so":
		return "/app/sales-order"
	case "load_slip":
		return "/app/documentation"
	default:
		return "/app/dashboard"
	}
}

func mergeEntities(a, b []EntityRef) []EntityRef {
	seen := map[string]struct{}{}
	var out []EntityRef
	add := func(e EntityRef) {
		if e.ID <= 0 && e.Label == "" {
			return
		}
		key := e.Type + ":" + itoa(e.ID) + ":" + e.Label
		if _, ok := seen[key]; ok {
			return
		}
		seen[key] = struct{}{}
		if e.Href == "" {
			e.Href = defaultHrefForType(e.Type)
		}
		out = append(out, e)
	}
	for _, e := range a {
		add(e)
	}
	for _, e := range b {
		add(e)
	}
	return out
}

func searchEntities(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, q string, types []string, limit int) []EntityRef {
	needle := stripTypePrefix(q)
	if needle == "" {
		needle = q
	}
	seen := map[string]struct{}{}
	var out []EntityRef
	perType := limit
	if len(types) > 1 {
		perType = max(3, limit/len(types)+1)
	}
	add := func(e EntityRef) {
		key := e.Type + ":" + itoa(e.ID)
		if _, ok := seen[key]; ok {
			return
		}
		seen[key] = struct{}{}
		out = append(out, e)
	}
	for _, t := range types {
		if len(out) >= limit {
			break
		}
		switch strings.ToLower(strings.TrimSpace(t)) {
		case "item":
			for _, e := range searchItems(ctx, pool, tu.TenantID, needle, perType) {
				add(e)
			}
		case "customer":
			for _, e := range searchPartners(ctx, pool, tu.TenantID, needle, "customer", perType) {
				add(e)
			}
		case "vendor":
			for _, e := range searchPartners(ctx, pool, tu.TenantID, needle, "vendor", perType) {
				add(e)
			}
		case "partner":
			for _, e := range searchPartners(ctx, pool, tu.TenantID, needle, "", perType) {
				add(e)
			}
		case "serial":
			for _, e := range searchSerials(ctx, pool, tu.TenantID, needle, perType) {
				add(e)
			}
		case "sales", "invoice":
			for _, e := range searchSales(ctx, pool, tu.TenantID, needle, perType) {
				add(e)
			}
		case "quotation", "quote":
			for _, e := range searchQuotations(ctx, pool, tu.TenantID, needle, perType) {
				add(e)
			}
		case "purchase_order", "po":
			for _, e := range searchPOs(ctx, pool, tu.TenantID, needle, perType) {
				add(e)
			}
		case "sales_order", "so":
			for _, e := range searchSOs(ctx, pool, tu.TenantID, needle, perType) {
				add(e)
			}
		case "load_slip", "slip":
			for _, e := range searchLoadSlips(ctx, pool, tu.TenantID, needle, perType) {
				add(e)
			}
		}
	}
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}

func searchItems(ctx context.Context, pool *pgxpool.Pool, tenantID int64, q string, limit int) []EntityRef {
	rows, err := pool.Query(ctx, `
		select id, item_code, item_name
		from public.inv_items
		where tenant_id = $1 and deleted_at is null
		  and (item_code ilike '%' || $2 || '%' or item_name ilike '%' || $2 || '%')
		order by case when item_code ilike $2 || '%' then 0 else 1 end, item_code
		limit $3`, tenantID, q, limit)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []EntityRef
	for rows.Next() {
		var id int64
		var code, name string
		if rows.Scan(&id, &code, &name) != nil {
			continue
		}
		out = append(out, EntityRef{
			Type: "item", ID: id, Code: code, Label: name,
			Extra: code, Href: "/app/inventory/items",
		})
	}
	return out
}

func searchPartners(ctx context.Context, pool *pgxpool.Pool, tenantID int64, q, kind string, limit int) []EntityRef {
	kindFilter := ""
	args := []any{tenantID, q, limit}
	if kind == "customer" {
		kindFilter = " and partner_kind in ('customer','both')"
	} else if kind == "vendor" {
		kindFilter = " and partner_kind in ('vendor','both')"
	}
	rows, err := pool.Query(ctx, `
		select id, partner_code, partner_kind, company_name
		from public.inv_partners
		where tenant_id = $1 and deleted_at is null`+kindFilter+`
		  and (company_name ilike '%' || $2 || '%' or partner_code ilike '%' || $2 || '%' or coalesce(email,'') ilike '%' || $2 || '%')
		order by company_name
		limit $3`, args...)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []EntityRef
	for rows.Next() {
		var id int64
		var code, pkind, name string
		if rows.Scan(&id, &code, &pkind, &name) != nil {
			continue
		}
		etype := "partner"
		href := "/app/inventory/partners"
		if pkind == "customer" || pkind == "both" {
			etype = "customer"
		}
		if kind == "vendor" || pkind == "vendor" {
			etype = "vendor"
		}
		out = append(out, EntityRef{
			Type: etype, ID: id, Code: code, Label: name, Extra: pkind, Href: href,
		})
	}
	return out
}

func searchSerials(ctx context.Context, pool *pgxpool.Pool, tenantID int64, q string, limit int) []EntityRef {
	rows, err := pool.Query(ctx, `
		select u.id, u.serial_no, coalesce(i.item_code,''), coalesce(u.status,'')
		from public.inv_serial_units u
		left join public.inv_items i on i.id = u.item_id and i.tenant_id = u.tenant_id
		where u.tenant_id = $1 and u.status <> 'void'
		  and u.serial_no ilike '%' || $2 || '%'
		order by u.serial_no
		limit $3`, tenantID, q, limit)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []EntityRef
	for rows.Next() {
		var id int64
		var sn, itemCode, status string
		if rows.Scan(&id, &sn, &itemCode, &status) != nil {
			continue
		}
		out = append(out, EntityRef{
			Type: "serial", ID: id, Code: sn, Label: sn,
			Extra: strings.TrimSpace(itemCode + " " + status),
			Href:  "/app/inventory/serial-lot",
		})
	}
	return out
}

func searchSales(ctx context.Context, pool *pgxpool.Pool, tenantID int64, q string, limit int) []EntityRef {
	rows, err := pool.Query(ctx, `
		select s.id, s.sales_no, coalesce(p.company_name,'')
		from public.sa_sales s
		left join public.inv_partners p on p.id = s.partner_id
		where s.tenant_id = $1 and s.deleted_at is null
		  and (s.sales_no ilike '%' || $2 || '%' or coalesce(p.company_name,'') ilike '%' || $2 || '%')
		order by s.id desc
		limit $3`, tenantID, q, limit)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []EntityRef
	for rows.Next() {
		var id int64
		var no, partner string
		if rows.Scan(&id, &no, &partner) != nil {
			continue
		}
		out = append(out, EntityRef{
			Type: "sales", ID: id, Code: no, Label: no, Extra: partner,
			Href: "/app/sales",
		})
	}
	return out
}

func searchQuotations(ctx context.Context, pool *pgxpool.Pool, tenantID int64, q string, limit int) []EntityRef {
	rows, err := pool.Query(ctx, `
		select q.id, q.reference_no, coalesce(p.company_name,'')
		from public.quo_quotations q
		left join public.inv_partners p on p.id = q.partner_id
		where q.tenant_id = $1 and q.deleted_at is null
		  and (q.reference_no ilike '%' || $2 || '%' or coalesce(p.company_name,'') ilike '%' || $2 || '%')
		order by q.id desc
		limit $3`, tenantID, q, limit)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []EntityRef
	for rows.Next() {
		var id int64
		var no, partner string
		if rows.Scan(&id, &no, &partner) != nil {
			continue
		}
		out = append(out, EntityRef{
			Type: "quotation", ID: id, Code: no, Label: no, Extra: partner,
			Href: "/app/quotation/quotations",
		})
	}
	return out
}

func searchPOs(ctx context.Context, pool *pgxpool.Pool, tenantID int64, q string, limit int) []EntityRef {
	rows, err := pool.Query(ctx, `
		select po.id, po.purchase_order_no, coalesce(p.company_name,'')
		from public.po_purchase_orders po
		left join public.inv_partners p on p.id = po.partner_id
		where po.tenant_id = $1 and po.deleted_at is null
		  and (po.purchase_order_no ilike '%' || $2 || '%' or coalesce(p.company_name,'') ilike '%' || $2 || '%')
		order by po.id desc
		limit $3`, tenantID, q, limit)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []EntityRef
	for rows.Next() {
		var id int64
		var no, partner string
		if rows.Scan(&id, &no, &partner) != nil {
			continue
		}
		out = append(out, EntityRef{
			Type: "purchase_order", ID: id, Code: no, Label: no, Extra: partner,
			Href: "/app/purchase-order",
		})
	}
	return out
}

func searchSOs(ctx context.Context, pool *pgxpool.Pool, tenantID int64, q string, limit int) []EntityRef {
	rows, err := pool.Query(ctx, `
		select so.id, so.sales_order_no, coalesce(p.company_name,'')
		from public.so_sales_orders so
		left join public.inv_partners p on p.id = so.partner_id
		where so.tenant_id = $1 and so.deleted_at is null
		  and (so.sales_order_no ilike '%' || $2 || '%' or coalesce(p.company_name,'') ilike '%' || $2 || '%')
		order by so.id desc
		limit $3`, tenantID, q, limit)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []EntityRef
	for rows.Next() {
		var id int64
		var no, partner string
		if rows.Scan(&id, &no, &partner) != nil {
			continue
		}
		out = append(out, EntityRef{
			Type: "sales_order", ID: id, Code: no, Label: no, Extra: partner,
			Href: "/app/sales-order",
		})
	}
	return out
}

func searchLoadSlips(ctx context.Context, pool *pgxpool.Pool, tenantID int64, q string, limit int) []EntityRef {
	// Load slips are line-level slip_ref links between documents — search recent refs.
	rows, err := pool.Query(ctx, `
		select id, slip_ref, slip_type, href from (
		  select so.id,
		    coalesce(sl.slip_ref, '') as slip_ref,
		    coalesce(sl.slip_type, '') as slip_type,
		    '/app/sales-order' as href
		  from public.so_sales_order_slip_lines sl
		  join public.so_sales_order_lines ln on ln.id = sl.sales_order_line_id
		  join public.so_sales_orders so on so.id = ln.sales_order_id
		  where so.tenant_id = $1 and so.deleted_at is null
		    and coalesce(sl.slip_ref, '') ilike '%' || $2 || '%'
		  union all
		  select q.id,
		    coalesce(sl.slip_ref, '') as slip_ref,
		    coalesce(sl.slip_type, '') as slip_type,
		    '/app/quotation/quotations' as href
		  from public.quo_quotation_slip_lines sl
		  join public.quo_quotation_lines ln on ln.id = sl.quotation_line_id
		  join public.quo_quotations q on q.id = ln.quotation_id
		  where q.tenant_id = $1 and q.deleted_at is null
		    and coalesce(sl.slip_ref, '') ilike '%' || $2 || '%'
		) x
		where slip_ref <> ''
		order by id desc
		limit $3`, tenantID, q, limit)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []EntityRef
	seen := map[string]struct{}{}
	for rows.Next() {
		var id int64
		var ref, stype, href string
		if rows.Scan(&id, &ref, &stype, &href) != nil {
			continue
		}
		key := ref + ":" + stype
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, EntityRef{
			Type: "load_slip", ID: id, Code: ref, Label: ref, Extra: stype, Href: href,
		})
	}
	return out
}

func itoa(n int64) string {
	return strconv.FormatInt(n, 10)
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func toolLookupEntities(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, entities []EntityRef, q string) toolResult {
	resolved := entities
	if len(resolved) == 0 && strings.TrimSpace(q) != "" {
		resolved = searchEntities(ctx, pool, tu, q, inferTypesFromQuery(q), 8)
	}
	raw, _ := json.Marshal(map[string]any{"entities": resolved})
	links := make([]deepLink, 0, len(resolved))
	for _, e := range resolved {
		if e.Href == "" {
			continue
		}
		label := e.Type + " " + e.Label
		if e.Code != "" && e.Code != e.Label {
			label = e.Type + " " + e.Code
		}
		links = append(links, deepLink{Label: label, Href: e.Href})
	}
	return toolResult{Name: "lookup_entities", OK: true, Data: raw, DeepLinks: links}
}
