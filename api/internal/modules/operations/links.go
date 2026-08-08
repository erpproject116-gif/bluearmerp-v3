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
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type WorkItemLink struct {
	ID         int64  `json:"id"`
	WorkItemID int64  `json:"work_item_id"`
	LinkType   string `json:"link_type"`
	DocType    string `json:"doc_type"`
	DocID      int64  `json:"doc_id"`
	Label      string `json:"label,omitempty"`
	Href       string `json:"href,omitempty"`
	CreatedAt  string `json:"created_at,omitempty"`
}

type DocSearchHit struct {
	DocType string `json:"doc_type"`
	DocID   int64  `json:"doc_id"`
	Label   string `json:"label"`
	Href    string `json:"href,omitempty"`
}

type linkBody struct {
	LinkType string `json:"link_type"`
	DocType  string `json:"doc_type"`
	DocID    int64  `json:"doc_id"`
}

var supportedDocTypes = map[string]bool{
	"quo_quotation":           true,
	"so_sales_order":          true,
	"sa_sales":                true,
	"pr_purchase_request":     true,
	"rfq_request":             true,
	"rfq_supplier_quotation":  true,
	"po_purchase_order":       true,
	"gr_goods_receipt":        true,
	"fin_supplier_invoice":    true,
	"fin_official_receipt":    true,
	"job_cost_project":        true,
}

func registerLinkRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("operations.work_items", auth.AccessRead)).Get("/doc-search", searchERPDocs(pool))
	r.With(auth.RequirePermission("operations.work_items", auth.AccessRead)).Get("/work-items/{id}/links", listWorkItemLinks(pool))
	r.With(auth.RequirePermission("operations.work_items", auth.AccessWrite)).Post("/work-items/{id}/links", createWorkItemLink(pool))
	r.With(auth.RequirePermission("operations.work_items", auth.AccessWrite)).Delete("/work-items/{id}/links/{linkId}", deleteWorkItemLink(pool))
}

func listWorkItemLinks(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		workItemID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid work item id."})
			return
		}
		if _, err := loadWorkItem(r.Context(), pool, tu.TenantID, workItemID); err != nil {
			response.Err(w, http.StatusNotFound, "Work item not found.", "ERR_NOT_FOUND")
			return
		}
		out, err := loadWorkItemLinks(r.Context(), pool, tu.TenantID, workItemID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list links.", "ERR_INTERNAL")
			return
		}
		response.OK(w, out, "OK")
	}
}

func createWorkItemLink(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		workItemID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid work item id."})
			return
		}
		item, err := loadWorkItem(r.Context(), pool, tu.TenantID, workItemID)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Work item not found.", "ERR_NOT_FOUND")
			return
		}
		var body linkBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		docType := strings.TrimSpace(body.DocType)
		linkType := strings.TrimSpace(body.LinkType)
		if linkType == "" {
			linkType = "related"
		}
		if !supportedDocTypes[docType] {
			response.Validation(w, map[string]string{"doc_type": "Unsupported document type."})
			return
		}
		if body.DocID <= 0 {
			response.Validation(w, map[string]string{"doc_id": "Document is required."})
			return
		}
		label, href, ok := resolveDoc(r.Context(), pool, tu.TenantID, docType, body.DocID)
		if !ok {
			response.Validation(w, map[string]string{"doc_id": "Document not found."})
			return
		}

		var id int64
		err = pool.QueryRow(r.Context(), `
			insert into public.wm_links (work_item_id, link_type, doc_type, doc_id)
			values ($1, $2, $3, $4)
			on conflict (work_item_id, doc_type, doc_id) do update
			  set link_type = excluded.link_type
			returning id`,
			workItemID, linkType, docType, body.DocID,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create link. Apply migration 156 if not yet run.", "ERR_INTERNAL")
			return
		}

		if docType == "quo_quotation" && (item.QuotationID == nil || *item.QuotationID == 0) {
			_, _ = pool.Exec(r.Context(), `
				update public.wm_work_items set quotation_id = $3, updated_at = now()
				where id = $1 and tenant_id = $2 and quotation_id is null`,
				workItemID, tu.TenantID, body.DocID)
		}

		link := WorkItemLink{
			ID: id, WorkItemID: workItemID, LinkType: linkType,
			DocType: docType, DocID: body.DocID, Label: label, Href: href,
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "operations.work_item.link_create", "wm_work_item", &workItemID, nil, link)
		response.OK(w, link, "Linked.")
	}
}

