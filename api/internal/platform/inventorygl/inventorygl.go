// Package inventorygl posts PH SME hybrid inventory journal entries
// (Inventory / GRNI / COGS) for qty-tracked stock movements.
// Callers opt in via tenant_process_policies.inventory_gl_hybrid_enabled.
package inventorygl

import (
	"context"
	"errors"
	"math"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/financedefaults"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/fiscalyear"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/ledger"
)

// Line is one inventory movement leg. Qty is always the positive quantity moved.
type Line struct {
	ItemID         int64
	Qty            float64
	UnitCost       float64
	TrackInventory bool
}

const amountEpsilon = 0.0001

// Enabled reports whether hybrid inventory GL posting is on for the tenant.
// Missing column (migration not applied) is treated as false.
func Enabled(ctx context.Context, tx pgx.Tx, tenantID int64) (bool, error) {
	var on bool
	err := tx.QueryRow(ctx,
		`select coalesce(inventory_gl_hybrid_enabled, false) from public.tenant_process_policies where tenant_id = $1`,
		tenantID).Scan(&on)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		if strings.Contains(err.Error(), "inventory_gl_hybrid_enabled") {
			return false, nil
		}
		return false, err
	}
	return on, nil
}

// PostReceiptTx posts Dr Inventory / Cr GRNI for a goods receipt (or similar).
// No-op when hybrid GL is disabled or amount is ~0. Idempotent by entry_no.
func PostReceiptTx(ctx context.Context, tx pgx.Tx, tenantID, userID int64, entryDate time.Time, sourceType string, sourceID int64, remarks string, lines []Line) (int64, error) {
	return postHybridTx(ctx, tx, tenantID, userID, entryDate, sourceType, sourceID, remarks, lines,
		financedefaults.RoleInventory, financedefaults.RoleGRNI, autoPostPurchase)
}

// PostIssueTx posts Dr COGS / Cr Inventory for a stock issue (sales release, etc.).
// No-op when hybrid GL is disabled or amount is ~0. Idempotent by entry_no.
func PostIssueTx(ctx context.Context, tx pgx.Tx, tenantID, userID int64, entryDate time.Time, sourceType string, sourceID int64, remarks string, lines []Line) (int64, error) {
	return postHybridTx(ctx, tx, tenantID, userID, entryDate, sourceType, sourceID, remarks, lines,
		financedefaults.RoleCOGS, financedefaults.RoleInventory, autoPostSales)
}

// PostLandedCostTx posts Dr Inventory / Cr Payable for a landed-cost allocation.
// sourceType is always "landed_cost". No-op when hybrid GL is disabled or amount is ~0.
func PostLandedCostTx(ctx context.Context, tx pgx.Tx, tenantID, userID int64, entryDate time.Time, sourceID int64, remarks string, lines []Line) (int64, error) {
	return postHybridTx(ctx, tx, tenantID, userID, entryDate, "landed_cost", sourceID, remarks, lines,
		financedefaults.RoleInventory, financedefaults.RolePayable, autoPostPurchase)
}

type autoPostKind int

const (
	autoPostPurchase autoPostKind = iota
	autoPostSales
)

