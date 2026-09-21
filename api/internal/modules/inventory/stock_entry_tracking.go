package inventory

import (
	"context"
	"fmt"
	"math"

	"github.com/jackc/pgx/v5"
)

type stockEntryLotIn struct {
	LotBatchID int64   `json:"lot_batch_id"`
	Qty        float64 `json:"qty"`
}

func normalizeStockEntryLots(lineQty float64, lotBatchID *int64, lots []stockEntryLotIn) []stockEntryLotIn {
	if len(lots) > 0 {
		out := make([]stockEntryLotIn, 0, len(lots))
		for _, l := range lots {
			if l.LotBatchID <= 0 || l.Qty <= 0 {
				continue
			}
			out = append(out, l)
		}
		return out
	}
	if lotBatchID != nil && *lotBatchID > 0 && lineQty > 0 {
		return []stockEntryLotIn{{LotBatchID: *lotBatchID, Qty: lineQty}}
	}
	return nil
}

func sumStockEntryLotQty(lots []stockEntryLotIn) float64 {
	var sum float64
	for _, l := range lots {
		sum += l.Qty
	}
	return sum
}

func serialLotAttachmentCount(serialCount, lotRowCount int) int {
	return serialCount + lotRowCount
}

func validateTransferLineTracking(lineNo int, settings ItemTrackingSettings, qty float64, serialCount int, lots []stockEntryLotIn, enforceRequired bool) error {
	if settings.TrackSerial {
		if serialCount == 0 {
			if enforceRequired && IsTrackingPolicyRequired(settings.SerialPolicy) {
				return fmt.Errorf("line %d: serial numbers are required for this item", lineNo)
			}
			return nil
		}
		if err := ValidateSerialUnitCapture(lineNo, TrackingPolicyOptional, serialCount, qty); err != nil {
			return err
		}
		if len(lots) > 0 {
			return fmt.Errorf("line %d: cannot attach both serials and lots", lineNo)
		}
		return nil
	}
	if settings.TrackLot {
		lotSum := sumStockEntryLotQty(lots)
		if len(lots) == 0 {
			if enforceRequired && IsTrackingPolicyRequired(settings.LotPolicy) {
				return fmt.Errorf("line %d: lot batch is required for this item", lineNo)
			}
			return nil
		}
		if math.Abs(lotSum-qty) > 0.0001 {
			return fmt.Errorf("line %d: lot quantities must equal line qty (%.4f)", lineNo, qty)
		}
		return nil
	}
	if serialCount > 0 || len(lots) > 0 {
		return fmt.Errorf("line %d: item is not serial- or lot-tracked", lineNo)
	}
	return nil
}

func replaceStockEntryLineTracking(
	ctx context.Context,
	tx pgx.Tx,
	tenantID, lineID int64,
	lineNo int,
	itemID int64,
	qty float64,
	fromLocationID *int64,
	serialIDs []int64,
	lots []stockEntryLotIn,
) error {
	settings, err := LoadItemTrackingSettings(ctx, tx, tenantID, itemID)
	if err != nil {
		return fmt.Errorf("item %d not found", itemID)
	}
	lots = normalizeStockEntryLots(qty, nil, lots)
	if err := validateTransferLineTracking(lineNo, settings, qty, len(serialIDs), lots, false); err != nil {
		return err
	}

	seenSerial := map[int64]struct{}{}
	for _, unitID := range serialIDs {
		if unitID <= 0 {
			continue
		}
		if _, dup := seenSerial[unitID]; dup {
			return fmt.Errorf("line %d: duplicate serial unit", lineNo)
		}
		seenSerial[unitID] = struct{}{}

		var unitItemID int64
		var locID *int64
		var status string
		err := tx.QueryRow(ctx, `
			select item_id, location_id, status
			from public.inv_serial_units
			where id = $1 and tenant_id = $2
			for update`, unitID, tenantID).Scan(&unitItemID, &locID, &status)
		if err != nil {
			return fmt.Errorf("line %d: serial unit %d not found", lineNo, unitID)
		}
		if unitItemID != itemID {
			return fmt.Errorf("line %d: serial unit %d belongs to a different item", lineNo, unitID)
		}
		if status != "in_stock" && status != "reserved" {
			return fmt.Errorf("line %d: serial unit %d is not available (%s)", lineNo, unitID, status)
		}
		if fromLocationID != nil && *fromLocationID > 0 {
			if locID == nil || *locID != *fromLocationID {
				return fmt.Errorf("line %d: serial unit %d is not at the source location", lineNo, unitID)
			}
		}
		var taken bool
		_ = tx.QueryRow(ctx, `
			select exists(
			  select 1 from public.inv_stock_entry_line_serials s
			  join public.inv_stock_entry_lines ln on ln.id = s.stock_entry_line_id
			  join public.inv_stock_entries e on e.id = ln.stock_entry_id
			  where s.serial_unit_id = $1 and e.status = 'draft' and ln.id <> $2
			)`, unitID, lineID).Scan(&taken)
		if taken {
			return fmt.Errorf("line %d: serial unit %d is already on another draft transfer", lineNo, unitID)
		}
		if _, err := tx.Exec(ctx, `
			insert into public.inv_stock_entry_line_serials (stock_entry_line_id, serial_unit_id)
			values ($1, $2)`, lineID, unitID); err != nil {
			return err
		}
	}

	seenLot := map[int64]struct{}{}
	for _, lot := range lots {
		if _, dup := seenLot[lot.LotBatchID]; dup {
			return fmt.Errorf("line %d: duplicate lot batch", lineNo)
		}
		seenLot[lot.LotBatchID] = struct{}{}

		var lotItemID, lotLocID int64
		var onHand float64
		err := tx.QueryRow(ctx, `
			select item_id, location_id, qty_on_hand::float8
			from public.inv_lot_batches
			where id = $1 and tenant_id = $2
			for update`, lot.LotBatchID, tenantID).Scan(&lotItemID, &lotLocID, &onHand)
		if err != nil {
			return fmt.Errorf("line %d: lot batch %d not found", lineNo, lot.LotBatchID)
		}
		if lotItemID != itemID {
			return fmt.Errorf("line %d: lot batch %d belongs to a different item", lineNo, lot.LotBatchID)
		}
		if fromLocationID != nil && *fromLocationID > 0 && lotLocID != *fromLocationID {
			return fmt.Errorf("line %d: lot batch %d is not at the source location", lineNo, lot.LotBatchID)
		}
		if onHand+0.0001 < lot.Qty {
			return fmt.Errorf("line %d: not enough qty in lot batch %d (%.4f on hand)", lineNo, lot.LotBatchID, onHand)
		}
		if _, err := tx.Exec(ctx, `
			insert into public.inv_stock_entry_line_lots (stock_entry_line_id, lot_batch_id, qty)
			values ($1, $2, $3)`, lineID, lot.LotBatchID, lot.Qty); err != nil {
			return err
		}
	}
	return nil
}

