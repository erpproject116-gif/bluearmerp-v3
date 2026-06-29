package sales

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// applySaleStock deducts inventory for direct (non-SO) lines with track_inventory_qty.
// SO-linked lines rely on prior SO release for qty deduction.
func applySaleStock(ctx context.Context, tx pgx.Tx, tenantID, salesID, locationID, userID int64) error {
	rows, err := tx.Query(ctx, `
		select ln.id, ln.item_id, ln.qty::float8, ln.source_sales_order_line_id
		from public.sa_sales_lines ln
		where ln.sales_id = $1
		order by ln.line_no`, salesID)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var lineID int64
		var itemID *int64
		var qty float64
		var soLineID *int64
		if err := rows.Scan(&lineID, &itemID, &qty, &soLineID); err != nil {
			return err
		}
		if soLineID != nil || itemID == nil || qty <= 0 {
			continue
		}
		var trackInventory bool
		if err := tx.QueryRow(ctx, `select track_inventory_qty from public.inv_items where id = $1`, *itemID).Scan(&trackInventory); err != nil || !trackInventory {
			continue
		}

		var qtyOnHand float64
		err := tx.QueryRow(ctx, `
			select qty_on_hand::float8
			from public.inv_item_location_balances
			where tenant_id = $1 and item_id = $2 and location_id = $3
			for update`, tenantID, *itemID, locationID).Scan(&qtyOnHand)
		if err != nil {
			return fmt.Errorf("line item %d: insufficient stock at location", lineID)
		}
		if qtyOnHand+0.0001 < qty {
			return fmt.Errorf("line item %d: insufficient stock (%.4f on hand)", lineID, qtyOnHand)
		}

		tag, err := tx.Exec(ctx, `
			update public.inv_item_location_balances
			set qty_on_hand = qty_on_hand - $1, updated_at = now()
			where tenant_id = $2 and item_id = $3 and location_id = $4`,
			qty, tenantID, *itemID, locationID)
		if err != nil || tag.RowsAffected() == 0 {
			return fmt.Errorf("line item %d: failed to update stock", lineID)
		}

		_, err = tx.Exec(ctx, `
			insert into public.inv_stock_movements (
			  tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, created_by_user_id
			) values ($1, $2, $3, $4, 'sales', 'sa_sales_line', $5, $6)`,
			tenantID, *itemID, locationID, -qty, lineID, userID)
		if err != nil {
			return err
		}
	}
	return rows.Err()
}

// applySaleLot deducts lot batch qty for sales lines with lot_batch_id set.
func applySaleLot(ctx context.Context, tx pgx.Tx, tenantID, salesID int64) error {
	rows, err := tx.Query(ctx, `
		select ln.id, ln.lot_batch_id, ln.qty::float8
		from public.sa_sales_lines ln
		where ln.sales_id = $1 and ln.lot_batch_id is not null
		order by ln.line_no`, salesID)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var lineID, lotBatchID int64
		var qty float64
		if err := rows.Scan(&lineID, &lotBatchID, &qty); err != nil {
			return err
		}
		if qty <= 0 {
			continue
		}
		var lotQty float64
		err := tx.QueryRow(ctx, `
			select qty_on_hand::float8
			from public.inv_lot_batches
			where id = $1 and tenant_id = $2
			for update`, lotBatchID, tenantID).Scan(&lotQty)
		if err != nil {
			return fmt.Errorf("line %d: lot batch not found", lineID)
		}
		if lotQty+0.0001 < qty {
			return fmt.Errorf("line %d: insufficient lot qty (%.4f on hand)", lineID, lotQty)
		}
		tag, err := tx.Exec(ctx, `
			update public.inv_lot_batches
			set qty_on_hand = qty_on_hand - $1, updated_at = now()
			where id = $2 and tenant_id = $3 and qty_on_hand >= $1 - 0.0001`,
			qty, lotBatchID, tenantID)
		if err != nil || tag.RowsAffected() == 0 {
			return fmt.Errorf("line %d: failed to deduct lot qty", lineID)
		}
	}
	return rows.Err()
}

