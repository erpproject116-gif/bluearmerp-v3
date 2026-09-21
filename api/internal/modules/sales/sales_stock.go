package sales

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/inventory"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/inventorygl"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
)

// validateSaleLotRequirements enforces lot_batch_id per item lot_policy before save.
func validateSaleLotRequirements(ctx context.Context, q pgx.Tx, tenantID int64, lines []saleLineBody) error {
	for _, ln := range lines {
		if ln.ItemID == nil || ln.Qty <= 0 {
			continue
		}
		settings, err := inventory.LoadItemTrackingSettings(ctx, q, tenantID, *ln.ItemID)
		if err != nil || !settings.TrackLot {
			continue
		}
		if err := inventory.ValidateLotBatchCapture(ln.LineNo, settings.LotPolicy, ln.LotBatchID); err != nil {
			return err
		}
	}
	return nil
}

// salePostsQty matches goods receipt: quantity, lot, or serial tracking all move on-hand.
func salePostsQty(trackInventory, trackLot, trackSerial bool) bool {
	return trackInventory || trackLot || trackSerial
}

// saleLineShouldDeduct is false when the item does not post qty, this sale line
// already wrote a sales movement (re-save), or an SO release already issued stock.
func saleLineShouldDeduct(postsQty, hasSalesMovement, hasSORelease bool) bool {
	return postsQty && !hasSalesMovement && !hasSORelease
}

// applySaleStock deducts on-hand for confirming sales. SO-linked lines are skipped
// only when a legacy combined release already inserted an so_release movement.
func applySaleStock(ctx context.Context, tx pgx.Tx, tenantID, salesID, locationID, userID int64) error {
	rows, err := tx.Query(ctx, `
		select ln.id, ln.item_id, ln.qty::float8, ln.unit_id, ln.source_sales_order_line_id
		from public.sa_sales_lines ln
		where ln.sales_id = $1
		order by ln.line_no`, salesID)
	if err != nil {
		return err
	}
	defer rows.Close()

	type pendingLine struct {
		lineID   int64
		itemID   int64
		unitID   *int64
		lineQty  float64
		soLineID *int64
	}
	var pending []pendingLine
	for rows.Next() {
		var lineID int64
		var itemID *int64
		var qty float64
		var unitID *int64
		var soLineID *int64
		if err := rows.Scan(&lineID, &itemID, &qty, &unitID, &soLineID); err != nil {
			return err
		}
		if itemID == nil || qty <= 0 {
			continue
		}
		pending = append(pending, pendingLine{
			lineID: lineID, itemID: *itemID, unitID: unitID, lineQty: qty, soLineID: soLineID,
		})
	}
	if err := rows.Err(); err != nil {
		return err
	}

	var glLines []inventorygl.Line
	for _, p := range pending {
		lineID, itemID := p.lineID, p.itemID
		var trackInventory, trackLot, trackSerial bool
		var unitCost float64
		if err := tx.QueryRow(ctx, `
			select coalesce(track_inventory_qty, false), coalesce(track_lot, false), coalesce(track_serial, false),
			  coalesce(purchase_price, 0)::float8
			from public.inv_items where id = $1`, itemID).Scan(&trackInventory, &trackLot, &trackSerial, &unitCost); err != nil {
			continue
		}
		if !salePostsQty(trackInventory, trackLot, trackSerial) {
			continue
		}
		var hasSalesMovement bool
		if err := tx.QueryRow(ctx, `
			select exists (
			  select 1 from public.inv_stock_movements
			  where tenant_id = $1 and movement_type = 'sales' and ref_type = 'sa_sales_line' and ref_id = $2
			)`, tenantID, lineID).Scan(&hasSalesMovement); err != nil {
			return err
		}
		hasSORelease := false
		if p.soLineID != nil && *p.soLineID > 0 {
			if err := tx.QueryRow(ctx, `
				select exists (
				  select 1
				  from public.inv_stock_movements m
				  join public.so_sales_order_release_lines rl on rl.id = m.ref_id
				  where m.tenant_id = $1
				    and m.movement_type = 'so_release'
				    and m.ref_type = 'so_release_line'
				    and rl.sales_order_line_id = $2
				)`, tenantID, *p.soLineID).Scan(&hasSORelease); err != nil {
				return err
			}
		}
		if !saleLineShouldDeduct(true, hasSalesMovement, hasSORelease) {
			continue
		}
		qty, err := inventory.BaseQtyForLine(ctx, tx, tenantID, itemID, p.unitID, p.lineQty)
		if err != nil {
			return fmt.Errorf("line item %d: %w", lineID, err)
		}

		var qtyOnHand float64
		if err := tx.QueryRow(ctx, `
			select qty_on_hand::float8
			from public.inv_item_location_balances
			where tenant_id = $1 and item_id = $2 and location_id = $3
			for update`, tenantID, itemID, locationID).Scan(&qtyOnHand); err != nil {
			return fmt.Errorf("line item %d: not enough stock at this location. Check Inv Per Branch or receive stock first", lineID)
		}
		if qtyOnHand+0.0001 < qty {
			return fmt.Errorf("line item %d: not enough stock (%.4f on hand). Check Inv Per Branch or receive stock first", lineID, qtyOnHand)
		}

		tag, err := tx.Exec(ctx, `
			update public.inv_item_location_balances
			set qty_on_hand = qty_on_hand - $1, updated_at = now()
			where tenant_id = $2 and item_id = $3 and location_id = $4`,
			qty, tenantID, itemID, locationID)
		if err != nil || tag.RowsAffected() == 0 {
			return fmt.Errorf("line item %d: failed to update stock", lineID)
		}

		_, err = tx.Exec(ctx, `
			insert into public.inv_stock_movements (
			  tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, created_by_user_id
			) values ($1, $2, $3, $4, 'sales', 'sa_sales_line', $5, $6)`,
			tenantID, itemID, locationID, -qty, lineID, userID)
		if err != nil {
			return err
		}
		if trackInventory {
			glLines = append(glLines, inventorygl.Line{
				ItemID:         itemID,
				Qty:            qty,
				UnitCost:       unitCost,
				TrackInventory: true,
			})
		}
	}

	if len(glLines) > 0 {
		var orderDate time.Time
		if err := tx.QueryRow(ctx, `
			select order_date from public.sa_sales where id = $1 and tenant_id = $2`,
			salesID, tenantID).Scan(&orderDate); err != nil {
			return fmt.Errorf("sale not found for inventory GL: %w", err)
		}
		if _, err := inventorygl.PostIssueTx(
			ctx, tx, tenantID, userID, orderDate,
			"sa_sales", salesID, "Sales stock issue", glLines,
		); err != nil {
			return fmt.Errorf("inventory GL issue: %w", err)
		}
	}
	return nil
}

