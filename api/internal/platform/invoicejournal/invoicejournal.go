// Package invoicejournal creates or refreshes a DRAFT double-entry journal entry
// for a source document (a Sale or a Purchase/Supplier Invoice) so the accounting
// "invoice" (Acct I / Acct II) shows up in Finance for review and posting.
package invoicejournal

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Line is one leg of the journal entry. Exactly one of Debit/Credit is non-zero.
type Line struct {
	AccountID int64
	Debit     float64
	Credit    float64
	PartyID   *int64
	Remark    string
}

// ResolveAccountID looks up a tenant account id by its code (e.g. "2559").
func ResolveAccountID(ctx context.Context, pool *pgxpool.Pool, tenantID int64, code string) (int64, error) {
	var id int64
	err := pool.QueryRow(ctx,
		`select id from public.fin_accounts where tenant_id = $1 and account_code = $2 and is_active`,
		tenantID, code).Scan(&id)
	return id, err
}

// ResolveAccountIDTx looks up an account within an existing transaction.
func ResolveAccountIDTx(ctx context.Context, tx pgx.Tx, tenantID int64, code string) (int64, error) {
	var id int64
	err := tx.QueryRow(ctx,
		`select id from public.fin_accounts where tenant_id = $1 and account_code = $2 and is_active`,
		tenantID, code).Scan(&id)
	return id, err
}

// Sync creates a new draft journal entry for the source document, or refreshes an
// existing DRAFT one in place. A posted/cancelled entry is left untouched and its
// id returned unchanged. When autoPost is true the (balanced) draft is posted.
func Sync(ctx context.Context, pool *pgxpool.Pool, tenantID, userID int64, entryDate time.Time, remarks string, existingJEID *int64, lines []Line, autoPost bool) (int64, error) {
	if len(lines) < 2 {
		return 0, errors.New("journal entry needs at least two lines")
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	jeID, err := SyncTx(ctx, tx, tenantID, userID, entryDate, remarks, existingJEID, lines, autoPost)
	if err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return jeID, nil
}

// SyncTx is like Sync but participates in the caller's transaction.
func SyncTx(ctx context.Context, tx pgx.Tx, tenantID, userID int64, entryDate time.Time, remarks string, existingJEID *int64, lines []Line, autoPost bool) (int64, error) {
	if len(lines) < 2 {
		return 0, errors.New("journal entry needs at least two lines")
	}

	var jeID int64
	if existingJEID != nil && *existingJEID > 0 {
		var status string
		err := tx.QueryRow(ctx, `select status from public.fin_journal_entries where id = $1 and tenant_id = $2`, *existingJEID, tenantID).Scan(&status)
		if err == nil {
			if status != "draft" {
				return *existingJEID, nil
			}
			jeID = *existingJEID
			if _, err := tx.Exec(ctx, `delete from public.fin_journal_entry_lines where journal_entry_id = $1`, jeID); err != nil {
				return 0, err
			}
			if _, err := tx.Exec(ctx,
				`update public.fin_journal_entries set entry_date = $2, remarks = $3, updated_at = now() where id = $1`,
				jeID, entryDate, remarks); err != nil {
				return 0, err
			}
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return 0, err
		}
	}

	if jeID == 0 {
		var dateSeq int
		if err := tx.QueryRow(ctx,
			`select coalesce(max(date_seq),0)+1 from public.fin_journal_entries where tenant_id = $1 and entry_date = $2`,
			tenantID, entryDate).Scan(&dateSeq); err != nil {
			return 0, err
		}
		entryNo := fmt.Sprintf("JE-%s-%d", entryDate.Format("20060102"), dateSeq)
		if err := tx.QueryRow(ctx, `
			insert into public.fin_journal_entries (tenant_id, entry_date, date_seq, entry_no, status, remarks, created_by_user_id)
			values ($1, $2, $3, $4, 'draft', $5, $6) returning id`,
			tenantID, entryDate, dateSeq, entryNo, remarks, userID).Scan(&jeID); err != nil {
			return 0, err
		}
	}

	lineNo := 0
	for _, ln := range lines {
		if ln.Debit == 0 && ln.Credit == 0 {
			continue
		}
		lineNo++
		if _, err := tx.Exec(ctx, `
			insert into public.fin_journal_entry_lines (journal_entry_id, line_no, account_id, debit, credit, party_id, remarks)
			values ($1,$2,$3,$4,$5,$6,$7)`,
			jeID, lineNo, ln.AccountID, ln.Debit, ln.Credit, ln.PartyID, nullIfEmpty(ln.Remark)); err != nil {
			return 0, err
		}
	}

	if autoPost {
		if _, err := tx.Exec(ctx,
			`update public.fin_journal_entries set status = 'posted', posted_at = now(), updated_at = now() where id = $1 and status = 'draft'`,
			jeID); err != nil {
			return 0, err
		}
	}
	return jeID, nil
}

func nullIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
