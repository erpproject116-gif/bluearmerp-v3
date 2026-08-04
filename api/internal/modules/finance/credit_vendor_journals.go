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

// postCustomerCreditNoteJournal reverses sales revenue / A/R for a credit note.
// Revenue reverse only (no inventory restore JE in this pass).
func postCustomerCreditNoteJournal(ctx context.Context, tx pgx.Tx, tenantID, userID, creditNoteID int64) error {
	var creditDate time.Time
	var partnerID *int64
	var total, tax float64
	err := tx.QueryRow(ctx, `
		select c.credit_date, c.partner_id, c.amount_total::float8,
		  coalesce((select sum(l.tax_amount)::float8 from public.fin_credit_note_lines l where l.credit_note_id = c.id), 0)
		from public.fin_credit_notes c
		where c.id = $1 and c.tenant_id = $2 and c.deleted_at is null`,
		creditNoteID, tenantID).Scan(&creditDate, &partnerID, &total, &tax)
	if err != nil {
		return err
	}
	if total <= 0.0001 {
		return nil
	}
	pretax := total - tax
	if pretax < 0 {
		pretax = 0
	}
	salesID, err := financedefaults.ResolveByRole(ctx, tx, tenantID, financedefaults.RoleSales)
	if err != nil {
		return fmt.Errorf("map sales revenue account for credit note: %w", err)
	}
	arID, err := financedefaults.ResolveByRole(ctx, tx, tenantID, financedefaults.RoleReceivable)
	if err != nil {
		return fmt.Errorf("map receivable account for credit note: %w", err)
	}
	lines := []invoicejournal.Line{
		{AccountID: salesID, Debit: pretax, Remark: fmt.Sprintf("Credit note %d sales reverse", creditNoteID)},
		{AccountID: arID, Credit: total, PartyID: partnerID, Remark: fmt.Sprintf("Credit note %d A/R reverse", creditNoteID)},
	}
	if tax > 0.0001 {
		if vatID, e := financedefaults.ResolveByRole(ctx, tx, tenantID, financedefaults.RoleOutputVAT); e == nil {
			lines = append(lines, invoicejournal.Line{
				AccountID: vatID, Debit: tax, Remark: fmt.Sprintf("Credit note %d output VAT reverse", creditNoteID),
			})
		} else {
			lines[0].Debit = pretax + tax
		}
	}
	policy, err := processpolicy.LoadTx(ctx, tx, tenantID)
	if err != nil {
		return err
	}
	_, err = invoicejournal.SyncTx(ctx, tx, tenantID, userID, creditDate,
		fmt.Sprintf("Customer credit note %d", creditNoteID), nil, lines, policy.AccountsAutoPostSales)
	return err
}

// postVendorCreditJournal reverses purchase expense / A/P for a vendor credit.
func postVendorCreditJournal(ctx context.Context, tx pgx.Tx, tenantID, userID, vendorCreditID int64) error {
	var creditDate time.Time
	var partnerID *int64
	var total, tax float64
	err := tx.QueryRow(ctx, `
		select c.credit_date, c.partner_id, c.amount_total::float8,
		  coalesce((select sum(l.tax_amount)::float8 from public.fin_vendor_credit_lines l where l.vendor_credit_id = c.id), 0)
		from public.fin_vendor_credits c
		where c.id = $1 and c.tenant_id = $2 and c.deleted_at is null`,
		vendorCreditID, tenantID).Scan(&creditDate, &partnerID, &total, &tax)
	if err != nil {
		return err
	}
	if total <= 0.0001 {
		return nil
	}
	pretax := total - tax
	if pretax < 0 {
		pretax = 0
	}
	purchaseID, err := financedefaults.ResolveByRole(ctx, tx, tenantID, financedefaults.RolePurchase)
	if err != nil {
		return fmt.Errorf("map purchase account for vendor credit: %w", err)
	}
	apID, err := financedefaults.ResolveByRole(ctx, tx, tenantID, financedefaults.RolePayable)
	if err != nil {
		return fmt.Errorf("map payable account for vendor credit: %w", err)
	}
	lines := []invoicejournal.Line{
		{AccountID: apID, Debit: total, PartyID: partnerID, Remark: fmt.Sprintf("Vendor credit %d A/P reverse", vendorCreditID)},
		{AccountID: purchaseID, Credit: pretax, Remark: fmt.Sprintf("Vendor credit %d purchase reverse", vendorCreditID)},
	}
	if tax > 0.0001 {
		if vatID, e := financedefaults.ResolveByRole(ctx, tx, tenantID, financedefaults.RoleInputVAT); e == nil {
			lines = append(lines, invoicejournal.Line{
				AccountID: vatID, Credit: tax, Remark: fmt.Sprintf("Vendor credit %d input VAT reverse", vendorCreditID),
			})
		} else {
			lines[1].Credit = pretax + tax
		}
	}
	policy, err := processpolicy.LoadTx(ctx, tx, tenantID)
	if err != nil {
		return err
	}
	_, err = invoicejournal.SyncTx(ctx, tx, tenantID, userID, creditDate,
		fmt.Sprintf("Vendor credit %d", vendorCreditID), nil, lines, policy.AccountsAutoPostPurchase)
	return err
}
