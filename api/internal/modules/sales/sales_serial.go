package sales

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/inventory"
)

type SaleSerialLineInput struct {
	LineNo        int
	ItemID        *int64
	Qty           float64
	SerialUnitIDs []int64
}

// ApplySaleSerialUnitsForCheckout is the POS/checkout entry point for serial marking.
func ApplySaleSerialUnitsForCheckout(ctx context.Context, tx pgx.Tx, tenantID, salesID, partnerID int64, lines []SaleSerialLineInput) error {
	bodies := make([]saleLineBody, len(lines))
	for i, ln := range lines {
		bodies[i] = saleLineBody{
			LineNo:        ln.LineNo,
			ItemID:        ln.ItemID,
			Qty:           ln.Qty,
			SerialUnitIDs: ln.SerialUnitIDs,
		}
	}
	if err := validateSaleSerialRequirements(ctx, tx, tenantID, bodies); err != nil {
		return err
	}
	return applySaleSerialUnits(ctx, tx, tenantID, salesID, partnerID, bodies)
}

// validateSaleSerialRequirements enforces serial_unit_ids for track_serial items before save.
func validateSaleSerialRequirements(ctx context.Context, q pgx.Tx, tenantID int64, lines []saleLineBody) error {
	for _, ln := range lines {
		if ln.ItemID == nil || ln.Qty <= 0 {
			continue
		}
		var trackSerial bool
		if err := q.QueryRow(ctx, `
			select track_serial from public.inv_items
			where id = $1 and tenant_id = $2`, *ln.ItemID, tenantID).Scan(&trackSerial); err != nil || !trackSerial {
			if ln.SerialLotNo != nil && strings.TrimSpace(*ln.SerialLotNo) != "" && len(ln.SerialUnitIDs) == 0 {
				return fmt.Errorf("line %d: serial_lot_no requires serial_unit_ids for tracked items", ln.LineNo)
			}
			continue
		}
		if len(ln.SerialUnitIDs) == 0 {
			return fmt.Errorf("line %d: serial numbers are required for this item", ln.LineNo)
		}
		if ln.Qty != float64(int64(ln.Qty)) {
			return fmt.Errorf("line %d: quantity must be a whole number for serial-tracked items", ln.LineNo)
		}
		if len(ln.SerialUnitIDs) != int(ln.Qty) {
			return fmt.Errorf("line %d: serial count must match quantity (%.0f)", ln.LineNo, ln.Qty)
		}
		if ln.SerialLotNo != nil && strings.TrimSpace(*ln.SerialLotNo) != "" && len(ln.SerialUnitIDs) == 0 {
			return fmt.Errorf("line %d: serial_lot_no without serial_unit_ids is not allowed", ln.LineNo)
		}
	}
	return nil
}

// loadReservedSerialUnitIDsForSOLine returns serial units reserved on SO release for a line.
func loadReservedSerialUnitIDsForSOLine(ctx context.Context, db interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, tenantID, soLineID int64) ([]int64, error) {
	rows, err := db.Query(ctx, `
		select su.id
		from public.inv_serial_units su
		join public.so_sales_order_release_lines rl on rl.id = su.sales_order_release_line_id
		where su.tenant_id = $1 and rl.sales_order_line_id = $2
		  and su.status in ('reserved', 'in_stock')
		order by su.id`, tenantID, soLineID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// applySaleSerialUnits marks ledger serials sold and sets serial_lot_no on sales lines.
func applySaleSerialUnits(ctx context.Context, tx pgx.Tx, tenantID, salesID, partnerID int64, lines []saleLineBody) error {
	rows, err := tx.Query(ctx, `
		select ln.id, ln.line_no, ln.item_id, ln.qty::float8
		from public.sa_sales_lines ln
		where ln.sales_id = $1
		order by ln.line_no`, salesID)
	if err != nil {
		return err
	}
	defer rows.Close()

	type dbLine struct {
		id     int64
		lineNo int
		itemID *int64
		qty    float64
	}
	var dbLines []dbLine
	for rows.Next() {
		var ln dbLine
		if err := rows.Scan(&ln.id, &ln.lineNo, &ln.itemID, &ln.qty); err != nil {
			return err
		}
		dbLines = append(dbLines, ln)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	byLineNo := map[int]saleLineBody{}
	for _, ln := range lines {
		if ln.LineNo > 0 {
			byLineNo[ln.LineNo] = ln
		}
	}

	for _, dbLn := range dbLines {
		body, ok := byLineNo[dbLn.lineNo]
		if !ok {
			continue
		}
		if dbLn.itemID == nil {
			if len(body.SerialUnitIDs) > 0 {
				return fmt.Errorf("line %d: item required for serial tracking", dbLn.lineNo)
			}
			continue
		}
		var trackSerial bool
		if err := tx.QueryRow(ctx, `select track_serial from public.inv_items where id = $1`, *dbLn.itemID).Scan(&trackSerial); err != nil || !trackSerial {
			continue
		}
		if len(body.SerialUnitIDs) == 0 {
			return fmt.Errorf("line %d: serial numbers are required for this item", dbLn.lineNo)
		}
		if float64(len(body.SerialUnitIDs)) != dbLn.qty {
			return fmt.Errorf("line %d: serial count must match quantity (%.0f)", dbLn.lineNo, dbLn.qty)
		}
		serials := make([]string, 0, len(body.SerialUnitIDs))
		for _, unitID := range body.SerialUnitIDs {
			var serialNo string
			var status string
			err := tx.QueryRow(ctx, `
				select serial_no, status from public.inv_serial_units
				where id = $1 and tenant_id = $2 and item_id = $3
				for update`, unitID, tenantID, *dbLn.itemID).Scan(&serialNo, &status)
			if err != nil {
				return fmt.Errorf("line %d: invalid serial unit %d", dbLn.lineNo, unitID)
			}
			if status != "in_stock" && status != "reserved" {
				return fmt.Errorf("line %d: serial %s is not available", dbLn.lineNo, serialNo)
			}
			_, err = tx.Exec(ctx, `
				update public.inv_serial_units
				set status = 'sold', partner_id = $1, sales_line_id = $2, updated_at = now()
				where id = $3`, partnerID, dbLn.id, unitID)
			if err != nil {
				return err
			}
			_, err = tx.Exec(ctx, `
				insert into public.inv_serial_unit_sales_lines (sales_line_id, serial_unit_id)
				values ($1, $2) on conflict do nothing`, dbLn.id, unitID)
			if err != nil {
				return err
			}
			var locID *int64
			_ = tx.QueryRow(ctx, `select location_id from public.inv_serial_units where id = $1`, unitID).Scan(&locID)
			if err := inventory.InsertSerialEvent(ctx, tx, tenantID, unitID, "sold", locID, nil, "sa_sales_line", dbLn.id, nil); err != nil {
				return err
			}
			serials = append(serials, serialNo)
		}
		serialText := strings.Join(serials, ", ")
		_, err := tx.Exec(ctx, `update public.sa_sales_lines set serial_lot_no = $1 where id = $2`, serialText, dbLn.id)
		if err != nil {
			return err
		}
	}
	return nil
}
