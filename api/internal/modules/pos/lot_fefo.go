package pos

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/inventory"
)

type fefoLot struct {
	ID         int64
	LotNo      string
	QtyOnHand  float64
	ExpiryDate *time.Time
}

type queryRower interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

// pickFEFOLot picks the earliest-expiry non-expired lot at location with enough qty.
func pickFEFOLot(ctx context.Context, q queryRower, tenantID, itemID, locationID int64, needQty float64) (fefoLot, error) {
	var lot fefoLot
	err := q.QueryRow(ctx, `
		select id, lot_no, qty_on_hand::float8, expiry_date
		from public.inv_lot_batches
		where tenant_id = $1 and item_id = $2 and location_id = $3
		  and qty_on_hand >= $4
		  and (expiry_date is null or expiry_date >= current_date)
		order by expiry_date nulls last, id
		limit 1`,
		tenantID, itemID, locationID, needQty).Scan(&lot.ID, &lot.LotNo, &lot.QtyOnHand, &lot.ExpiryDate)
	if err != nil {
		return fefoLot{}, err
	}
	return lot, nil
}

// listFEFOLots returns top FEFO candidates for the POS lot picker sheet.
func listFEFOLots(ctx context.Context, pool *pgxpool.Pool, tenantID, itemID, locationID int64, needQty float64, limit int) ([]fefoLot, error) {
	if limit <= 0 {
		limit = 4
	}
	rows, err := pool.Query(ctx, `
		select id, lot_no, qty_on_hand::float8, expiry_date
		from public.inv_lot_batches
		where tenant_id = $1 and item_id = $2 and location_id = $3
		  and qty_on_hand > 0
		  and (expiry_date is null or expiry_date >= current_date)
		order by
		  case when qty_on_hand >= $4 then 0 else 1 end,
		  expiry_date nulls last,
		  id
		limit $5`,
		tenantID, itemID, locationID, needQty, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []fefoLot
	for rows.Next() {
		var lot fefoLot
		if err := rows.Scan(&lot.ID, &lot.LotNo, &lot.QtyOnHand, &lot.ExpiryDate); err != nil {
			return nil, err
		}
		out = append(out, lot)
	}
	return out, rows.Err()
}

// resolveCartLineLot assigns body lot or FEFO when the item requires a lot.
// Returns (lotBatchID, lotNo, needsPicker, errorMessage).
func resolveCartLineLot(
	ctx context.Context,
	pool *pgxpool.Pool,
	tenantID, itemID, locationID int64,
	qty float64,
	requestedLotID *int64,
	allowPickerFallback bool,
) (lotID *int64, lotNo string, needsPicker bool, errMsg string) {
	settings, err := inventory.LoadItemTrackingSettings(ctx, pool, tenantID, itemID)
	if err != nil || !settings.TrackLot {
		return requestedLotID, "", false, ""
	}
	required := inventory.IsTrackingPolicyRequired(settings.LotPolicy)

	if requestedLotID != nil && *requestedLotID > 0 {
		var no string
		var onHand float64
		err := pool.QueryRow(ctx, `
			select lot_no, qty_on_hand::float8
			from public.inv_lot_batches
			where id = $1 and tenant_id = $2 and item_id = $3 and location_id = $4
			  and (expiry_date is null or expiry_date >= current_date)`,
			*requestedLotID, tenantID, itemID, locationID).Scan(&no, &onHand)
		if err != nil {
			return nil, "", false, "Selected lot is not available at this register."
		}
		if onHand+0.0001 < qty {
			return nil, "", false, fmt.Sprintf("Lot %s only has %.4f available.", no, onHand)
		}
		id := *requestedLotID
		return &id, no, false, ""
	}

	lot, err := pickFEFOLot(ctx, pool, tenantID, itemID, locationID, qty)
	if err == nil && lot.ID > 0 {
		id := lot.ID
		return &id, lot.LotNo, false, ""
	}

	if !required {
		return nil, "", false, ""
	}
	if allowPickerFallback {
		candidates, _ := listFEFOLots(ctx, pool, tenantID, itemID, locationID, qty, 8)
		eligible := 0
		for _, c := range candidates {
			if c.QtyOnHand+0.0001 >= qty {
				eligible++
			}
		}
		// Rare: FEFO missed but sellable lots exist — let cashier pick.
		if eligible > 0 {
			return nil, "", true, ""
		}
		if len(candidates) > 0 {
			return nil, "", false, "No single lot has enough quantity at this register. Lower the qty or split the sale."
		}
		// No non-expired lots — open empty picker sheet with transfer guidance.
		return nil, "", true, ""
	}
	return nil, "", false, "No lots with enough quantity at this register. Transfer stock or pick another item."
}