func loadStockEntryLineTracking(ctx context.Context, q interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, lineID int64) (serialIDs []int64, lots []stockEntryLotIn, lotNo string, count int, err error) {
	srows, err := q.Query(ctx, `
		select serial_unit_id from public.inv_stock_entry_line_serials
		where stock_entry_line_id = $1 order by serial_unit_id`, lineID)
	if err != nil {
		return nil, nil, "", 0, err
	}
	for srows.Next() {
		var id int64
		if err := srows.Scan(&id); err != nil {
			srows.Close()
			return nil, nil, "", 0, err
		}
		serialIDs = append(serialIDs, id)
	}
	srows.Close()
	if err := srows.Err(); err != nil {
		return nil, nil, "", 0, err
	}

	lrows, err := q.Query(ctx, `
		select l.lot_batch_id, l.qty::float8, coalesce(lb.lot_no, '')
		from public.inv_stock_entry_line_lots l
		join public.inv_lot_batches lb on lb.id = l.lot_batch_id
		where l.stock_entry_line_id = $1
		order by l.lot_batch_id`, lineID)
	if err != nil {
		return nil, nil, "", 0, err
	}
	for lrows.Next() {
		var lot stockEntryLotIn
		var no string
		if err := lrows.Scan(&lot.LotBatchID, &lot.Qty, &no); err != nil {
			lrows.Close()
			return nil, nil, "", 0, err
		}
		lots = append(lots, lot)
		if lotNo == "" {
			lotNo = no
		}
	}
	lrows.Close()
	if err := lrows.Err(); err != nil {
		return nil, nil, "", 0, err
	}
	count = serialLotAttachmentCount(len(serialIDs), len(lots))
	return serialIDs, lots, lotNo, count, nil
}

func stockEntryLineTrackingCountSQL(lineAlias string) string {
	return fmt.Sprintf(`(
	  coalesce((select count(*)::int from public.inv_stock_entry_line_serials s where s.stock_entry_line_id = %s.id), 0)
	  + coalesce((select count(*)::int from public.inv_stock_entry_line_lots l where l.stock_entry_line_id = %s.id), 0)
	)`, lineAlias, lineAlias)
}

