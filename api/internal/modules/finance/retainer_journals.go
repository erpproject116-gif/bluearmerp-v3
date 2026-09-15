package finance

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/financedefaults"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/invoicejournal"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
)

// postRetainerFundJournal posts Dr Cash / Cr Unearned Revenue when a retainer is funded.
func postRetainerFundJournal(ctx context.Context, tx pgx.Tx, tenantID, userID, retainerID int64) error {
	var partnerID *int64
	var amount float64
	var retainerNo string
	var existingJE *int64
	var orID *int64
	err := tx.QueryRow(ctx, `
		select partner_id, amount_total::float8, retainer_no, journal_entry_id, official_receipt_id
		from public.fin_retainer_invoices
		where id = $1 and tenant_id = $2 and deleted_at is null`,
		retainerID, tenantID).Scan(&partnerID, &amount, &retainerNo, &existingJE, &orID)
	if err != nil {
		return err
	}
	if existingJE != nil && *existingJE > 0 {
		return nil
	}
	if orID == nil || *orID <= 0 || amount <= 0.0001 {
		return nil
	}
	if partnerID == nil || *partnerID <= 0 {
		return fmt.Errorf("retainer partner required for journal")
	}

	cashID, err := financedefaults.ResolveByRole(ctx, tx, tenantID, financedefaults.RoleCash)
	if err != nil {
		return fmt.Errorf("map cash account for retainer: %w", err)
	}
	advanceID, err := financedefaults.ResolveByRole(ctx, tx, tenantID, financedefaults.RoleCustomerAdvance)
	if err != nil {
		// Unearned Revenues may be missing on some charts — soft-skip rather than block funding.
		return nil
	}

	var receiptDate time.Time
	_ = tx.QueryRow(ctx, `
		select receipt_date from public.fin_official_receipts
		where id = $1 and tenant_id = $2`, *orID, tenantID).Scan(&receiptDate)
	if receiptDate.IsZero() {
		receiptDate = time.Now()
	}

	lines := []invoicejournal.Line{
		{AccountID: cashID, Debit: amount, PartyID: partnerID, Remark: "Retainer fund - " + retainerNo},
		{AccountID: advanceID, Credit: amount, PartyID: partnerID, Remark: "Customer advance - " + retainerNo},
	}
	policy, err := processpolicy.LoadTx(ctx, tx, tenantID)
	autoPost := false
	if err == nil {
		autoPost = policy.AccountsAutoPostOR
	}
	jeID, err := invoicejournal.SyncTx(ctx, tx, tenantID, userID, receiptDate,
		"Retainer "+retainerNo, nil, lines, autoPost)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		update public.fin_retainer_invoices
		set journal_entry_id = $3, updated_at = now()
		where id = $1 and tenant_id = $2`, retainerID, tenantID, jeID)
	return err
}

// postRetainerApplyJournal posts Dr Unearned / Cr A/R when retainer is applied to a sale.
func postRetainerApplyJournal(ctx context.Context, tx pgx.Tx, tenantID, userID, retainerID int64, partnerID *int64, applied float64, salesNo string) error {
	if applied <= 0.0001 {
		return nil
	}
	advanceID, err := financedefaults.ResolveByRole(ctx, tx, tenantID, financedefaults.RoleCustomerAdvance)
	if err != nil {
		return nil
	}
	arID, err := financedefaults.ResolveByRole(ctx, tx, tenantID, financedefaults.RoleReceivable)
	if err != nil {
		return nil
	}
	var retainerNo string
	_ = tx.QueryRow(ctx, `
		select retainer_no from public.fin_retainer_invoices
		where id = $1 and tenant_id = $2`, retainerID, tenantID).Scan(&retainerNo)
	remark := fmt.Sprintf("Apply retainer %s to %s", retainerNo, salesNo)
	lines := []invoicejournal.Line{
		{AccountID: advanceID, Debit: applied, PartyID: partnerID, Remark: remark},
		{AccountID: arID, Credit: applied, PartyID: partnerID, Remark: remark},
	}
	policy, err := processpolicy.LoadTx(ctx, tx, tenantID)
	autoPost := false
	if err == nil {
		autoPost = policy.AccountsAutoPostSales
	}
	_, err = invoicejournal.SyncTx(ctx, tx, tenantID, userID, time.Now(), remark, nil, lines, autoPost)
	return err
}
