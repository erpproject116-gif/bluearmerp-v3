package sales

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// SaleLotLineInput is one POS/checkout line for lot validation.
type SaleLotLineInput struct {
	LineNo     int
	ItemID     *int64
	Qty        float64
	LotBatchID *int64
}

// ValidateSaleLotForCheckout enforces lot_batch_id per item lot_policy before POS checkout.
func ValidateSaleLotForCheckout(ctx context.Context, tx pgx.Tx, tenantID int64, lines []SaleLotLineInput) error {
	bodies := make([]saleLineBody, len(lines))
	for i, ln := range lines {
		bodies[i] = saleLineBody{
			LineNo:     ln.LineNo,
			ItemID:     ln.ItemID,
			Qty:        ln.Qty,
			LotBatchID: ln.LotBatchID,
		}
	}
	return validateSaleLotRequirements(ctx, tx, tenantID, bodies)
}

// ApplySaleLot deducts lot batch qty for sales lines with lot_batch_id set (exported for POS checkout).
func ApplySaleLot(ctx context.Context, tx pgx.Tx, tenantID, salesID int64) error {
	return applySaleLot(ctx, tx, tenantID, salesID)
}
