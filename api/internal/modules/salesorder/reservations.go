package salesorder

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/inventory"
)

type soLineReserveInput struct {
	LineID   int64
	ItemID   *int64
	Qty      float64
	Reserved float64
}

// syncSalesOrderReservations adjusts qty_reserved on balances when SO lines are saved (split release mode).
func syncSalesOrderReservations(
	ctx context.Context,
	tx pgx.Tx,
	tenantID, locationID, userID int64,
	lines []soLineReserveInput,
	legacyCombined bool,
) error {
	if legacyCombined {
		return nil
	}
	for _, ln := range lines {
		if ln.ItemID == nil || ln.Qty <= 0 {
			continue
		}
		var track bool
		if err := tx.QueryRow(ctx, `
			select coalesce(track_inventory_qty, false)
			from public.inv_items where id = $1 and tenant_id = $2`,
			*ln.ItemID, tenantID).Scan(&track); err != nil || !track {
			continue
		}

		target := ln.Qty
		delta := target - ln.Reserved
		if delta > 0.0001 {
			if err := inventory.ReserveStock(ctx, tx, tenantID, *ln.ItemID, locationID, delta); err != nil {
				return fmt.Errorf("line %d: %w", ln.LineID, err)
			}
			_, err := tx.Exec(ctx, `
				insert into public.inv_stock_movements
				  (tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, created_by_user_id)
				values ($1, $2, $3, 0, 'so_reserve', 'so_sales_order_line', $4, $5)`,
				tenantID, *ln.ItemID, locationID, ln.LineID, userID)
			if err != nil {
				return err
			}
			_, err = tx.Exec(ctx, `
				update public.so_sales_order_lines
				set qty_reserved = qty_reserved + $1
				where id = $2`, delta, ln.LineID)
			if err != nil {
				return err
			}
		} else if delta < -0.0001 {
			unreserve := -delta
			if err := inventory.UnreserveStock(ctx, tx, tenantID, *ln.ItemID, locationID, unreserve); err != nil {
				return fmt.Errorf("line %d: %w", ln.LineID, err)
			}
			_, err := tx.Exec(ctx, `
				insert into public.inv_stock_movements
				  (tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, created_by_user_id)
				values ($1, $2, $3, 0, 'so_reserve_undo', 'so_sales_order_line', $4, $5)`,
				tenantID, *ln.ItemID, locationID, ln.LineID, userID)
			if err != nil {
				return err
			}
			_, err = tx.Exec(ctx, `
				update public.so_sales_order_lines
				set qty_reserved = greatest(qty_reserved - $1, 0)
				where id = $2`, unreserve, ln.LineID)
			if err != nil {
				return err
			}
		}
	}
	return nil
}

func unreserveAllSalesOrderLines(ctx context.Context, tx pgx.Tx, tenantID, locationID, userID, salesOrderID int64) error {
	rows, err := tx.Query(ctx, `
		select ln.id, ln.item_id, ln.qty_reserved::float8
		from public.so_sales_order_lines ln
		join public.inv_items i on i.id = ln.item_id and i.tenant_id = $1
		where ln.sales_order_id = $2 and ln.qty_reserved > 0
		  and coalesce(i.track_inventory_qty, false) = true`,
		tenantID, salesOrderID)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var lineID int64
		var itemID *int64
		var reserved float64
		if err := rows.Scan(&lineID, &itemID, &reserved); err != nil {
			return err
		}
		if itemID == nil || reserved <= 0 {
			continue
		}
		if err := inventory.UnreserveStock(ctx, tx, tenantID, *itemID, locationID, reserved); err != nil {
			return err
		}
		_, _ = tx.Exec(ctx, `
			insert into public.inv_stock_movements
			  (tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, created_by_user_id)
			values ($1, $2, $3, 0, 'so_reserve_undo', 'so_sales_order_line', $4, $5)`,
			tenantID, *itemID, locationID, lineID, userID)
		_, err = tx.Exec(ctx, `update public.so_sales_order_lines set qty_reserved = 0 where id = $1`, lineID)
		if err != nil {
			return err
		}
	}
	return nil
}
