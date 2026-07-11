package sales

import (
	"context"
	"fmt"
	"math"

	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/inventory"
)

type soldSerialUnit struct {
	ID       int64
	SerialNo string
}

func loadSoldSerialUnitsForSalesLine(ctx context.Context, q pgxQuery, tenantID, salesLineID int64) ([]soldSerialUnit, error) {
	rows, err := q.Query(ctx, `
		select su.id, su.serial_no
		from public.inv_serial_units su
		join public.inv_serial_unit_sales_lines j on j.serial_unit_id = su.id
		where j.sales_line_id = $1 and su.tenant_id = $2 and su.status = 'sold'
		order by su.serial_no`, salesLineID, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []soldSerialUnit
	for rows.Next() {
		var u soldSerialUnit
		if err := rows.Scan(&u.ID, &u.SerialNo); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func validateReturnSerialUnits(
	ctx context.Context,
	q pgxQuery,
	tenantID, salesLineID int64,
	itemID *int64,
	returnQty float64,
	serialUnitIDs []int64,
) error {
	if itemID == nil || returnQty <= 0 {
		return nil
	}
	settings, err := inventory.LoadItemTrackingSettings(ctx, q, tenantID, *itemID)
	if err != nil || !settings.TrackSerial {
		if len(serialUnitIDs) > 0 {
			return fmt.Errorf("line is not serial-tracked")
		}
		return nil
	}
	want := int(math.Round(returnQty))
	if err := inventory.ValidateSerialUnitCapture(0, settings.SerialPolicy, len(serialUnitIDs), returnQty); err != nil {
		return err
	}
	if len(serialUnitIDs) == 0 {
		return nil
	}
	if want > 0 && len(serialUnitIDs) != want {
		return fmt.Errorf("return %d serial(s) required, got %d", want, len(serialUnitIDs))
	}
	sold, err := loadSoldSerialUnitsForSalesLine(ctx, q, tenantID, salesLineID)
	if err != nil {
		return err
	}
	soldSet := map[int64]string{}
	for _, u := range sold {
		soldSet[u.ID] = u.SerialNo
	}
	for _, id := range serialUnitIDs {
		if _, ok := soldSet[id]; !ok {
			return fmt.Errorf("serial unit %d is not sold on this invoice line", id)
		}
	}
	return nil
}

// restoreSaleSerialUnitsForReturn moves selected sold serials back to in_stock for a return line.
func restoreSaleSerialUnitsForReturn(
	ctx context.Context,
	tx pgx.Tx,
	tenantID, salesID, returnLineID, salesLineID, locationID int64,
	serialUnitIDs []int64,
) error {
	if len(serialUnitIDs) == 0 {
		return nil
	}
	for _, unitID := range serialUnitIDs {
		var serialNo, status string
		var salesLineOnUnit *int64
		err := tx.QueryRow(ctx, `
			select su.serial_no, su.status, su.sales_line_id
			from public.inv_serial_units su
			join public.inv_serial_unit_sales_lines j on j.serial_unit_id = su.id
			where su.id = $1 and su.tenant_id = $2 and j.sales_line_id = $3
			for update`, unitID, tenantID, salesLineID).Scan(&serialNo, &status, &salesLineOnUnit)
		if err != nil {
			return fmt.Errorf("serial unit %d is not on this sales line", unitID)
		}
		if status != "sold" {
			return fmt.Errorf("serial %s is not sold (status %s)", serialNo, status)
		}
		_, err = tx.Exec(ctx, `
			update public.inv_serial_units
			set status = 'in_stock', partner_id = null, sales_line_id = null,
			    location_id = coalesce($2, location_id), updated_at = now()
			where id = $1`, unitID, nullableLocationID(locationID))
		if err != nil {
			return err
		}
		_, _ = tx.Exec(ctx, `delete from public.inv_serial_unit_sales_lines where serial_unit_id = $1`, unitID)
		if err := inventory.InsertSerialEvent(ctx, tx, tenantID, unitID, "returned", nil, &locationID, "sr_sales_return_line", returnLineID, nil); err != nil {
			return err
		}
	}
	return nil
}

func nullableLocationID(locationID int64) *int64 {
	if locationID <= 0 {
		return nil
	}
	return &locationID
}

type pgxQuery interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}
