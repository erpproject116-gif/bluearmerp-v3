package inventory

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// applyRepairRMAReceive moves a sold serial into an RMA warehouse (status=rma, not sellable).
func applyRepairRMAReceive(ctx context.Context, tx pgx.Tx, tenantID, repairOrderID, locationID int64, salesID, salesLineID, serialUnitID *int64) error {
	if serialUnitID == nil || *serialUnitID <= 0 {
		return nil
	}
	var isRMA bool
	if err := tx.QueryRow(ctx, `
		select coalesce(is_rma, false) from public.inv_locations
		where id = $1 and tenant_id = $2 and deleted_at is null`, locationID, tenantID).Scan(&isRMA); err != nil {
		return fmt.Errorf("invalid RMA location")
	}
	if !isRMA {
		return fmt.Errorf("location must be marked as RMA warehouse to receive defective units")
	}

	var status string
	var itemID int64
	var curLoc *int64
	err := tx.QueryRow(ctx, `
		select status, item_id, location_id from public.inv_serial_units
		where id = $1 and tenant_id = $2 for update`, *serialUnitID, tenantID).Scan(&status, &itemID, &curLoc)
	if err != nil {
		return fmt.Errorf("serial unit not found")
	}
	if status != "sold" && status != "rma" {
		return fmt.Errorf("serial must be sold (or already RMA) to receive into RMA (status=%s)", status)
	}

	if salesLineID != nil && *salesLineID > 0 {
		var n int
		_ = tx.QueryRow(ctx, `
			select count(*) from public.inv_serial_unit_sales_lines
			where serial_unit_id = $1 and sales_line_id = $2`, *serialUnitID, *salesLineID).Scan(&n)
		if n == 0 {
			// soft check — allow if sales_line_id on unit matches
			var unitLine *int64
			_ = tx.QueryRow(ctx, `select sales_line_id from public.inv_serial_units where id = $1`, *serialUnitID).Scan(&unitLine)
			if unitLine == nil || *unitLine != *salesLineID {
				return fmt.Errorf("serial is not linked to the selected sales invoice line")
			}
		}
	}

	_, err = tx.Exec(ctx, `
		update public.inv_serial_units
		set status = 'rma', location_id = $2, partner_id = null, sales_line_id = null, updated_at = now()
		where id = $1`, *serialUnitID, locationID)
	if err != nil {
		return err
	}
	_, _ = tx.Exec(ctx, `delete from public.inv_serial_unit_sales_lines where serial_unit_id = $1`, *serialUnitID)

	_, err = tx.Exec(ctx, `
		insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand)
		values ($1, $2, $3, 1)
		on conflict (tenant_id, item_id, location_id)
		do update set qty_on_hand = inv_item_location_balances.qty_on_hand + 1, updated_at = now()`,
		tenantID, itemID, locationID)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		insert into public.inv_serial_events (
		  tenant_id, serial_unit_id, event_type, from_location_id, to_location_id, ref_type, ref_id
		) values ($1, $2, 'rma_receive', $3, $4, 'inv_repair_order', $5)`,
		tenantID, *serialUnitID, curLoc, locationID, repairOrderID)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		update public.inv_repair_orders
		set sales_id = coalesce($2, sales_id),
		    sales_line_id = coalesce($3, sales_line_id),
		    serial_unit_id = $4,
		    rma_received_at = coalesce(rma_received_at, now()),
		    updated_at = now()
		where id = $1 and tenant_id = $5`,
		repairOrderID, salesID, salesLineID, *serialUnitID, tenantID)
	return err
}

// applyRepairRMARelease moves serial from RMA warehouse back to sellable active inventory.
func applyRepairRMARelease(ctx context.Context, tx pgx.Tx, tenantID, repairOrderID, releaseLocationID int64, serialUnitID *int64) error {
	if serialUnitID == nil || *serialUnitID <= 0 {
		return nil
	}
	if releaseLocationID <= 0 {
		return fmt.Errorf("release location is required to return unit to active inventory")
	}
	var isRMA bool
	if err := tx.QueryRow(ctx, `
		select coalesce(is_rma, false) from public.inv_locations
		where id = $1 and tenant_id = $2 and deleted_at is null`, releaseLocationID, tenantID).Scan(&isRMA); err != nil {
		return fmt.Errorf("invalid release location")
	}
	if isRMA {
		return fmt.Errorf("release location must be an active (non-RMA) warehouse")
	}

	var status string
	var itemID int64
	var fromLoc *int64
	err := tx.QueryRow(ctx, `
		select status, item_id, location_id from public.inv_serial_units
		where id = $1 and tenant_id = $2 for update`, *serialUnitID, tenantID).Scan(&status, &itemID, &fromLoc)
	if err != nil {
		return fmt.Errorf("serial unit not found")
	}
	if status != "rma" && status != "in_stock" {
		return fmt.Errorf("serial must be in RMA status to release (status=%s)", status)
	}

	if fromLoc != nil && *fromLoc > 0 {
		_, _ = tx.Exec(ctx, `
			update public.inv_item_location_balances
			set qty_on_hand = greatest(qty_on_hand - 1, 0), updated_at = now()
			where tenant_id = $1 and item_id = $2 and location_id = $3`,
			tenantID, itemID, *fromLoc)
	}

	_, err = tx.Exec(ctx, `
		update public.inv_serial_units
		set status = 'in_stock', location_id = $2, updated_at = now()
		where id = $1`, *serialUnitID, releaseLocationID)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand)
		values ($1, $2, $3, 1)
		on conflict (tenant_id, item_id, location_id)
		do update set qty_on_hand = inv_item_location_balances.qty_on_hand + 1, updated_at = now()`,
		tenantID, itemID, releaseLocationID)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		insert into public.inv_serial_events (
		  tenant_id, serial_unit_id, event_type, from_location_id, to_location_id, ref_type, ref_id
		) values ($1, $2, 'rma_release', $3, $4, 'inv_repair_order', $5)`,
		tenantID, *serialUnitID, fromLoc, releaseLocationID, repairOrderID)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		update public.inv_repair_orders
		set release_location_id = $2,
		    progress_status = 'released',
		    released_to_stock_at = coalesce(released_to_stock_at, now()),
		    updated_at = now()
		where id = $1 and tenant_id = $3`,
		repairOrderID, releaseLocationID, tenantID)
	return err
}