// reverseSaleLot restores lot batch qty for lines on this sales invoice.
func reverseSaleLot(ctx context.Context, tx pgx.Tx, tenantID, salesID int64) error {
	rows, err := tx.Query(ctx, `
		select ln.lot_batch_id, ln.qty::float8
		from public.sa_sales_lines ln
		where ln.sales_id = $1 and ln.lot_batch_id is not null`, salesID)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var lotBatchID int64
		var qty float64
		if err := rows.Scan(&lotBatchID, &qty); err != nil {
			return err
		}
		if qty <= 0 {
			continue
		}
		_, err = tx.Exec(ctx, `
			update public.inv_lot_batches
			set qty_on_hand = qty_on_hand + $1, updated_at = now()
			where id = $2 and tenant_id = $3`,
			qty, lotBatchID, tenantID)
		if err != nil {
			return err
		}
	}
	return rows.Err()
}

// reverseSaleStock restores qty for direct-sale stock movements linked to this sales invoice.
func reverseSaleStock(ctx context.Context, tx pgx.Tx, tenantID, salesID int64) error {
	rows, err := tx.Query(ctx, `
		select sm.id, sm.item_id, sm.location_id, sm.qty_delta::float8, sm.ref_id
		from public.inv_stock_movements sm
		join public.sa_sales_lines ln on ln.id = sm.ref_id and sm.ref_type = 'sa_sales_line'
		where sm.tenant_id = $1 and sm.movement_type = 'sales' and ln.sales_id = $2
		  and ln.source_sales_order_line_id is null`, tenantID, salesID)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var movID, itemID, locationID, lineID int64
		var qtyDelta float64
		if err := rows.Scan(&movID, &itemID, &locationID, &qtyDelta, &lineID); err != nil {
			return err
		}
		restoreQty := -qtyDelta
		if restoreQty <= 0 {
			continue
		}
		_, err = tx.Exec(ctx, `
			insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand)
			values ($1, $2, $3, $4)
			on conflict (tenant_id, item_id, location_id)
			do update set qty_on_hand = inv_item_location_balances.qty_on_hand + excluded.qty_on_hand, updated_at = now()`,
			tenantID, itemID, locationID, restoreQty)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `
			insert into public.inv_stock_movements (
			  tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id
			) values ($1, $2, $3, $4, 'sales_reversal', 'sa_sales_line', $5)`,
			tenantID, itemID, locationID, restoreQty, lineID)
		if err != nil {
			return err
		}
	}
	return rows.Err()
}

// reverseSaleSerials moves sold serials back to in_stock for this sales invoice.
func reverseSaleSerials(ctx context.Context, tx pgx.Tx, tenantID, salesID int64) error {
	rows, err := tx.Query(ctx, `
		select su.id, su.location_id
		from public.inv_serial_units su
		join public.inv_serial_unit_sales_lines j on j.serial_unit_id = su.id
		join public.sa_sales_lines ln on ln.id = j.sales_line_id
		where ln.sales_id = $1 and su.tenant_id = $2 and su.status = 'sold'`, salesID, tenantID)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var unitID int64
		var locID *int64
		if err := rows.Scan(&unitID, &locID); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `
			update public.inv_serial_units
			set status = 'in_stock', partner_id = null, sales_line_id = null, updated_at = now()
			where id = $1`, unitID)
		if err != nil {
			return err
		}
		_, _ = tx.Exec(ctx, `delete from public.inv_serial_unit_sales_lines where serial_unit_id = $1`, unitID)
		_, err = tx.Exec(ctx, `
			insert into public.inv_serial_events (
			  tenant_id, serial_unit_id, event_type, to_location_id, ref_type, ref_id
			) values ($1, $2, 'returned', $3, 'sa_sales', $4)`,
			tenantID, unitID, locID, salesID)
		if err != nil {
			return err
		}
	}
	return rows.Err()
}

