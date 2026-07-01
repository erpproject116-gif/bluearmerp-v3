package ledger

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5"
)

// PostingLine is one side of a double-entry posting event.
type PostingLine struct {
	AccountCode string  `json:"account_code"`
	Debit       float64 `json:"debit"`
	Credit      float64 `json:"credit"`
	PartyID     *int64  `json:"party_id,omitempty"`
	Remarks     string  `json:"remarks,omitempty"`
}

// PostingEvent is emitted after sub-ledger documents post.
type PostingEvent struct {
	TenantID   int64         `json:"tenant_id"`
	SourceType string        `json:"source_type"`
	SourceID   int64         `json:"source_id"`
	Lines      []PostingLine `json:"lines"`
}

// Poster writes posting events (audit log now; journal when enabled).
type Poster interface {
	Post(ctx context.Context, tx pgx.Tx, ev PostingEvent) error
}

// AuditPoster records events in fin_posting_log only.
type AuditPoster struct{}

func (AuditPoster) Post(ctx context.Context, tx pgx.Tx, ev PostingEvent) error {
	payload, err := json.Marshal(ev)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		insert into public.fin_posting_log (tenant_id, source_type, source_id, poster_kind, payload)
		values ($1, $2, $3, 'audit', $4)`,
		ev.TenantID, ev.SourceType, ev.SourceID, payload)
	return err
}

// JournalPoster creates a posted journal entry when tenant auto-post is enabled.
type JournalPoster struct {
	AutoOR bool
	AutoPV bool
}

func (jp JournalPoster) Post(ctx context.Context, tx pgx.Tx, ev PostingEvent) error {
	if err := (AuditPoster{}).Post(ctx, tx, ev); err != nil {
		return err
	}
	if ev.SourceType == "official_receipt" && !jp.AutoOR {
		return nil
	}
	if ev.SourceType == "payment_voucher" && !jp.AutoPV {
		return nil
	}
	if len(ev.Lines) == 0 {
		return nil
	}
	var entryID int64
	entryNo := ev.SourceType + "-" + itoa(ev.SourceID)
	err := tx.QueryRow(ctx, `
		insert into public.fin_journal_entries (tenant_id, entry_date, date_seq, entry_no, status, remarks, posted_at, created_by_user_id)
		values ($1, current_date, 1, $2, 'posted', $3, now(), null)
		returning id`,
		ev.TenantID, entryNo, ev.SourceType).Scan(&entryID)
	if err != nil {
		return err
	}
	for i, ln := range ev.Lines {
		var accountID int64
		if err := tx.QueryRow(ctx, `
			select id from public.fin_accounts where tenant_id = $1 and account_code = $2`,
			ev.TenantID, ln.AccountCode).Scan(&accountID); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `
			insert into public.fin_journal_entry_lines (journal_entry_id, line_no, account_id, debit, credit, party_id, remarks)
			values ($1, $2, $3, $4, $5, $6, $7)`,
			entryID, i+1, accountID, ln.Debit, ln.Credit, ln.PartyID, ln.Remarks)
		if err != nil {
			return err
		}
	}
	return nil
}

func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
