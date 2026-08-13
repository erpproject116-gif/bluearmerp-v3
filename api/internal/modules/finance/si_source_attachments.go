package finance

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/attachmentx"
)

// collectPOIDsForSIAttachments resolves originating purchase order ids from
// request line FKs (PO lines and/or GR lines).
func collectPOIDsForSIAttachments(
	ctx context.Context,
	pool *pgxpool.Pool,
	tenantID int64,
	lines []supplierInvoiceLineBody,
) map[int64]struct{} {
	poIDs := map[int64]struct{}{}
	for _, ln := range lines {
		if ln.PurchaseOrderLineID != nil && *ln.PurchaseOrderLineID > 0 {
			var poID int64
			if err := pool.QueryRow(ctx,
				`select purchase_order_id from public.po_purchase_order_lines where id = $1`,
				*ln.PurchaseOrderLineID).Scan(&poID); err == nil && poID > 0 {
				poIDs[poID] = struct{}{}
			}
		}
		if ln.GoodsReceiptLineID != nil && *ln.GoodsReceiptLineID > 0 {
			var poID int64
			if err := pool.QueryRow(ctx, `
				select gr.purchase_order_id
				from public.gr_goods_receipt_lines grl
				join public.gr_goods_receipts gr on gr.id = grl.goods_receipt_id
				where grl.id = $1 and gr.tenant_id = $2`,
				*ln.GoodsReceiptLineID, tenantID).Scan(&poID); err == nil && poID > 0 {
				poIDs[poID] = struct{}{}
			}
		}
	}
	return poIDs
}

func enrichPOIDsFromPersistedSILines(
	ctx context.Context,
	pool *pgxpool.Pool,
	tenantID, invoiceID int64,
	poIDs map[int64]struct{},
) {
	rows, err := pool.Query(ctx, `
		select distinct coalesce(pol.purchase_order_id, gr.purchase_order_id)
		from public.fin_supplier_invoice_lines sil
		left join public.po_purchase_order_lines pol on pol.id = sil.purchase_order_line_id
		left join public.gr_goods_receipt_lines grl on grl.id = sil.goods_receipt_line_id
		left join public.gr_goods_receipts gr on gr.id = grl.goods_receipt_id and gr.tenant_id = $2
		where sil.supplier_invoice_id = $1
		  and (sil.purchase_order_line_id is not null or sil.goods_receipt_line_id is not null)`,
		invoiceID, tenantID)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var poID *int64
		if rows.Scan(&poID) == nil && poID != nil && *poID > 0 {
			poIDs[*poID] = struct{}{}
		}
	}
}

// copySupplierInvoiceSourceAttachments copies PO attachments onto a Purchase Receive / SI.
// Best-effort: logs failures and returns how many files were inserted.
func copySupplierInvoiceSourceAttachments(
	ctx context.Context,
	pool *pgxpool.Pool,
	tenantID, invoiceID int64,
	lines []supplierInvoiceLineBody,
) int {
	poIDs := collectPOIDsForSIAttachments(ctx, pool, tenantID, lines)
	enrichPOIDsFromPersistedSILines(ctx, pool, tenantID, invoiceID, poIDs)
	if len(poIDs) == 0 {
		return 0
	}

	copied := 0
	for poID := range poIDs {
		n, err := attachmentx.Copy(ctx, pool, attachmentx.CopyParams{
			SrcBaseDir: attachmentx.Dir("purchase_order"),
			DstBaseDir: attachmentx.Dir("supplier_invoice"),
			SrcTable:   "public.po_purchase_order_attachments",
			SrcFKCol:   "purchase_order_id",
			SrcID:      poID,
			DstTable:   "public.fin_supplier_invoice_attachments",
			DstFKCol:   "supplier_invoice_id",
			DstID:      invoiceID,
			TenantID:   tenantID,
		})
		if err != nil {
			log.Printf("supplier_invoice: copy PO %d attachments to SI %d: %v", poID, invoiceID, err)
			continue
		}
		copied += n
	}
	return copied
}

func supplierInvoiceCreateMessage(copied int) string {
	if copied > 0 {
		return fmt.Sprintf("Created. Copied %d attachment(s) from purchase order(s).", copied)
	}
	return "Created."
}
