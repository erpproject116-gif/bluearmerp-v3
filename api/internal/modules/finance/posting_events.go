package finance

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/financedefaults"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/ledger"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// withEntryDate attaches a document date to a posting event for the journal entry_date.
func withEntryDate(ev ledger.PostingEvent, d time.Time) ledger.PostingEvent {
	if d.IsZero() {
		return ev
	}
	dd := d.UTC().Truncate(24 * time.Hour)
	ev.EntryDate = &dd
	return ev
}

func buildORPostingEvent(tenantID, receiptID int64, lines []journalLineBody) ledger.PostingEvent {
	ev := ledger.PostingEvent{
		TenantID:   tenantID,
		SourceType: "official_receipt",
		SourceID:   receiptID,
	}
	for _, ln := range lines {
		deposit := strings.TrimSpace(ln.DepositAccountCode)
		gl := strings.TrimSpace(ln.GLAccountCode)
		if deposit == "" || gl == "" || ln.Amount <= 0 {
			continue
		}
		ev.Lines = append(ev.Lines,
			ledger.PostingLine{AccountCode: deposit, Debit: ln.Amount, PartyID: ln.PartnerID},
			ledger.PostingLine{AccountCode: gl, Credit: ln.Amount, PartyID: ln.PartnerID},
		)
		if ln.Fees > 0 {
			ev.Lines = append(ev.Lines,
				ledger.PostingLine{AccountCode: deposit, Debit: ln.Fees, PartyID: ln.PartnerID, Remarks: "fees"},
				ledger.PostingLine{AccountCode: gl, Credit: ln.Fees, PartyID: ln.PartnerID, Remarks: "fees"},
			)
		}
	}
	return ev
}

func buildPVPostingEvent(tenantID, paymentID, partnerID int64, amountTotal, withholdingTotal float64, paymentMethod, ewtPayableCode string) ledger.PostingEvent {
	creditAcct := "1020"
	switch strings.TrimSpace(paymentMethod) {
	case "bank_transfer":
		creditAcct = "1023"
	case "check":
		creditAcct = "1029"
	}
	if strings.TrimSpace(ewtPayableCode) == "" {
		ewtPayableCode = "2040"
	}
	partner := partnerID
	netPay := amountTotal - withholdingTotal
	if netPay < 0 {
		netPay = 0
	}
	lines := []ledger.PostingLine{
		{AccountCode: "2611", Debit: amountTotal, PartyID: &partner},
		{AccountCode: creditAcct, Credit: netPay, PartyID: &partner},
	}
	if withholdingTotal > 0.0001 {
		lines = append(lines, ledger.PostingLine{AccountCode: ewtPayableCode, Credit: withholdingTotal, PartyID: &partner})
	}
	return ledger.PostingEvent{
		TenantID:   tenantID,
		SourceType: "payment_voucher",
		SourceID:   paymentID,
		Lines:      lines,
	}
}

func resolveEWTPayableCode(ctx context.Context, q rowQuerier, tenantID int64) (string, error) {
	id, err := financedefaults.ResolveByRole(ctx, q, tenantID, financedefaults.RoleEWTPayable)
	if err != nil {
		return "2360", nil
	}
	var code string
	if err := q.QueryRow(ctx, `
		select account_code from public.fin_accounts
		where id = $1 and tenant_id = $2 and deleted_at is null`, id, tenantID).Scan(&code); err != nil {
		return "2360", nil
	}
	return code, nil
}

func mustEWTPayableCode(ctx context.Context, q rowQuerier, tenantID int64) string {
	code, _ := resolveEWTPayableCode(ctx, q, tenantID)
	return code
}

type rowQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// sourceJournalPosted reports whether a posted GL journal entry already exists
// for the given source document. This is the source of truth for "posted":
// audit-only posting-log rows (written when tenant auto-post is disabled) do
// not count, so they cannot permanently block a later legitimate auto-post.
func sourceJournalPosted(ctx context.Context, q rowQuerier, tenantID int64, sourceType string, sourceID int64) (bool, error) {
	var exists bool
	err := q.QueryRow(ctx, `
		select exists(
		  select 1 from public.fin_journal_entries
		  where tenant_id = $1 and entry_no = $2 and status = 'posted'
		)`, tenantID, ledger.EntryNo(sourceType, sourceID)).Scan(&exists)
	return exists, err
}

// blockIfPosted writes a 409 (or 500 on lookup failure) and returns true when
// the source document already has a posted GL journal entry. Callers must
// return immediately when it reports true.
func blockIfPosted(w http.ResponseWriter, r *http.Request, pool *pgxpool.Pool, tenantID int64, sourceType string, sourceID int64, action string) bool {
	posted, err := sourceJournalPosted(r.Context(), pool, tenantID, sourceType, sourceID)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to check posting status.", "ERR_INTERNAL")
		return true
	}
	if posted {
		response.Err(w, http.StatusConflict,
			fmt.Sprintf("This document is posted to the general ledger (journal entry %s). %s is blocked; reverse or cancel the journal entry first.",
				ledger.EntryNo(sourceType, sourceID), action),
			"ERR_POSTED_LOCKED")
		return true
	}
	return false
}

func postWithJournalPoster(ctx context.Context, tx pgx.Tx, tenantID int64, ev ledger.PostingEvent) (glStatus string, err error) {
	policy, err := processpolicy.LoadTx(ctx, tx, tenantID)
	if err != nil {
		return "", fmt.Errorf("load process policy: %w", err)
	}
	poster := ledger.JournalPoster{
		AutoOR:            policy.AccountsAutoPostOR,
		AutoPV:            policy.AccountsAutoPostPV,
		RequireJEApproval: policy.FinanceRequireJEApproval,
	}
	already, err := sourceJournalPosted(ctx, tx, ev.TenantID, ev.SourceType, ev.SourceID)
	if err != nil {
		return "", err
	}
	if already {
		return "posted", nil
	}
	willCreate := true
	if ev.SourceType == "official_receipt" && !poster.AutoOR {
		willCreate = false
	}
	if ev.SourceType == "payment_voucher" && !poster.AutoPV {
		willCreate = false
	}
	if err := poster.Post(ctx, tx, ev); err != nil {
		return "", err
	}
	if !willCreate || len(ev.Lines) == 0 {
		return "audit_only", nil
	}
	if poster.RequireJEApproval {
		return "draft", nil
	}
	return "posted", nil
}

// PostLedgerEventTx posts a sub-ledger event using the supplied poster within tx.
// It skips only when a posted journal entry already exists for the document,
// so audit-only markers never suppress a later real post.
func PostLedgerEventTx(ctx context.Context, tx pgx.Tx, poster ledger.JournalPoster, ev ledger.PostingEvent) error {
	already, err := sourceJournalPosted(ctx, tx, ev.TenantID, ev.SourceType, ev.SourceID)
	if err != nil {
		return err
	}
	if already {
		return nil
	}
	return poster.Post(ctx, tx, ev)
}
