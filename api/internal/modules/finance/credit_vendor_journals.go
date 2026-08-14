package finance

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/financedefaults"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/invoicejournal"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
)

// postCustomerCreditNoteJournal reverses sales revenue / A/R for a credit note.
// Revenue reverse only (no inventory restore JE in this pass).
// Persists journal_entry_id on fin_credit_notes.
func postCustomerCreditNoteJournal(ctx context.Context, tx pgx.Tx, tenantID, userID, creditNoteID int64) error {
	var creditDate time.Time
	var partnerID *int64
	var total, tax float64
	var existingJE *int64
	err := tx.QueryRow(ctx, `
		select c.credit_date, c.partner_id, c.amount_total::float8,
		  coalesce((select sum(l.tax_amount)::float8 from public.fin_credit_note_lines l where l.credit_note_id = c.id), 0),
		  c.journal_entry_id
		from public.fin_credit_notes c
		where c.id = $1 and c.tenant_id = $2 and c.deleted_at is null`,
		creditNoteID, tenantID).Scan(&creditDate, &partnerID, &total, &tax, &existingJE)
	if err != nil {
		return err
	}
	if total <= 0.0001 {
		return nil
	}
	lines, err := buildCustomerCreditNoteLines(ctx, tx, tenantID, creditNoteID, partnerID, total, tax)
	if err != nil {
		return err
	}
	policy, err := processpolicy.LoadTx(ctx, tx, tenantID)
	if err != nil {
		return err
	}
	jeID, err := invoicejournal.SyncTx(ctx, tx, tenantID, userID, creditDate,
		fmt.Sprintf("Customer credit note %d", creditNoteID), existingJE, lines, policy.AccountsAutoPostSales)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		update public.fin_credit_notes
		set journal_entry_id = $3, updated_at = now()
		where id = $1 and tenant_id = $2`, creditNoteID, tenantID, jeID)
	return err
}

func buildCustomerCreditNoteLines(ctx context.Context, tx pgx.Tx, tenantID, creditNoteID int64, partnerID *int64, total, tax float64) ([]invoicejournal.Line, error) {
	pretax := total - tax
	if pretax < 0 {
		pretax = 0
	}
	salesID, err := financedefaults.ResolveByRole(ctx, tx, tenantID, financedefaults.RoleSales)
	if err != nil {
		return nil, fmt.Errorf("map sales revenue account for credit note: %w", err)
	}
	arID, err := financedefaults.ResolveByRole(ctx, tx, tenantID, financedefaults.RoleReceivable)
	if err != nil {
		return nil, fmt.Errorf("map receivable account for credit note: %w", err)
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
	return lines, nil
}

// postVendorCreditJournal reverses purchase expense / A/P for a vendor credit.
// Persists journal_entry_id on fin_vendor_credits.
func postVendorCreditJournal(ctx context.Context, tx pgx.Tx, tenantID, userID, vendorCreditID int64) error {
	var creditDate time.Time
	var partnerID *int64
	var total, tax float64
	var existingJE *int64
	err := tx.QueryRow(ctx, `
		select c.credit_date, c.partner_id, c.amount_total::float8,
		  coalesce((select sum(l.tax_amount)::float8 from public.fin_vendor_credit_lines l where l.vendor_credit_id = c.id), 0),
		  c.journal_entry_id
		from public.fin_vendor_credits c
		where c.id = $1 and c.tenant_id = $2 and c.deleted_at is null`,
		vendorCreditID, tenantID).Scan(&creditDate, &partnerID, &total, &tax, &existingJE)
	if err != nil {
		return err
	}
	if total <= 0.0001 {
		return nil
	}
	lines, err := buildVendorCreditLines(ctx, tx, tenantID, vendorCreditID, partnerID, total, tax)
	if err != nil {
		return err
	}
	policy, err := processpolicy.LoadTx(ctx, tx, tenantID)
	if err != nil {
		return err
	}
	jeID, err := invoicejournal.SyncTx(ctx, tx, tenantID, userID, creditDate,
		fmt.Sprintf("Vendor credit %d", vendorCreditID), existingJE, lines, policy.AccountsAutoPostPurchase)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		update public.fin_vendor_credits
		set journal_entry_id = $3, updated_at = now()
		where id = $1 and tenant_id = $2`, vendorCreditID, tenantID, jeID)
	return err
}

func buildVendorCreditLines(ctx context.Context, tx pgx.Tx, tenantID, vendorCreditID int64, partnerID *int64, total, tax float64) ([]invoicejournal.Line, error) {
	pretax := total - tax
	if pretax < 0 {
		pretax = 0
	}
	purchaseID, err := financedefaults.ResolveByRole(ctx, tx, tenantID, financedefaults.RolePurchase)
	if err != nil {
		return nil, fmt.Errorf("map purchase account for vendor credit: %w", err)
	}
	apID, err := financedefaults.ResolveByRole(ctx, tx, tenantID, financedefaults.RolePayable)
	if err != nil {
		return nil, fmt.Errorf("map payable account for vendor credit: %w", err)
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
	return lines, nil
}

// creditHasPostedJournal reports whether the credit's linked JE is posted (blocks cancel).
func creditHasPostedJournal(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, tenantID int64, jeID *int64) (bool, error) {
	if jeID == nil || *jeID <= 0 {
		return false, nil
	}
	var status string
	err := q.QueryRow(ctx,
		`select status from public.fin_journal_entries where id = $1 and tenant_id = $2`,
		*jeID, tenantID).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return status == "posted", nil
}