// reverseSaleStockForLines restores qty for direct-sale stock on selected lines.
func reverseSaleStockForLines(ctx context.Context, tx pgx.Tx, tenantID int64, lineIDs []int64) error {
	if len(lineIDs) == 0 {
		return nil
	}
	rows, err := tx.Query(ctx, `
		select sm.item_id, sm.location_id, sm.qty_delta::float8, sm.ref_id
		from public.inv_stock_movements sm
		join public.sa_sales_lines ln on ln.id = sm.ref_id and sm.ref_type = 'sa_sales_line'
		where sm.tenant_id = $1 and sm.movement_type = 'sales'
		  and ln.id = any($2) and ln.source_sales_order_line_id is null`, tenantID, lineIDs)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var itemID, locationID, lineID int64
		var qtyDelta float64
		if err := rows.Scan(&itemID, &locationID, &qtyDelta, &lineID); err != nil {
			return err
		}
		restoreQty := -qtyDelta
		if restoreQty <= 0 {
			continue
		}
		_, err = tx.Exec(ctx, `
			insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand)
			values ($1, $2, $3, $4)
			on conflict (tenant_id, item_id, location_id)
			do update set qty_on_hand = inv_item_location_balances.qty_on_hand + excluded.qty_on_hand, updated_at = now()`,
			tenantID, itemID, locationID, restoreQty)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `
			insert into public.inv_stock_movements (
			  tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id
			) values ($1, $2, $3, $4, 'sales_reversal', 'sa_sales_line', $5)`,
			tenantID, itemID, locationID, restoreQty, lineID)
		if err != nil {
			return err
		}
	}
	return rows.Err()
}

// reverseSaleLotForLines restores lot batch qty for selected lines.
func reverseSaleLotForLines(ctx context.Context, tx pgx.Tx, tenantID int64, lineIDs []int64) error {
	if len(lineIDs) == 0 {
		return nil
	}
	rows, err := tx.Query(ctx, `
		select ln.lot_batch_id, ln.qty::float8
		from public.sa_sales_lines ln
		where ln.id = any($1) and ln.lot_batch_id is not null`, lineIDs)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var lotBatchID int64
		var qty float64
		if err := rows.Scan(&lotBatchID, &qty); err != nil {
			return err
		}
		if qty <= 0 {
			continue
		}
		_, err = tx.Exec(ctx, `
			update public.inv_lot_batches
			set qty_on_hand = qty_on_hand + $1, updated_at = now()
			where id = $2 and tenant_id = $3`,
			qty, lotBatchID, tenantID)
		if err != nil {
			return err
		}
	}
	return rows.Err()
}

// reverseSaleSerialsForLines moves sold serials back to in_stock for selected lines.
func reverseSaleSerialsForLines(ctx context.Context, tx pgx.Tx, tenantID, salesID int64, lineIDs []int64) error {
	if len(lineIDs) == 0 {
		return nil
	}
	rows, err := tx.Query(ctx, `
		select su.id, su.location_id
		from public.inv_serial_units su
		join public.inv_serial_unit_sales_lines j on j.serial_unit_id = su.id
		where j.sales_line_id = any($1) and su.tenant_id = $2 and su.status = 'sold'`, lineIDs, tenantID)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var unitID int64
		var locID *int64
		if err := rows.Scan(&unitID, &locID); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `
			update public.inv_serial_units
			set status = 'in_stock', partner_id = null, sales_line_id = null, updated_at = now()
			where id = $1`, unitID)
		if err != nil {
			return err
		}
		_, _ = tx.Exec(ctx, `delete from public.inv_serial_unit_sales_lines where serial_unit_id = $1`, unitID)
		_, err = tx.Exec(ctx, `
			insert into public.inv_serial_events (
			  tenant_id, serial_unit_id, event_type, to_location_id, ref_type, ref_id
			) values ($1, $2, 'returned', $3, 'sa_sales', $4)`,
			tenantID, unitID, locID, salesID)
		if err != nil {
			return err
		}
	}
	return rows.Err()
}

// voidWarrantyForSaleLines marks CRM warranty assets void for selected sales lines.
func voidWarrantyForSaleLines(ctx context.Context, tx pgx.Tx, tenantID int64, lineIDs []int64) error {
	if len(lineIDs) == 0 {
		return nil
	}
	_, err := tx.Exec(ctx, `
		update public.crm_warranty_assets
		set status = 'void', updated_at = now()
		where tenant_id = $1 and sales_line_id = any($2) and status <> 'void'`,
		tenantID, lineIDs)
	return err
}