func deleteWorkItemLink(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		workItemID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid work item id."})
			return
		}
		linkID, err := strconv.ParseInt(chi.URLParam(r, "linkId"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"linkId": "Invalid link id."})
			return
		}
		if _, err := loadWorkItem(r.Context(), pool, tu.TenantID, workItemID); err != nil {
			response.Err(w, http.StatusNotFound, "Work item not found.", "ERR_NOT_FOUND")
			return
		}
		var docType string
		var docID int64
		err = pool.QueryRow(r.Context(), `
			select l.doc_type, l.doc_id
			from public.wm_links l
			join public.wm_work_items wi on wi.id = l.work_item_id
			where l.id = $1 and l.work_item_id = $2 and wi.tenant_id = $3`,
			linkID, workItemID, tu.TenantID,
		).Scan(&docType, &docID)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Link not found.", "ERR_NOT_FOUND")
			return
		}
		tag, err := pool.Exec(r.Context(), `
			delete from public.wm_links
			where id = $1 and work_item_id = $2`, linkID, workItemID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Link not found.", "ERR_NOT_FOUND")
			return
		}
		if docType == "quo_quotation" {
			_, _ = pool.Exec(r.Context(), `
				update public.wm_work_items set quotation_id = null, updated_at = now()
				where id = $1 and tenant_id = $2 and quotation_id = $3`,
				workItemID, tu.TenantID, docID)
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "operations.work_item.link_delete", "wm_work_item", &workItemID, map[string]any{
			"link_id": linkID, "doc_type": docType, "doc_id": docID,
		}, nil)
		response.OK(w, map[string]any{"id": linkID}, "Unlinked.")
	}
}

func searchERPDocs(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		docType := strings.TrimSpace(r.URL.Query().Get("doc_type"))
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		if !supportedDocTypes[docType] {
			response.Validation(w, map[string]string{"doc_type": "Unsupported document type."})
			return
		}
		limit := 20
		hits, err := searchDocs(r.Context(), pool, tu.TenantID, docType, q, limit)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to search documents.", "ERR_INTERNAL")
			return
		}
		if hits == nil {
			hits = []DocSearchHit{}
		}
		response.OK(w, hits, "OK")
	}
}

