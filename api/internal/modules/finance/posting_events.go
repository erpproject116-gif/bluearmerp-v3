package finance

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/ledger"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
)

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

func buildPVPostingEvent(tenantID, paymentID, partnerID int64, amountTotal float64, paymentMethod string) ledger.PostingEvent {
	creditAcct := "1020"
	switch strings.TrimSpace(paymentMethod) {
	case "bank_transfer":
		creditAcct = "1023"
	case "check":
		creditAcct = "1029"
	}
	partner := partnerID
	return ledger.PostingEvent{
		TenantID:   tenantID,
		SourceType: "payment_voucher",
		SourceID:   paymentID,
		Lines: []ledger.PostingLine{
			{AccountCode: "2611", Debit: amountTotal, PartyID: &partner},
			{AccountCode: creditAcct, Credit: amountTotal, PartyID: &partner},
		},
	}
}

func journalAlreadyPosted(ctx context.Context, tx pgx.Tx, tenantID int64, sourceType string, sourceID int64) (bool, error) {
	var exists bool
	err := tx.QueryRow(ctx, `
		select exists(
		  select 1 from public.fin_posting_log
		  where tenant_id = $1 and source_type = $2 and source_id = $3 and poster_kind = 'audit'
		)`, tenantID, sourceType, sourceID).Scan(&exists)
	return exists, err
}

func postWithJournalPoster(ctx context.Context, tx pgx.Tx, tenantID int64, ev ledger.PostingEvent) error {
	already, err := journalAlreadyPosted(ctx, tx, tenantID, ev.SourceType, ev.SourceID)
	if err != nil {
		return err
	}
	if already {
		return nil
	}
	policy, err := processpolicy.LoadTx(ctx, tx, tenantID)
	if err != nil {
		return fmt.Errorf("load process policy: %w", err)
	}
	poster := ledger.JournalPoster{AutoOR: policy.AccountsAutoPostOR, AutoPV: policy.AccountsAutoPostPV}
	return poster.Post(ctx, tx, ev)
}
