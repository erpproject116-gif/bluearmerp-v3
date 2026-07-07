package fulfillment

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// SyncSOLineQty updates delivered_qty and billed_qty from slip line aggregates.
func SyncSOLineQty(ctx context.Context, tx pgx.Tx, salesOrderLineID int64) error {
	_, err := tx.Exec(ctx, `
		update public.so_sales_order_lines ln
		set
		  delivered_qty = coalesce((
		    select sum(qty) from public.so_sales_order_slip_lines
		    where sales_order_line_id = ln.id and slip_type = 'delivery_receipt'
		  ), 0),
		  billed_qty = coalesce((
		    select sum(qty) from public.so_sales_order_slip_lines
		    where sales_order_line_id = ln.id and slip_type = 'sales'
		  ), 0)
		where ln.id = $1`, salesOrderLineID)
	return err
}

// SyncPOLineBilledQty updates billed_qty from supplier invoice lines.
func SyncPOLineBilledQty(ctx context.Context, tx pgx.Tx, purchaseOrderLineID int64) error {
	_, err := tx.Exec(ctx, `
		update public.po_purchase_order_lines pol
		set billed_qty = coalesce((
		  select sum(sil.qty)
		  from public.fin_supplier_invoice_lines sil
		  join public.fin_supplier_invoices si on si.id = sil.supplier_invoice_id and si.deleted_at is null
		  where sil.purchase_order_line_id = pol.id
		), 0)
		where pol.id = $1`, purchaseOrderLineID)
	return err
}

// SyncSalesLineReturnedQty increments returned_qty on a sales line.
func SyncSalesLineReturnedQty(ctx context.Context, tx pgx.Tx, salesLineID int64, qty float64) error {
	_, err := tx.Exec(ctx, `
		update public.sa_sales_lines
		set returned_qty = coalesce(returned_qty, 0) + $2
		where id = $1`, salesLineID, qty)
	return err
}
