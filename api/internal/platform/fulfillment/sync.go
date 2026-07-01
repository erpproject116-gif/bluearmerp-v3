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

// SyncPOLineBilledQty updates billed_qty from GR supplier-invoice slips.
func SyncPOLineBilledQty(ctx context.Context, tx pgx.Tx, purchaseOrderLineID int64) error {
	_, err := tx.Exec(ctx, `
		update public.po_purchase_order_lines pol
		set billed_qty = coalesce((
		  select sum(gs.qty)
		  from public.gr_goods_receipt_slip_lines gs
		  join public.gr_goods_receipt_lines grl on grl.id = gs.goods_receipt_line_id
		  where grl.purchase_order_line_id = pol.id and gs.slip_type = 'supplier_invoice'
		), 0)
		where pol.id = $1`, purchaseOrderLineID)
	return err
}

// SyncSalesLineReturnedQty sets returned_qty on a sales line.
func SyncSalesLineReturnedQty(ctx context.Context, tx pgx.Tx, salesLineID int64, qty float64) error {
	_, err := tx.Exec(ctx, `
		update public.sa_sales_lines
		set returned_qty = $2
		where id = $1`, salesLineID, qty)
	return err
}