func postHybridTx(
	ctx context.Context,
	tx pgx.Tx,
	tenantID, userID int64,
	entryDate time.Time,
	sourceType string,
	sourceID int64,
	remarks string,
	lines []Line,
	debitRole, creditRole financedefaults.Role,
	autoKind autoPostKind,
) (int64, error) {
	on, err := Enabled(ctx, tx, tenantID)
	if err != nil {
		return 0, err
	}
	if !on {
		return 0, nil
	}

	amount := sumTrackedAmount(lines)
	if math.Abs(amount) < amountEpsilon {
		return 0, nil
	}

	entryNo := ledger.EntryNo(sourceType, sourceID)
	if existingID, err := findJEByEntryNo(ctx, tx, tenantID, entryNo); err != nil {
		return 0, err
	} else if existingID > 0 {
		return existingID, nil
	}

	debitAcct, err := financedefaults.ResolveByRole(ctx, tx, tenantID, debitRole)
	if err != nil {
		return 0, err
	}
	creditAcct, err := financedefaults.ResolveByRole(ctx, tx, tenantID, creditRole)
	if err != nil {
		return 0, err
	}

	autoPost, err := readAutoPostFlag(ctx, tx, tenantID, autoKind)
	if err != nil {
		return 0, err
	}

	var dateSeq int
	if err := tx.QueryRow(ctx,
		`select coalesce(max(date_seq),0)+1 from public.fin_journal_entries where tenant_id = $1 and entry_date = $2`,
		tenantID, entryDate).Scan(&dateSeq); err != nil {
		return 0, err
	}

	var jeID int64
	if err := tx.QueryRow(ctx, `
		insert into public.fin_journal_entries (tenant_id, entry_date, date_seq, entry_no, status, remarks, created_by_user_id)
		values ($1, $2, $3, $4, 'draft', $5, $6) returning id`,
		tenantID, entryDate, dateSeq, entryNo, remarks, userID).Scan(&jeID); err != nil {
		return 0, err
	}

	if _, err := tx.Exec(ctx, `
		insert into public.fin_journal_entry_lines (journal_entry_id, line_no, account_id, debit, credit, party_id, remarks)
		values ($1, 1, $2, $3, 0, null, $4)`,
		jeID, debitAcct, amount, nullIfEmpty(remarks)); err != nil {
		return 0, err
	}
	if _, err := tx.Exec(ctx, `
		insert into public.fin_journal_entry_lines (journal_entry_id, line_no, account_id, debit, credit, party_id, remarks)
		values ($1, 2, $2, 0, $3, null, $4)`,
		jeID, creditAcct, amount, nullIfEmpty(remarks)); err != nil {
		return 0, err
	}

	if autoPost {
		// Mirror invoicejournal.SyncTx: finance_require_je_approval keeps draft.
		var requireJEApproval bool
		if err := tx.QueryRow(ctx,
			`select coalesce(finance_require_je_approval, false) from public.tenant_process_policies where tenant_id = $1`,
			tenantID).Scan(&requireJEApproval); err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return 0, err
		}
		if !requireJEApproval {
			if err := fiscalyear.ErrIfClosed(ctx, tx, tenantID, entryDate); err != nil {
				return 0, err
			}
			if _, err := tx.Exec(ctx,
				`update public.fin_journal_entries set status = 'posted', posted_at = now(), updated_at = now() where id = $1 and status = 'draft'`,
				jeID); err != nil {
				return 0, err
			}
		}
	}
	return jeID, nil
}

func sumTrackedAmount(lines []Line) float64 {
	var sum float64
	for _, ln := range lines {
		if !ln.TrackInventory || ln.Qty <= 0 || ln.UnitCost < 0 {
			continue
		}
		sum += ln.Qty * ln.UnitCost
	}
	return sum
}

// findJEByEntryNo returns the journal entry id for tenant+entry_no, or 0 if none.
func findJEByEntryNo(ctx context.Context, tx pgx.Tx, tenantID int64, entryNo string) (int64, error) {
	var id int64
	err := tx.QueryRow(ctx,
		`select id from public.fin_journal_entries where tenant_id = $1 and entry_no = $2`,
		tenantID, entryNo).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil
	}
	return id, err
}

func readAutoPostFlag(ctx context.Context, tx pgx.Tx, tenantID int64, kind autoPostKind) (bool, error) {
	var on bool
	var err error
	switch kind {
	case autoPostSales:
		err = tx.QueryRow(ctx,
			`select coalesce(accounts_auto_post_sales, false) from public.tenant_process_policies where tenant_id = $1`,
			tenantID).Scan(&on)
	default:
		err = tx.QueryRow(ctx,
			`select coalesce(accounts_auto_post_purchase, false) from public.tenant_process_policies where tenant_id = $1`,
			tenantID).Scan(&on)
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return on, err
}

func nullIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
