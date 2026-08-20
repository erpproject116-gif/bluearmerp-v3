package inventory

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type stockAdjustmentLineBody struct {
	ItemID     int64   `json:"item_id"`
	LocationID int64   `json:"location_id"`
	QtyDelta   float64 `json:"qty_delta"`
}

type stockAdjustmentLineRow struct {
	ID           int64    `json:"id"`
	LineNo       int      `json:"line_no"`
	ItemID       int64    `json:"item_id"`
	ItemCode     string   `json:"item_code"`
	ItemName     string   `json:"item_name"`
	LocationID   int64    `json:"location_id"`
	LocationName string   `json:"location_name"`
	QtyBefore    *float64 `json:"qty_before,omitempty"`
	QtyDelta     float64  `json:"qty_delta"`
	QtyAfter     *float64 `json:"qty_after,omitempty"`
}

type stockAdjustmentCreateBody struct {
	ItemID     int64                     `json:"item_id"`
	LocationID int64                     `json:"location_id"`
	QtyDelta   float64                   `json:"qty_delta"`
	Reason     string                    `json:"reason"`
	Lines      []stockAdjustmentLineBody `json:"lines"`
}

func normalizedStockAdjLines(body stockAdjustmentCreateBody) []stockAdjustmentLineBody {
	if len(body.Lines) > 0 {
		return body.Lines
	}
	if body.ItemID > 0 && body.LocationID > 0 && body.QtyDelta != 0 {
		return []stockAdjustmentLineBody{{
			ItemID: body.ItemID, LocationID: body.LocationID, QtyDelta: body.QtyDelta,
		}}
	}
	return nil
}

func validateStockAdjustmentCreate(body stockAdjustmentCreateBody) map[string]string {
	lines := normalizedStockAdjLines(body)
	errs := map[string]string{}
	if strings.TrimSpace(body.Reason) == "" {
		errs["reason"] = "Reason is required."
	}
	if len(lines) == 0 {
		errs["lines"] = "At least one line with item, location, and non-zero qty is required."
		return errs
	}
	if len(lines) > 100 {
		errs["lines"] = "At most 100 lines per request."
		return errs
	}
	for i, ln := range lines {
		prefix := fmt.Sprintf("lines[%d].", i)
		if ln.ItemID <= 0 {
			errs[prefix+"item_id"] = "Item is required."
		}
		if ln.LocationID <= 0 {
			errs[prefix+"location_id"] = "Location is required."
		}
		if ln.QtyDelta == 0 {
			errs[prefix+"qty_delta"] = "Quantity change cannot be zero."
		}
	}
	return errs
}

func ensureStockAdjLines(ctx context.Context, pool *pgxpool.Pool, tenantID int64, lines []stockAdjustmentLineBody) map[string]string {
	for i, ln := range lines {
		if errs := ensureItemLocation(ctx, pool, tenantID, ln.ItemID, ln.LocationID); errs != nil {
			for k, v := range errs {
				return map[string]string{fmt.Sprintf("lines[%d].%s", i, k): v}
			}
		}
	}
	return nil
}

func insertStockAdjustmentLines(ctx context.Context, tx pgx.Tx, requestID int64, tenantID int64, lines []stockAdjustmentLineBody) error {
	for i, ln := range lines {
		qtyBefore, qtyAfter := proposedQtySnapshot(ctx, tx, tenantID, ln.ItemID, ln.LocationID, ln.QtyDelta)
		_, err := tx.Exec(ctx, `
			insert into public.inv_stock_adjustment_request_lines
			  (request_id, line_no, item_id, location_id, qty_delta, qty_before, qty_after)
			values ($1, $2, $3, $4, $5, $6, $7)`,
			requestID, i+1, ln.ItemID, ln.LocationID, ln.QtyDelta, qtyBefore, qtyAfter)
		if err != nil {
			return err
		}
	}
	return nil
}

