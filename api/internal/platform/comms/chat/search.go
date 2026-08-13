package chat

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

func searchEntities(ctx context.Context, pool *pgxpool.Pool, tenantID int64, entityType, q string, limit int) ([]DocSearchHit, error) {
	like := "%" + q + "%"
	var sql string
	switch entityType {
	case "quo_quotation":
		sql = `select id, reference_no from public.quo_quotations
			where tenant_id=$1 and deleted_at is null and ($2='' or reference_no ilike $3)
			order by order_date desc, id desc limit $4`
	case "so_sales_order":
		sql = `select id, sales_order_no from public.so_sales_orders
			where tenant_id=$1 and deleted_at is null and ($2='' or sales_order_no ilike $3)
			order by order_date desc, id desc limit $4`
	case "sa_sales":
		sql = `select id, sales_no from public.sa_sales
			where tenant_id=$1 and deleted_at is null and ($2='' or sales_no ilike $3)
			order by order_date desc, id desc limit $4`
	case "pr_purchase_request":
		sql = `select id, purchase_request_no from public.pr_purchase_requests
			where tenant_id=$1 and deleted_at is null and ($2='' or purchase_request_no ilike $3)
			order by request_date desc, id desc limit $4`
	case "rfq_request":
		sql = `select id, rfq_no from public.rfq_requests
			where tenant_id=$1 and ($2='' or rfq_no ilike $3)
			order by rfq_date desc, id desc limit $4`
	case "rfq_supplier_quotation":
		sql = `select id, quote_no from public.rfq_supplier_quotations
			where tenant_id=$1 and ($2='' or quote_no ilike $3)
			order by quote_date desc, id desc limit $4`
	case "po_purchase_order":
		sql = `select id, purchase_order_no from public.po_purchase_orders
			where tenant_id=$1 and deleted_at is null and ($2='' or purchase_order_no ilike $3)
			order by order_date desc, id desc limit $4`
	case "gr_goods_receipt":
		sql = `select id, coalesce(nullif(trim(reference), ''), 'GR-' || id::text)
			from public.gr_goods_receipts
			where tenant_id=$1 and ($2='' or coalesce(reference,'') ilike $3 or ('GR-' || id::text) ilike $3)
			order by receipt_date desc, id desc limit $4`
	case "fin_supplier_invoice":
		sql = `select id, invoice_no from public.fin_supplier_invoices
			where tenant_id=$1 and deleted_at is null and ($2='' or invoice_no ilike $3)
			order by invoice_date desc, id desc limit $4`
	case "fin_official_receipt":
		sql = `select id, receipt_no from public.fin_official_receipts
			where tenant_id=$1 and deleted_at is null and ($2='' or receipt_no ilike $3)
			order by receipt_date desc, id desc limit $4`
	case "fin_payment_voucher":
		sql = `select id, payment_no from public.fin_payment_vouchers
			where tenant_id=$1 and deleted_at is null and ($2='' or payment_no ilike $3)
			order by payment_date desc, id desc limit $4`
	case "job_cost_project":
		sql = `select id, project_code from public.job_cost_projects
			where tenant_id=$1 and ($2='' or project_code ilike $3 or coalesce(project_name,'') ilike $3)
			order by id desc limit $4`
	case "support_ticket":
		sql = `select id, ticket_no from public.sup_support_tickets
			where tenant_id=$1 and ($2='' or ticket_no ilike $3 or coalesce(subject,'') ilike $3)
			order by id desc limit $4`
	case "crm_warranty_asset":
		sql = `select id, serial_no from public.crm_warranty_assets
			where tenant_id=$1 and ($2='' or serial_no ilike $3)
			order by id desc limit $4`
	default:
		return nil, fmt.Errorf("unsupported entity type")
	}
	rows, err := pool.Query(ctx, sql, tenantID, q, like, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DocSearchHit
	for rows.Next() {
		var hit DocSearchHit
		hit.EntityType = entityType
		if err := rows.Scan(&hit.EntityID, &hit.Label); err != nil {
			return nil, err
		}
		eid := hit.EntityID
		hit.Href = EntityHref(entityType, &eid)
		out = append(out, hit)
	}
	return out, rows.Err()
}