func loadWorkItemLinks(ctx context.Context, pool *pgxpool.Pool, tenantID, workItemID int64) ([]WorkItemLink, error) {
	rows, err := pool.Query(ctx, `
		select l.id, l.work_item_id, l.link_type, l.doc_type, l.doc_id, l.created_at::text
		from public.wm_links l
		join public.wm_work_items wi on wi.id = l.work_item_id
		where l.work_item_id = $1 and wi.tenant_id = $2
		order by l.created_at desc, l.id desc`, workItemID, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []WorkItemLink
	for rows.Next() {
		var row WorkItemLink
		if err := rows.Scan(&row.ID, &row.WorkItemID, &row.LinkType, &row.DocType, &row.DocID, &row.CreatedAt); err != nil {
			return nil, err
		}
		label, href, _ := resolveDoc(ctx, pool, tenantID, row.DocType, row.DocID)
		row.Label = label
		row.Href = href
		if row.Label == "" {
			row.Label = fmt.Sprintf("%s #%d", row.DocType, row.DocID)
		}
		out = append(out, row)
	}
	if out == nil {
		out = []WorkItemLink{}
	}
	return out, nil
}

func resolveDoc(ctx context.Context, pool *pgxpool.Pool, tenantID int64, docType string, docID int64) (label, href string, ok bool) {
	href = docHref(docType, docID)
	switch docType {
	case "quo_quotation":
		err := pool.QueryRow(ctx, `
			select reference_no from public.quo_quotations
			where id = $1 and tenant_id = $2 and deleted_at is null`, docID, tenantID).Scan(&label)
		return label, href, err == nil
	case "so_sales_order":
		err := pool.QueryRow(ctx, `
			select sales_order_no from public.so_sales_orders
			where id = $1 and tenant_id = $2 and deleted_at is null`, docID, tenantID).Scan(&label)
		return label, href, err == nil
	case "sa_sales":
		err := pool.QueryRow(ctx, `
			select sales_no from public.sa_sales
			where id = $1 and tenant_id = $2 and deleted_at is null`, docID, tenantID).Scan(&label)
		return label, href, err == nil
	case "pr_purchase_request":
		err := pool.QueryRow(ctx, `
			select purchase_request_no from public.pr_purchase_requests
			where id = $1 and tenant_id = $2 and deleted_at is null`, docID, tenantID).Scan(&label)
		return label, href, err == nil
	case "rfq_request":
		err := pool.QueryRow(ctx, `
			select rfq_no from public.rfq_requests
			where id = $1 and tenant_id = $2`, docID, tenantID).Scan(&label)
		return label, href, err == nil
	case "rfq_supplier_quotation":
		err := pool.QueryRow(ctx, `
			select quote_no from public.rfq_supplier_quotations
			where id = $1 and tenant_id = $2`, docID, tenantID).Scan(&label)
		return label, href, err == nil
	case "po_purchase_order":
		err := pool.QueryRow(ctx, `
			select purchase_order_no from public.po_purchase_orders
			where id = $1 and tenant_id = $2 and deleted_at is null`, docID, tenantID).Scan(&label)
		return label, href, err == nil
	case "gr_goods_receipt":
		err := pool.QueryRow(ctx, `
			select coalesce(nullif(trim(gr.reference), ''), 'GR-' || gr.id::text)
			from public.gr_goods_receipts gr
			where gr.id = $1 and gr.tenant_id = $2`, docID, tenantID).Scan(&label)
		return label, href, err == nil
	case "fin_supplier_invoice":
		err := pool.QueryRow(ctx, `
			select invoice_no from public.fin_supplier_invoices
			where id = $1 and tenant_id = $2 and deleted_at is null`, docID, tenantID).Scan(&label)
		return label, href, err == nil
	case "fin_official_receipt":
		err := pool.QueryRow(ctx, `
			select receipt_no from public.fin_official_receipts
			where id = $1 and tenant_id = $2 and deleted_at is null`, docID, tenantID).Scan(&label)
		return label, href, err == nil
	case "job_cost_project":
		err := pool.QueryRow(ctx, `
			select project_code from public.job_cost_projects
			where id = $1 and tenant_id = $2`, docID, tenantID).Scan(&label)
		return label, href, err == nil
	default:
		return "", "", false
	}
}

func searchDocs(ctx context.Context, pool *pgxpool.Pool, tenantID int64, docType, q string, limit int) ([]DocSearchHit, error) {
	like := "%" + q + "%"
	var sql string
	switch docType {
	case "quo_quotation":
		sql = `
			select id, reference_no from public.quo_quotations
			where tenant_id = $1 and deleted_at is null
			  and ($2 = '' or reference_no ilike $3)
			order by order_date desc, id desc limit $4`
	case "so_sales_order":
		sql = `
			select id, sales_order_no from public.so_sales_orders
			where tenant_id = $1 and deleted_at is null
			  and ($2 = '' or sales_order_no ilike $3)
			order by order_date desc, id desc limit $4`
	case "sa_sales":
		sql = `
			select id, sales_no from public.sa_sales
			where tenant_id = $1 and deleted_at is null
			  and ($2 = '' or sales_no ilike $3 or coalesce(si_dr_no,'') ilike $3)
			order by order_date desc, id desc limit $4`
	case "pr_purchase_request":
		sql = `
			select id, purchase_request_no from public.pr_purchase_requests
			where tenant_id = $1 and deleted_at is null
			  and ($2 = '' or purchase_request_no ilike $3)
			order by request_date desc, id desc limit $4`
	case "rfq_request":
		sql = `
			select id, rfq_no from public.rfq_requests
			where tenant_id = $1
			  and ($2 = '' or rfq_no ilike $3)
			order by rfq_date desc, id desc limit $4`
	case "rfq_supplier_quotation":
		sql = `
			select id, quote_no from public.rfq_supplier_quotations
			where tenant_id = $1
			  and ($2 = '' or quote_no ilike $3)
			order by quote_date desc, id desc limit $4`
	case "po_purchase_order":
		sql = `
			select id, purchase_order_no from public.po_purchase_orders
			where tenant_id = $1 and deleted_at is null
			  and ($2 = '' or purchase_order_no ilike $3 or coalesce(reference,'') ilike $3)
			order by order_date desc, id desc limit $4`
	case "gr_goods_receipt":
		sql = `
			select gr.id,
			  coalesce(nullif(trim(gr.reference), ''), 'GR-' || gr.id::text)
			from public.gr_goods_receipts gr
			where gr.tenant_id = $1
			  and ($2 = '' or coalesce(gr.reference,'') ilike $3 or ('GR-' || gr.id::text) ilike $3)
			order by gr.receipt_date desc, gr.id desc limit $4`
	case "fin_supplier_invoice":
		sql = `
			select id, invoice_no from public.fin_supplier_invoices
			where tenant_id = $1 and deleted_at is null
			  and ($2 = '' or invoice_no ilike $3)
			order by invoice_date desc, id desc limit $4`
	case "fin_official_receipt":
		sql = `
			select id, receipt_no from public.fin_official_receipts
			where tenant_id = $1 and deleted_at is null
			  and ($2 = '' or receipt_no ilike $3 or coalesce(reference_no,'') ilike $3)
			order by receipt_date desc, id desc limit $4`
	case "job_cost_project":
		sql = `
			select id, project_code from public.job_cost_projects
			where tenant_id = $1
			  and ($2 = '' or project_code ilike $3 or coalesce(project_name,'') ilike $3)
			order by id desc limit $4`
	default:
		return nil, fmt.Errorf("unsupported doc type")
	}
	rows, err := pool.Query(ctx, sql, tenantID, q, like, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DocSearchHit
	for rows.Next() {
		var hit DocSearchHit
		hit.DocType = docType
		if err := rows.Scan(&hit.DocID, &hit.Label); err != nil {
			return nil, err
		}
		hit.Href = docHref(docType, hit.DocID)
		out = append(out, hit)
	}
	return out, rows.Err()
}

func docHref(docType string, docID int64) string {
	id := strconv.FormatInt(docID, 10)
	switch docType {
	case "quo_quotation":
		return "/app/quotation/quotations/" + id
	case "so_sales_order":
		return "/app/sales-order/sales-orders"
	case "sa_sales":
		return "/app/sales/sales"
	case "pr_purchase_request":
		return "/app/purchase-request/purchase-requests"
	case "rfq_request":
		return "/app/purchase-order/rfq/" + id
	case "rfq_supplier_quotation":
		return "/app/purchase-order/rfq"
	case "po_purchase_order":
		return "/app/purchase-order/purchase-orders"
	case "gr_goods_receipt":
		return "/app/purchase-order/goods-receipt"
	case "fin_supplier_invoice":
		return "/app/purchases/purchase-receive"
	case "fin_official_receipt":
		return "/app/finance/official-receipts"
	case "job_cost_project":
		return "/app/job-costing"
	default:
		return ""
	}
}