// moveStockEntryTracking relocates attached serials/lots on transfer post.
// Qty balances are already handled by ApplyStockDelta — do not adjust them here.
func moveStockEntryTracking(
	ctx context.Context,
	tx pgx.Tx,
	tenantID, entryID, userID int64,
	fromLoc, toLoc int64,
) error {
	lines, err := tx.Query(ctx, `
		select id, item_id, qty::float8
		from public.inv_stock_entry_lines
		where stock_entry_id = $1
		order by line_no`, entryID)
	if err != nil {
		return err
	}
	defer lines.Close()

	type lineRow struct {
		id     int64
		itemID int64
		qty    float64
	}
	var lineRows []lineRow
	for lines.Next() {
		var ln lineRow
		if err := lines.Scan(&ln.id, &ln.itemID, &ln.qty); err != nil {
			return err
		}
		lineRows = append(lineRows, ln)
	}
	if err := lines.Err(); err != nil {
		return err
	}

	for i, ln := range lineRows {
		settings, err := LoadItemTrackingSettings(ctx, tx, tenantID, ln.itemID)
		if err != nil {
			return err
		}
		serialIDs, lots, _, _, err := loadStockEntryLineTracking(ctx, tx, ln.id)
		if err != nil {
			return err
		}
		if err := validateTransferLineTracking(i+1, settings, ln.qty, len(serialIDs), lots, true); err != nil {
			return err
		}

		for _, unitID := range serialIDs {
			var curLoc *int64
			var status string
			err := tx.QueryRow(ctx, `
				select location_id, status
				from public.inv_serial_units
				where id = $1 and tenant_id = $2 and item_id = $3
				for update`, unitID, tenantID, ln.itemID).Scan(&curLoc, &status)
			if err != nil {
				return fmt.Errorf("serial unit %d not found", unitID)
			}
			if status != "in_stock" && status != "reserved" {
				return fmt.Errorf("serial unit %d is not available (%s)", unitID, status)
			}
			if curLoc == nil || *curLoc != fromLoc {
				return fmt.Errorf("serial unit %d is not at the source location", unitID)
			}
			if _, err := tx.Exec(ctx, `
				update public.inv_serial_units
				set location_id = $1, updated_at = now()
				where id = $2`, toLoc, unitID); err != nil {
				return err
			}
			from := fromLoc
			to := toLoc
			uid := userID
			if err := InsertSerialEvent(ctx, tx, tenantID, unitID, "transferred", &from, &to, "stock_entry", entryID, &uid); err != nil {
				return err
			}
		}

		for _, lot := range lots {
			var lotNo string
			var lotItemID, lotLocID int64
			var onHand float64
			var expiryDate any
			err := tx.QueryRow(ctx, `
				select lot_no, item_id, location_id, qty_on_hand::float8, expiry_date
				from public.inv_lot_batches
				where id = $1 and tenant_id = $2
				for update`, lot.LotBatchID, tenantID).Scan(&lotNo, &lotItemID, &lotLocID, &onHand, &expiryDate)
			if err != nil {
				return fmt.Errorf("lot batch %d not found", lot.LotBatchID)
			}
			if lotItemID != ln.itemID {
				return fmt.Errorf("lot batch %d belongs to a different item", lot.LotBatchID)
			}
			if lotLocID != fromLoc {
				return fmt.Errorf("lot batch %d is not at the source location", lot.LotBatchID)
			}
			if onHand+0.0001 < lot.Qty {
				return fmt.Errorf("not enough qty in lot %s (%.4f on hand)", lotNo, onHand)
			}
			tag, err := tx.Exec(ctx, `
				update public.inv_lot_batches
				set qty_on_hand = qty_on_hand - $1, updated_at = now()
				where id = $2 and tenant_id = $3 and qty_on_hand >= $1 - 0.0001`,
				lot.Qty, lot.LotBatchID, tenantID)
			if err != nil || tag.RowsAffected() == 0 {
				return fmt.Errorf("failed to deduct lot %s", lotNo)
			}

			var destID int64
			err = tx.QueryRow(ctx, `
				insert into public.inv_lot_batches (tenant_id, item_id, lot_no, location_id, qty_on_hand, expiry_date)
				values ($1, $2, $3, $4, $5, $6)
				on conflict (tenant_id, item_id, lot_no, location_id)
				do update set qty_on_hand = inv_lot_batches.qty_on_hand + excluded.qty_on_hand, updated_at = now()
				returning id`,
				tenantID, ln.itemID, lotNo, toLoc, lot.Qty, expiryDate).Scan(&destID)
			if err != nil {
				return fmt.Errorf("failed to receive lot %s at destination: %w", lotNo, err)
			}

			from := fromLoc
			to := toLoc
			refID := entryID
			uid := userID
			if err := InsertLotEvent(ctx, tx, LotEventInput{
				TenantID:        tenantID,
				LotBatchID:      lot.LotBatchID,
				EventType:       "transferred",
				FromLocationID:  &from,
				ToLocationID:    &to,
				Qty:             lot.Qty,
				RefType:         "stock_entry",
				RefID:           &refID,
				CreatedByUserID: &uid,
			}); err != nil {
				return err
			}
			if err := InsertLotEvent(ctx, tx, LotEventInput{
				TenantID:        tenantID,
				LotBatchID:      destID,
				EventType:       "transferred",
				FromLocationID:  &from,
				ToLocationID:    &to,
				Qty:             lot.Qty,
				RefType:         "stock_entry",
				RefID:           &refID,
				CreatedByUserID: &uid,
			}); err != nil {
				return err
			}
		}
	}
	return nil
}