// validateLotBatchForSaleLine ensures the lot batch matches the line's item and the sale's location.
func validateLotBatchForSaleLine(lineNo int, lineItemID *int64, saleLocationID, lotItemID, lotLocationID int64) error {
	if lineItemID == nil || *lineItemID != lotItemID {
		return fmt.Errorf("line %d: lot batch does not belong to the line item", lineNo)
	}
	if saleLocationID > 0 && lotLocationID != saleLocationID {
		return fmt.Errorf("line %d: lot batch is not at the sale location", lineNo)
	}
	return nil
}

// applySaleLot deducts lot batch qty for sales lines with lot_batch_id set.
// When lot_batch_id is unset and item uses fefo/fifo, auto-allocates before deduct.
func applySaleLot(ctx context.Context, tx pgx.Tx, tenantID, salesID int64) error {
	var saleLocationID int64
	if err := tx.QueryRow(ctx, `
		select location_id from public.sa_sales
		where id = $1 and tenant_id = $2`, salesID, tenantID).Scan(&saleLocationID); err != nil {
		return fmt.Errorf("sale not found")
	}

	pol, err := processpolicy.LoadTx(ctx, tx, tenantID)
	if err != nil {
		return err
	}

	rows, err := tx.Query(ctx, `
		select ln.id, ln.line_no, ln.item_id, ln.unit_id, ln.lot_batch_id, ln.qty::float8
		from public.sa_sales_lines ln
		where ln.sales_id = $1
		order by ln.line_no`, salesID)
	if err != nil {
		return err
	}

	type saleLine struct {
		id         int64
		lineNo     int
		itemID     *int64
		unitID     *int64
		lotBatchID *int64
		lineQty    float64
	}
	var lines []saleLine
	for rows.Next() {
		var ln saleLine
		if err := rows.Scan(&ln.id, &ln.lineNo, &ln.itemID, &ln.unitID, &ln.lotBatchID, &ln.lineQty); err != nil {
			rows.Close()
			return err
		}
		if ln.lineQty <= 0 || ln.itemID == nil {
			continue
		}
		lines = append(lines, ln)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	for _, ln := range lines {
		if ln.lotBatchID != nil && *ln.lotBatchID > 0 {
			continue
		}
		settings, err := inventory.LoadItemTrackingSettings(ctx, tx, tenantID, *ln.itemID)
		if err != nil || !settings.TrackLot {
			continue
		}
		method := inventory.ResolveLotAllocationMethod(settings.LotAllocationMethod, pol.InventoryDefaultLotAllocation)
		if method == inventory.LotAllocationManual {
			if inventory.IsTrackingPolicyRequired(settings.LotPolicy) {
				return fmt.Errorf("line %d: lot batch is required for this item", ln.lineNo)
			}
			continue
		}
		baseQty, err := inventory.BaseQtyForLine(ctx, tx, tenantID, *ln.itemID, ln.unitID, ln.lineQty)
		if err != nil {
			return fmt.Errorf("line %d: %w", ln.lineNo, err)
		}
		allocs, err := inventory.AllocateLots(ctx, tx, tenantID, *ln.itemID, saleLocationID, baseQty, method, pol.InventoryBlockExpiredLotSales)
		if err != nil {
			return fmt.Errorf("line %d: %w", ln.lineNo, err)
		}
		if len(allocs) == 0 {
			if inventory.IsTrackingPolicyRequired(settings.LotPolicy) {
				return fmt.Errorf("line %d: lot batch is required for this item", ln.lineNo)
			}
			continue
		}
		for _, a := range allocs {
			if _, err := tx.Exec(ctx, `
				insert into public.sa_sales_line_lot_allocations (sales_line_id, lot_batch_id, qty)
				values ($1, $2, $3)
				on conflict (sales_line_id, lot_batch_id) do update set qty = excluded.qty`,
				ln.id, a.LotBatchID, a.Qty); err != nil {
				return err
			}
		}
		if _, err := tx.Exec(ctx, `
			update public.sa_sales_lines set lot_batch_id = $1 where id = $2`,
			allocs[0].LotBatchID, ln.id); err != nil {
			return err
		}
	}

	type lotDeduction struct {
		lineNo     int
		lineItemID *int64
		lotBatchID int64
		qty        float64
	}
	var deductions []lotDeduction

	allocRows, err := tx.Query(ctx, `
		select ln.line_no, ln.item_id, a.lot_batch_id, a.qty::float8
		from public.sa_sales_line_lot_allocations a
		join public.sa_sales_lines ln on ln.id = a.sales_line_id
		where ln.sales_id = $1`, salesID)
	if err != nil {
		return err
	}
	for allocRows.Next() {
		var d lotDeduction
		if err := allocRows.Scan(&d.lineNo, &d.lineItemID, &d.lotBatchID, &d.qty); err != nil {
			allocRows.Close()
			return err
		}
		deductions = append(deductions, d)
	}
	allocRows.Close()
	if err := allocRows.Err(); err != nil {
		return err
	}

	if len(deductions) == 0 {
		for _, ln := range lines {
			if ln.lotBatchID == nil || *ln.lotBatchID <= 0 {
				continue
			}
			baseQty, err := inventory.BaseQtyForLine(ctx, tx, tenantID, *ln.itemID, ln.unitID, ln.lineQty)
			if err != nil {
				return fmt.Errorf("line %d: %w", ln.lineNo, err)
			}
			deductions = append(deductions, lotDeduction{
				lineNo: ln.lineNo, lineItemID: ln.itemID, lotBatchID: *ln.lotBatchID, qty: baseQty,
			})
		}
	}

	for _, d := range deductions {
		lineNo, lotBatchID, lineItemID := d.lineNo, d.lotBatchID, d.lineItemID
		qty := d.qty
		var lotQty float64
		var lotItemID, lotLocationID int64
		err := tx.QueryRow(ctx, `
			select qty_on_hand::float8, item_id, location_id
			from public.inv_lot_batches
			where id = $1 and tenant_id = $2
			for update`, lotBatchID, tenantID).Scan(&lotQty, &lotItemID, &lotLocationID)
		if err != nil {
			return fmt.Errorf("line %d: lot batch not found", lineNo)
		}
		if err := validateLotBatchForSaleLine(lineNo, lineItemID, saleLocationID, lotItemID, lotLocationID); err != nil {
			return err
		}
		if lotQty+0.0001 < qty {
			return fmt.Errorf("line %d: not enough stock in this lot (%.4f on hand). Check Inv Per Branch or pick another lot", lineNo, lotQty)
		}
		tag, err := tx.Exec(ctx, `
			update public.inv_lot_batches
			set qty_on_hand = qty_on_hand - $1, updated_at = now()
			where id = $2 and tenant_id = $3 and qty_on_hand >= $1 - 0.0001`,
			qty, lotBatchID, tenantID)
		if err != nil || tag.RowsAffected() == 0 {
			return fmt.Errorf("line %d: failed to deduct lot qty", lineNo)
		}
		fromLocationID := lotLocationID
		if err := inventory.InsertLotEvent(ctx, tx, inventory.LotEventInput{
			TenantID:       tenantID,
			LotBatchID:     lotBatchID,
			EventType:      "sold",
			FromLocationID: &fromLocationID,
			Qty:            qty,
			RefType:        "sa_sales",
			RefID:          &salesID,
		}); err != nil {
			return err
		}
	}
	return nil
}

// reverseSaleLot restores lot batch qty for lines on this sales invoice.
func reverseSaleLot(ctx context.Context, tx pgx.Tx, tenantID, salesID int64) error {
	rows, err := tx.Query(ctx, `
		select ln.item_id, ln.unit_id, ln.lot_batch_id, ln.qty::float8
		from public.sa_sales_lines ln
		where ln.sales_id = $1 and ln.lot_batch_id is not null`, salesID)
	if err != nil {
		return err
	}
	restores, err := collectLotRestores(rows)
	if err != nil {
		return err
	}
	return applyLotRestores(ctx, tx, tenantID, &salesID, restores)
}

type lotRestore struct {
	itemID     *int64
	unitID     *int64
	lotBatchID int64
	lineQty    float64
}

func collectLotRestores(rows pgx.Rows) ([]lotRestore, error) {
	defer rows.Close()
	var out []lotRestore
	for rows.Next() {
		var r lotRestore
		if err := rows.Scan(&r.itemID, &r.unitID, &r.lotBatchID, &r.lineQty); err != nil {
			return nil, err
		}
		if r.lineQty <= 0 {
			continue
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func applyLotRestores(ctx context.Context, tx pgx.Tx, tenantID int64, salesID *int64, restores []lotRestore) error {
	for _, r := range restores {
		qty := r.lineQty
		if r.itemID != nil {
			converted, err := inventory.BaseQtyForLine(ctx, tx, tenantID, *r.itemID, r.unitID, r.lineQty)
			if err != nil {
				return err
			}
			qty = converted
		}
		var locationID int64
		if err := tx.QueryRow(ctx, `
			update public.inv_lot_batches
			set qty_on_hand = qty_on_hand + $1, updated_at = now()
			where id = $2 and tenant_id = $3
			returning location_id`,
			qty, r.lotBatchID, tenantID).Scan(&locationID); err != nil {
			return err
		}
		if err := inventory.InsertLotEvent(ctx, tx, inventory.LotEventInput{
			TenantID:     tenantID,
			LotBatchID:   r.lotBatchID,
			EventType:    "returned",
			ToLocationID: &locationID,
			Qty:          qty,
			RefType:      "sa_sales",
			RefID:        salesID,
		}); err != nil {
			return err
		}
	}
	return nil
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
	type movRow struct {
		movID, itemID, locationID, lineID int64
		qtyDelta                          float64
	}
	var movs []movRow
	for rows.Next() {
		var m movRow
		if err := rows.Scan(&m.movID, &m.itemID, &m.locationID, &m.qtyDelta, &m.lineID); err != nil {
			rows.Close()
			return err
		}
		movs = append(movs, m)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	for _, m := range movs {
		restoreQty := -m.qtyDelta
		if restoreQty <= 0 {
			continue
		}
		if _, err = tx.Exec(ctx, `
			insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand)
			values ($1, $2, $3, $4)
			on conflict (tenant_id, item_id, location_id)
			do update set qty_on_hand = inv_item_location_balances.qty_on_hand + excluded.qty_on_hand, updated_at = now()`,
			tenantID, m.itemID, m.locationID, restoreQty); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `
			insert into public.inv_stock_movements (
			  tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id
			) values ($1, $2, $3, $4, 'sales_reversal', 'sa_sales_line', $5)`,
			tenantID, m.itemID, m.locationID, restoreQty, m.lineID); err != nil {
			return err
		}
	}
	return nil
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
	type unitRow struct {
		unitID int64
		locID  *int64
	}
	var units []unitRow
	for rows.Next() {
		var u unitRow
		if err := rows.Scan(&u.unitID, &u.locID); err != nil {
			rows.Close()
			return err
		}
		units = append(units, u)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	for _, u := range units {
		if _, err = tx.Exec(ctx, `
			update public.inv_serial_units
			set status = 'in_stock', partner_id = null, sales_line_id = null, updated_at = now()
			where id = $1`, u.unitID); err != nil {
			return err
		}
		_, _ = tx.Exec(ctx, `delete from public.inv_serial_unit_sales_lines where serial_unit_id = $1`, u.unitID)
		if _, err = tx.Exec(ctx, `
			insert into public.inv_serial_events (
			  tenant_id, serial_unit_id, event_type, to_location_id, ref_type, ref_id
			) values ($1, $2, 'returned', $3, 'sa_sales', $4)`,
			tenantID, u.unitID, u.locID, salesID); err != nil {
			return err
		}
	}
	return nil
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
	type movRow struct {
		itemID, locationID, lineID int64
		qtyDelta                   float64
	}
	var movs []movRow
	for rows.Next() {
		var m movRow
		if err := rows.Scan(&m.itemID, &m.locationID, &m.qtyDelta, &m.lineID); err != nil {
			rows.Close()
			return err
		}
		movs = append(movs, m)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	for _, m := range movs {
		restoreQty := -m.qtyDelta
		if restoreQty <= 0 {
			continue
		}
		if _, err = tx.Exec(ctx, `
			insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand)
			values ($1, $2, $3, $4)
			on conflict (tenant_id, item_id, location_id)
			do update set qty_on_hand = inv_item_location_balances.qty_on_hand + excluded.qty_on_hand, updated_at = now()`,
			tenantID, m.itemID, m.locationID, restoreQty); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `
			insert into public.inv_stock_movements (
			  tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id
			) values ($1, $2, $3, $4, 'sales_reversal', 'sa_sales_line', $5)`,
			tenantID, m.itemID, m.locationID, restoreQty, m.lineID); err != nil {
			return err
		}
	}
	return nil
}

// reverseSaleLotForLines restores lot batch qty for selected lines.
func reverseSaleLotForLines(ctx context.Context, tx pgx.Tx, tenantID int64, lineIDs []int64) error {
	if len(lineIDs) == 0 {
		return nil
	}
	rows, err := tx.Query(ctx, `
		select ln.item_id, ln.unit_id, ln.lot_batch_id, ln.qty::float8
		from public.sa_sales_lines ln
		where ln.id = any($1) and ln.lot_batch_id is not null`, lineIDs)
	if err != nil {
		return err
	}
	restores, err := collectLotRestores(rows)
	if err != nil {
		return err
	}
	return applyLotRestores(ctx, tx, tenantID, nil, restores)
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
	type unitRow struct {
		unitID int64
		locID  *int64
	}
	var units []unitRow
	for rows.Next() {
		var u unitRow
		if err := rows.Scan(&u.unitID, &u.locID); err != nil {
			rows.Close()
			return err
		}
		units = append(units, u)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	for _, u := range units {
		if _, err = tx.Exec(ctx, `
			update public.inv_serial_units
			set status = 'in_stock', partner_id = null, sales_line_id = null, updated_at = now()
			where id = $1`, u.unitID); err != nil {
			return err
		}
		_, _ = tx.Exec(ctx, `delete from public.inv_serial_unit_sales_lines where serial_unit_id = $1`, u.unitID)
		if _, err = tx.Exec(ctx, `
			insert into public.inv_serial_events (
			  tenant_id, serial_unit_id, event_type, to_location_id, ref_type, ref_id
			) values ($1, $2, 'returned', $3, 'sa_sales', $4)`,
			tenantID, u.unitID, u.locID, salesID); err != nil {
			return err
		}
	}
	return nil
}

// applySalesReturnStock restores inventory for a returned sales line quantity.
func applySalesReturnStock(ctx context.Context, tx pgx.Tx, tenantID, salesID, locationID, returnLineID, salesLineID, userID int64, returnQty float64) error {
	if returnQty <= 0 {
		return nil
	}
	var itemID *int64
	var unitID *int64
	var lineQty float64
	err := tx.QueryRow(ctx, `
		select item_id, unit_id, qty::float8
		from public.sa_sales_lines where id = $1 and sales_id = $2`,
		salesLineID, salesID).Scan(&itemID, &unitID, &lineQty)
	if err != nil {
		return fmt.Errorf("sales line not found")
	}
	if itemID == nil || lineQty <= 0 {
		return nil
	}
	var trackInventory, trackLot, trackSerial bool
	if err := tx.QueryRow(ctx, `
		select coalesce(track_inventory_qty, false), coalesce(track_lot, false), coalesce(track_serial, false)
		from public.inv_items where id = $1`, *itemID).Scan(&trackInventory, &trackLot, &trackSerial); err != nil || !salePostsQty(trackInventory, trackLot, trackSerial) {
		return nil
	}

	baseReturnQty, err := inventory.BaseQtyForLine(ctx, tx, tenantID, *itemID, unitID, returnQty)
	if err != nil {
		return err
	}
	// Restore only quantity this sale posted. A release-only issue has no sales movement.
	var movQty float64
	movErr := tx.QueryRow(ctx, `
		select -qty_delta::float8 from public.inv_stock_movements
		where tenant_id = $1 and ref_type = 'sa_sales_line' and ref_id = $2 and movement_type = 'sales'
		limit 1`, tenantID, salesLineID).Scan(&movQty)
	if movErr == nil && movQty > 0 {
		restoreQty := movQty * (returnQty / lineQty)
		_, err = tx.Exec(ctx, `
			insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand)
			values ($1, $2, $3, $4)
			on conflict (tenant_id, item_id, location_id)
			do update set qty_on_hand = inv_item_location_balances.qty_on_hand + excluded.qty_on_hand, updated_at = now()`,
			tenantID, *itemID, locationID, restoreQty)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `
			insert into public.inv_stock_movements (
			  tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, created_by_user_id
			) values ($1, $2, $3, $4, 'sales_return', 'sr_sales_return_line', $5, $6)`,
			tenantID, *itemID, locationID, restoreQty, returnLineID, userID)
		if err != nil {
			return err
		}
	}

	// Lot batch: restore proportional qty when lot tracked on line.
	var lotBatchID *int64
	_ = tx.QueryRow(ctx, `select lot_batch_id from public.sa_sales_lines where id = $1`, salesLineID).Scan(&lotBatchID)
	if lotBatchID != nil {
		lotRestore := lineQty
		if lineQty > 0.0001 {
			lotRestore = baseReturnQty
		}
		_, err = tx.Exec(ctx, `
			update public.inv_lot_batches
			set qty_on_hand = qty_on_hand + $1, updated_at = now()
			where id = $2 and tenant_id = $3`, lotRestore, *lotBatchID, tenantID)
		if err != nil {
			return err
		}
		locID := locationID
		uid := userID
		if err := inventory.InsertLotEvent(ctx, tx, inventory.LotEventInput{
			TenantID:        tenantID,
			LotBatchID:      *lotBatchID,
			EventType:       "returned",
			ToLocationID:    &locID,
			Qty:             lotRestore,
			RefType:         "sa_sales",
			RefID:           &salesID,
			CreatedByUserID: &uid,
		}); err != nil {
			return err
		}
	}
	return nil
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
