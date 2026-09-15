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

// postExpenseAccrualJournal posts Dr expense (+ input VAT) / Cr A/P for an unpaid expense.
// Skips when already linked to a journal or amount is zero. Requires a vendor partner.
func postExpenseAccrualJournal(ctx context.Context, tx pgx.Tx, tenantID, userID, expenseID int64) error {
	var expenseDate time.Time
	var partnerID *int64
	var amount, tax float64
	var expenseNo string
	var existingJE *int64
	var status string
	err := tx.QueryRow(ctx, `
		select expense_date, partner_id, amount::float8, tax_amount::float8, expense_no,
		  journal_entry_id, payment_status
		from public.fin_expenses
		where id = $1 and tenant_id = $2 and deleted_at is null`,
		expenseID, tenantID).Scan(&expenseDate, &partnerID, &amount, &tax, &expenseNo, &existingJE, &status)
	if err != nil {
		return err
	}
	if status == "paid" {
		return nil
	}
	if partnerID == nil || *partnerID <= 0 {
		return nil // cannot accrue A/P without a vendor partner
	}
	total := amount + tax
	if total <= 0.0001 {
		return nil
	}

	expenseAcct, err := financedefaults.ResolveByRole(ctx, tx, tenantID, financedefaults.RolePurchase)
	if err != nil {
		return fmt.Errorf("map expense account: %w", err)
	}
	apAcct, err := financedefaults.ResolveByRole(ctx, tx, tenantID, financedefaults.RolePayable)
	if err != nil {
		return fmt.Errorf("map payable account: %w", err)
	}

	lines := []invoicejournal.Line{
		{AccountID: expenseAcct, Debit: amount, PartyID: partnerID, Remark: "Expense - " + expenseNo},
		{AccountID: apAcct, Credit: total, PartyID: partnerID, Remark: "A/P - " + expenseNo},
	}
	if tax > 0.0001 {
		if vatID, e := financedefaults.ResolveByRole(ctx, tx, tenantID, financedefaults.RoleInputVAT); e == nil {
			lines = []invoicejournal.Line{
				{AccountID: expenseAcct, Debit: amount, PartyID: partnerID, Remark: "Expense - " + expenseNo},
				{AccountID: vatID, Debit: tax, PartyID: partnerID, Remark: "Input VAT - " + expenseNo},
				{AccountID: apAcct, Credit: total, PartyID: partnerID, Remark: "A/P - " + expenseNo},
			}
		} else {
			lines[0].Debit = total
		}
	}

	policy, err := processpolicy.LoadTx(ctx, tx, tenantID)
	autoPost := false
	if err == nil {
		autoPost = policy.AccountsAutoPostPurchase
	}
	jeID, err := invoicejournal.SyncTx(ctx, tx, tenantID, userID, expenseDate,
		"Expense "+expenseNo, existingJE, lines, autoPost)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		update public.fin_expenses
		set journal_entry_id = $3, updated_at = now()
		where id = $1 and tenant_id = $2`, expenseID, tenantID, jeID)
	return err
}
