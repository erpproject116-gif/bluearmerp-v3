package sales

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/financedefaults"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/invoicejournal"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
)

// SyncSalesInvoiceJournalFromDefaultsTx creates/refreshes the sales A/R journal when
// Chart of Accounts defaults (Sales + Receivable) are mapped.
// Soft-skips when defaults are missing for non-confirming sales.
// On confirming progress, missing CoA defaults return a hard error so Ledger/BS/P&L stay wired.
// Auto-post follows accounts_auto_post_sales.
func SyncSalesInvoiceJournalFromDefaultsTx(ctx context.Context, tx pgx.Tx, tenantID, userID, salesID int64) error {
	return syncSalesInvoiceJournalFromDefaultsTx(ctx, tx, tenantID, userID, salesID)
}

func syncSalesInvoiceJournalFromDefaultsTx(ctx context.Context, tx pgx.Tx, tenantID, userID, salesID int64) error {
	var existingJE *int64
	var orderDate time.Time
	var partnerID int64
	var subtotal, taxTotal, grandTotal float64
	var salesNo, progress string
	err := tx.QueryRow(ctx, `
		select order_date, partner_id, subtotal::float8, tax_total::float8, grand_total::float8,
		  sales_no, coalesce(progress_status, 'unconfirmed'), invoice_journal_entry_id
		from public.sa_sales
		where id = $1 and tenant_id = $2 and deleted_at is null`,
		salesID, tenantID).Scan(&orderDate, &partnerID, &subtotal, &taxTotal, &grandTotal, &salesNo, &progress, &existingJE)
	if err != nil {
		return fmt.Errorf("load sale for invoice sync: %w", err)
	}
	if existingJE != nil && *existingJE > 0 {
		return nil
	}
	if grandTotal <= 0 {
		return nil
	}

	confirming := processpolicy.IsConfirmingProgress(processpolicy.DocSales, progress)

	defs, err := financedefaults.Load(ctx, tx, tenantID)
	if err != nil {
		if confirming {
			return fmt.Errorf("map Sales and Accounts Receivable under Chart of Accounts defaults before confirming a Sale (/app/finance/acct-i/chart-of-accounts?focus=sales#default-account-mappings)")
		}
		return nil
	}
	if defs.SalesAccountID == nil || defs.ReceivableAccountID == nil ||
		*defs.SalesAccountID <= 0 || *defs.ReceivableAccountID <= 0 {
		if confirming {
			return fmt.Errorf("map Sales and Accounts Receivable under Chart of Accounts defaults before confirming a Sale (/app/finance/acct-i/chart-of-accounts?focus=sales#default-account-mappings)")
		}
		return nil
	}

	partner := partnerID
	lines := []invoicejournal.Line{
		{AccountID: *defs.ReceivableAccountID, Debit: grandTotal, PartyID: &partner, Remark: "A/R - " + salesNo},
		{AccountID: *defs.SalesAccountID, Credit: subtotal, Remark: "Sales - " + salesNo},
	}
	if taxTotal > 0 {
		if taxAcct, e := invoicejournal.ResolveAccountIDTx(ctx, tx, tenantID, salesTaxPayableCode); e == nil {
			lines = append(lines, invoicejournal.Line{AccountID: taxAcct, Credit: taxTotal, Remark: "Output VAT - " + salesNo})
		}
	}

	policy, err := processpolicy.LoadTx(ctx, tx, tenantID)
	autoPost := false
	if err == nil {
		autoPost = policy.AccountsAutoPostSales
	}

	jeID, err := invoicejournal.SyncTx(ctx, tx, tenantID, userID, orderDate, "Sales "+salesNo, nil, lines, autoPost)
	if err != nil {
		return fmt.Errorf("sales invoice journal: %w", err)
	}
	_, err = tx.Exec(ctx, `
		update public.sa_sales
		set sales_account_id = $2, deposit_account_id = $3, invoice_journal_entry_id = $4, updated_at = now()
		where id = $1 and tenant_id = $5`,
		salesID, *defs.SalesAccountID, *defs.ReceivableAccountID, jeID, tenantID)
	return err
}
