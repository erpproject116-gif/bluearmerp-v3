package inventory

import (
	"context"
	"fmt"
	"math"

	"github.com/jackc/pgx/v5"
)

// LotEventInput is a single append-only lot ledger row.
type LotEventInput struct {
	TenantID        int64
	LotBatchID      int64
	EventType       string
	FromLocationID  *int64
	ToLocationID    *int64
	Qty             float64 // absolute quantity; sign comes from EventType
	RefType         string
	RefID           *int64
	Notes           string
	CreatedByUserID *int64
}

// InsertLotEvent appends an inv_lot_events row inside an open transaction.
func InsertLotEvent(ctx context.Context, tx pgx.Tx, in LotEventInput) error {
	if in.LotBatchID <= 0 {
		return fmt.Errorf("lot batch id is required")
	}
	if in.TenantID <= 0 {
		return fmt.Errorf("tenant id is required")
	}
	qty := math.Abs(in.Qty)
	if qty < 0.0000001 {
		return nil
	}
	eventType := in.EventType
	if eventType == "" {
		return fmt.Errorf("event type is required")
	}
	var refType *string
	if in.RefType != "" {
		rt := in.RefType
		refType = &rt
	}
	var notes *string
	if in.Notes != "" {
		n := in.Notes
		notes = &n
	}
	_, err := tx.Exec(ctx, `
		insert into public.inv_lot_events (
		  tenant_id, lot_batch_id, event_type, from_location_id, to_location_id,
		  qty, ref_type, ref_id, notes, created_by_user_id
		) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		in.TenantID, in.LotBatchID, eventType, in.FromLocationID, in.ToLocationID,
		qty, refType, in.RefID, notes, in.CreatedByUserID)
	if err != nil {
		return fmt.Errorf("insert lot event: %w", err)
	}
	return nil
}

// LotEventTypeForQtyDelta maps a signed qty change to a ledger event type.
// Sign is encoded in event_type (qty is always stored absolute).
func LotEventTypeForQtyDelta(delta float64, kind string) string {
	if delta > 0 {
		switch kind {
		case "produced":
			return "produced"
		case "returned":
			return "returned"
		default:
			return "received"
		}
	}
	switch kind {
	case "consumed":
		return "consumed"
	case "voided":
		return "voided"
	default:
		return "sold"
	}
}
