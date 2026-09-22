package invoicejournal

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Resync voids the voucher's current journal entry (draft → cancelled, posted →
// reversing entry) then creates a fresh entry with the given lines. The source
// document is not deleted and stock is not touched. Pass the voucher's current
// journal_entry_id; the returned id should replace it on the document.
//
// Sync alone cannot refresh a posted entry (it leaves posted IDs unchanged),
// so account changes after post must go through Resync.
func Resync(
	ctx context.Context,
	pool *pgxpool.Pool,
	tenantID, userID int64,
	entryDate time.Time,
	remarks string,
	existingJEID *int64,
	lines []Line,
	autoPost bool,
	voidRemark string,
) (int64, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	if _, err := VoidTx(ctx, tx, tenantID, userID, existingJEID, voidRemark); err != nil {
		return 0, err
	}
	// Always create a new entry — Sync leaves posted/cancelled IDs untouched.
	jeID, err := SyncTx(ctx, tx, tenantID, userID, entryDate, remarks, nil, lines, autoPost)
	if err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return jeID, nil
}
