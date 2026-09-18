package invoicejournal

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/fiscalyear"
)

// Journal actions reported by VoidTx.
const (
	VoidActionNone      = "none"
	VoidActionCancelled = "cancelled"
	VoidActionReversed  = "reversed"
)

// VoidResult describes what happened to the voucher's journal entry.
type VoidResult struct {
	Action          string `json:"journal_action"`
	ReversalEntryID *int64 `json:"reversal_journal_entry_id,omitempty"`
}

// VoidTx voids the journal entry behind an invoice voucher: a draft entry is
// cancelled, a posted entry gets a reversing entry (debits and credits swapped)
// and is archived. Archiving is a UI soft-hide only — both legs stay posted so
// the general ledger nets to zero instead of losing the original amounts.
// An already cancelled or missing entry is a no-op.
func VoidTx(ctx context.Context, tx pgx.Tx, tenantID, userID int64, jeID *int64, remarks string) (VoidResult, error) {
	if jeID == nil || *jeID <= 0 {
		return VoidResult{Action: VoidActionNone}, nil
	}
	var status string
	var entryDate time.Time
	err := tx.QueryRow(ctx,
		`select status, entry_date from public.fin_journal_entries where id = $1 and tenant_id = $2 for update`,
		*jeID, tenantID).Scan(&status, &entryDate)
	if errors.Is(err, pgx.ErrNoRows) {
		return VoidResult{Action: VoidActionNone}, nil
	}
	if err != nil {
		return VoidResult{}, err
	}

	switch status {
	case "draft":
		if _, err := tx.Exec(ctx,
			`update public.fin_journal_entries set status = 'cancelled', updated_at = now() where id = $1`,
			*jeID); err != nil {
			return VoidResult{}, err
		}
		return VoidResult{Action: VoidActionCancelled}, nil
	case "posted":
		reversalID, err := reverseEntryTx(ctx, tx, tenantID, userID, *jeID, entryDate, remarks)
		if err != nil {
			return VoidResult{}, err
		}
		return VoidResult{Action: VoidActionReversed, ReversalEntryID: &reversalID}, nil
	default:
		return VoidResult{Action: VoidActionNone}, nil
	}
}

func reverseEntryTx(ctx context.Context, tx pgx.Tx, tenantID, userID, originalID int64, entryDate time.Time, remarks string) (int64, error) {
	reversalDate, err := openReversalDate(ctx, tx, tenantID, entryDate)
	if err != nil {
		return 0, err
	}
	var dateSeq int
	if err := tx.QueryRow(ctx,
		`select coalesce(max(date_seq),0)+1 from public.fin_journal_entries where tenant_id = $1 and entry_date = $2`,
		tenantID, reversalDate).Scan(&dateSeq); err != nil {
		return 0, err
	}
	entryNo := fmt.Sprintf("JE-%s-%d", reversalDate.Format("20060102"), dateSeq)
	var reversalID int64
	if err := tx.QueryRow(ctx, `
		insert into public.fin_journal_entries
		  (tenant_id, entry_date, date_seq, entry_no, status, remarks, posted_at, created_by_user_id, reversal_of_entry_id)
		values ($1,$2,$3,$4,'posted',$5,now(),$6,$7)
		returning id`,
		tenantID, reversalDate, dateSeq, entryNo, remarks, userID, originalID).Scan(&reversalID); err != nil {
		return 0, err
	}
	if _, err := tx.Exec(ctx, `
		insert into public.fin_journal_entry_lines
		  (journal_entry_id, line_no, account_id, debit, credit, party_id, remarks)
		select $1, line_no, account_id, credit, debit, party_id, concat('Reversal: ', coalesce(remarks, ''))
		from public.fin_journal_entry_lines
		where journal_entry_id = $2
		order by line_no`, reversalID, originalID); err != nil {
		return 0, err
	}
	if _, err := tx.Exec(ctx, `
		update public.fin_journal_entries
		set reversed_at = now(), reversed_by_entry_id = $2,
		    archived_at = coalesce(archived_at, now()), updated_at = now()
		where id = $1`, originalID, reversalID); err != nil {
		return 0, err
	}
	return reversalID, nil
}

// openReversalDate keeps the reversal in the original period when it is still
// open, otherwise books it today. Both locked means the caller must reopen the
// period before the voucher can be voided.
func openReversalDate(ctx context.Context, tx pgx.Tx, tenantID int64, entryDate time.Time) (time.Time, error) {
	if err := fiscalyear.ErrIfClosed(ctx, tx, tenantID, entryDate); err == nil {
		return entryDate, nil
	}
	today := time.Now().UTC()
	if err := fiscalyear.ErrIfClosed(ctx, tx, tenantID, today); err != nil {
		return time.Time{}, err
	}
	return today, nil
}