func loadStockAdjustmentLines(ctx context.Context, q interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, requestID int64) ([]stockAdjustmentLineRow, error) {
	rows, err := q.Query(ctx, `
		select l.id, l.line_no, l.item_id, i.item_code, i.item_name,
		  l.location_id, loc.location_name,
		  l.qty_before::float8, l.qty_delta::float8, l.qty_after::float8
		from public.inv_stock_adjustment_request_lines l
		join public.inv_items i on i.id = l.item_id
		join public.inv_locations loc on loc.id = l.location_id
		where l.request_id = $1
		order by l.line_no`, requestID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []stockAdjustmentLineRow
	for rows.Next() {
		var row stockAdjustmentLineRow
		var qtyBefore, qtyAfter *float64
		if err := rows.Scan(&row.ID, &row.LineNo, &row.ItemID, &row.ItemCode, &row.ItemName,
			&row.LocationID, &row.LocationName, &qtyBefore, &row.QtyDelta, &qtyAfter); err != nil {
			return nil, err
		}
		row.QtyBefore = qtyBefore
		row.QtyAfter = qtyAfter
		out = append(out, row)
	}
	if out == nil {
		out = []stockAdjustmentLineRow{}
	}
	return out, nil
}

func replaceStockAdjustmentLines(ctx context.Context, tx pgx.Tx, requestID, tenantID int64, lines []stockAdjustmentLineBody) error {
	if _, err := tx.Exec(ctx, `delete from public.inv_stock_adjustment_request_lines where request_id = $1`, requestID); err != nil {
		return err
	}
	return insertStockAdjustmentLines(ctx, tx, requestID, tenantID, lines)
}

func postStockAdjustmentLines(ctx context.Context, tx pgx.Tx, tenantID, userID int64, reason string, lines []stockAdjustmentLineRow) (map[string]string, error) {
	for _, ln := range lines {
		_, _, _, validation, err := postStockAdjustment(ctx, tx, tenantID, userID, ln.ItemID, ln.LocationID, ln.QtyDelta, reason)
		if validation != nil {
			return validation, nil
		}
		if err != nil {
			return nil, err
		}
	}
	return nil, nil
}

func stockAdjLinesForRequest(ctx context.Context, q interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, tenantID, requestID int64, headerItemID, headerLocationID int64, headerQty float64) ([]stockAdjustmentLineRow, error) {
	lines, err := loadStockAdjustmentLines(ctx, q, requestID)
	if err != nil {
		return nil, err
	}
	if len(lines) > 0 {
		return lines, nil
	}
	if headerItemID <= 0 || headerLocationID <= 0 || headerQty == 0 {
		return []stockAdjustmentLineRow{}, nil
	}
	var row stockAdjustmentLineRow
	err = q.QueryRow(ctx, `
		select 0, 1, i.id, i.item_code, i.item_name, l.id, l.location_name
		from public.inv_items i, public.inv_locations l
		where i.id = $1 and l.id = $2 and i.tenant_id = $3 and l.tenant_id = $3`,
		headerItemID, headerLocationID, tenantID).Scan(
		&row.ID, &row.LineNo, &row.ItemID, &row.ItemCode, &row.ItemName, &row.LocationID, &row.LocationName)
	if err != nil {
		return nil, err
	}
	row.QtyDelta = headerQty
	return []stockAdjustmentLineRow{row}, nil
}

func syncStockAdjHeader(ctx context.Context, tx pgx.Tx, requestID int64, lines []stockAdjustmentLineBody) error {
	if len(lines) == 0 {
		return nil
	}
	first := lines[0]
	var total float64
	for _, ln := range lines {
		total += ln.QtyDelta
	}
	_, err := tx.Exec(ctx, `
		update public.inv_stock_adjustment_requests
		set item_id = $2, location_id = $3, qty_delta = $4, updated_at = now()
		where id = $1`,
		requestID, first.ItemID, first.LocationID, total)
	return err
}

func refreshStockAdjLineSnapshots(ctx context.Context, tx pgx.Tx, tenantID, requestID int64) error {
	rows, err := tx.Query(ctx, `
		select id, item_id, location_id, qty_delta::float8
		from public.inv_stock_adjustment_request_lines
		where request_id = $1
		order by line_no`, requestID)
	if err != nil {
		return err
	}
	defer rows.Close()
	type snap struct {
		id, itemID, locID int64
		qtyDelta          float64
	}
	var snaps []snap
	for rows.Next() {
		var s snap
		if err := rows.Scan(&s.id, &s.itemID, &s.locID, &s.qtyDelta); err != nil {
			return err
		}
		snaps = append(snaps, s)
	}
	if len(snaps) == 0 {
		return nil
	}
	var firstBefore, firstAfter float64
	for i, s := range snaps {
		before, after := proposedQtySnapshot(ctx, tx, tenantID, s.itemID, s.locID, s.qtyDelta)
		if i == 0 {
			firstBefore, firstAfter = before, after
		}
		if _, err := tx.Exec(ctx, `
			update public.inv_stock_adjustment_request_lines
			set qty_before = $2, qty_after = $3
			where id = $1`, s.id, before, after); err != nil {
			return err
		}
	}
	_, err = tx.Exec(ctx, `
		update public.inv_stock_adjustment_requests
		set qty_before = $2, qty_after = $3, updated_at = now()
		where id = $1`, requestID, firstBefore, firstAfter)
	return err
}
