package inventory

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// LotAllocation is one slice of qty taken from a lot batch.
type LotAllocation struct {
	LotBatchID int64   `json:"lot_batch_id"`
	LotNo      string  `json:"lot_no,omitempty"`
	ExpiryDate *string `json:"expiry_date,omitempty"`
	Qty        float64 `json:"qty"`
}

type lotCandidate struct {
	id         int64
	lotNo      string
	expiryDate *time.Time
	qtyOnHand  float64
	createdAt  time.Time
}

// ResolveLotAllocationMethod returns item method or tenant default when item is manual/unset.
func ResolveLotAllocationMethod(itemMethod, tenantDefault string) string {
	return effectiveLotAllocation(itemMethod, tenantDefault)
}

// AllocateLots selects lot batches for qtyNeeded using method (manual returns empty).
func AllocateLots(
	ctx context.Context,
	tx pgx.Tx,
	tenantID, itemID, locationID int64,
	qtyNeeded float64,
	method string,
	blockExpired bool,
) ([]LotAllocation, error) {
	method = NormalizeLotAllocationMethod(method)
	if method == LotAllocationManual || qtyNeeded <= 0 {
		return nil, nil
	}

	orderClause := "order by lb.created_at asc nulls last, lb.id asc"
	if method == LotAllocationFEFO {
		orderClause = "order by lb.expiry_date asc nulls last, lb.created_at asc, lb.id asc"
	}

	rows, err := tx.Query(ctx, fmt.Sprintf(`
		select lb.id, lb.lot_no, lb.expiry_date, lb.qty_on_hand::float8, lb.created_at
		from public.inv_lot_batches lb
		where lb.tenant_id = $1 and lb.item_id = $2 and lb.location_id = $3
		  and lb.qty_on_hand > 0
		  and ($4 = false or lb.expiry_date is null or lb.expiry_date >= current_date)
		%s
		for update`, orderClause), tenantID, itemID, locationID, blockExpired)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var candidates []lotCandidate
	for rows.Next() {
		var c lotCandidate
		if err := rows.Scan(&c.id, &c.lotNo, &c.expiryDate, &c.qtyOnHand, &c.createdAt); err != nil {
			return nil, err
		}
		candidates = append(candidates, c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	remaining := qtyNeeded
	var out []LotAllocation
	for _, c := range candidates {
		if remaining <= 0.0001 {
			break
		}
		take := c.qtyOnHand
		if take > remaining {
			take = remaining
		}
		if take <= 0 {
			continue
		}
		alloc := LotAllocation{LotBatchID: c.id, LotNo: c.lotNo, Qty: take}
		if c.expiryDate != nil {
			s := c.expiryDate.Format("2006-01-02")
			alloc.ExpiryDate = &s
		}
		out = append(out, alloc)
		remaining -= take
	}
	if remaining > 0.0001 {
		return nil, fmt.Errorf("insufficient lot qty (%.4f short)", remaining)
	}
	return out, nil
}

// SuggestLots is a read-only helper for UI lot pickers.
func SuggestLots(
	ctx context.Context,
	q pgx.Tx,
	tenantID, itemID, locationID int64,
	qtyNeeded float64,
	method string,
	blockExpired bool,
) ([]LotAllocation, error) {
	method = NormalizeLotAllocationMethod(method)
	if method == LotAllocationManual || qtyNeeded <= 0 {
		return nil, nil
	}
	orderClause := "order by lb.created_at asc nulls last, lb.id asc"
	if method == LotAllocationFEFO {
		orderClause = "order by lb.expiry_date asc nulls last, lb.created_at asc, lb.id asc"
	}
	rows, err := q.Query(ctx, fmt.Sprintf(`
		select lb.id, lb.lot_no, lb.expiry_date, lb.qty_on_hand::float8
		from public.inv_lot_batches lb
		where lb.tenant_id = $1 and lb.item_id = $2 and lb.location_id = $3
		  and lb.qty_on_hand > 0
		  and ($4 = false or lb.expiry_date is null or lb.expiry_date >= current_date)
		%s`, orderClause), tenantID, itemID, locationID, blockExpired)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	remaining := qtyNeeded
	var out []LotAllocation
	for rows.Next() {
		var id int64
		var lotNo string
		var expiry *time.Time
		var qtyOnHand float64
		if err := rows.Scan(&id, &lotNo, &expiry, &qtyOnHand); err != nil {
			return nil, err
		}
		if remaining <= 0.0001 {
			break
		}
		take := qtyOnHand
		if take > remaining {
			take = remaining
		}
		alloc := LotAllocation{LotBatchID: id, LotNo: lotNo, Qty: take}
		if expiry != nil {
			s := expiry.Format("2006-01-02")
			alloc.ExpiryDate = &s
		}
		out = append(out, alloc)
		remaining -= take
	}
	return out, rows.Err()
}
