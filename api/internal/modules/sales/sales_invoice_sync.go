package sales

import (
	"context"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/financedefaults"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/invoicejournal"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
)

const journalBalanceEpsilon = 0.0001

// SaleJournalAction is what the sales invoice sync will do for one sale.
type SaleJournalAction string

const (
	SaleJournalSkip   SaleJournalAction = "skip"
	SaleJournalCreate SaleJournalAction = "create"
	SaleJournalKeep   SaleJournalAction = "keep"
	SaleJournalResync SaleJournalAction = "resync"
)

// PlanSaleJournal decides the ledger write for a sale. Only progress "completed"
// posts. A posted journal whose debit total still matches the sale total is left
// in place so a second save cannot create another entry.
func PlanSaleJournal(progress string, hasJournal bool, journalStatus string, existingDebit, grandTotal float64) SaleJournalAction {
	if progress != "completed" {
		return SaleJournalSkip
	}
	if !hasJournal || journalStatus == "cancelled" || journalStatus == "" {
		return SaleJournalCreate
	}
	if journalStatus == "posted" && math.Abs(existingDebit-grandTotal) <= journalBalanceEpsilon {
		return SaleJournalKeep
	}
	if journalStatus == "posted" {
		return SaleJournalResync
	}
	return SaleJournalCreate
}

// SyncSalesInvoiceJournalFromDefaultsTx creates the sales A/R journal only when
// progress_status is exactly completed. Unconfirmed, in-progress, and e-approval
// sales return nil and write nothing, so callers such as contract billing can
// save without a journal. A completed sale with tax and no output-VAT account
// returns an error and writes nothing.
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
	if progress != "completed" || grandTotal <= 0 {
		return nil
	}

	defs, err := financedefaults.Load(ctx, tx, tenantID)
	if err != nil || defs.SalesAccountID == nil || defs.ReceivableAccountID == nil ||
		*defs.SalesAccountID <= 0 || *defs.ReceivableAccountID <= 0 {
		return fmt.Errorf("map Sales and Accounts Receivable under Chart of Accounts defaults before completing a Sale (/app/finance/acct-i/chart-of-accounts?focus=sales#default-account-mappings)")
	}

	partner := partnerID
	lines := []invoicejournal.Line{
		{AccountID: *defs.ReceivableAccountID, Debit: grandTotal, PartyID: &partner, Remark: "A/R - " + salesNo},
		{AccountID: *defs.SalesAccountID, Credit: subtotal, Remark: "Sales - " + salesNo},
	}
	if taxTotal > 0 {
		taxAcct, e := invoicejournal.ResolveAccountIDTx(ctx, tx, tenantID, salesTaxPayableCode)
		if e != nil {
			return fmt.Errorf("map the output VAT account (%s) before completing a sale that has tax", salesTaxPayableCode)
		}
		lines = append(lines, invoicejournal.Line{AccountID: taxAcct, Credit: taxTotal, Remark: "Output VAT - " + salesNo})
	}

	journalStatus := ""
	existingDebit := 0.0
	hasJournal := existingJE != nil && *existingJE > 0
	if hasJournal {
		if err := tx.QueryRow(ctx, `
			select coalesce(je.status, ''), coalesce(sum(l.debit), 0)::float8
			from public.fin_journal_entries je
			left join public.fin_journal_entry_lines l on l.journal_entry_id = je.id
			where je.id = $1 and je.tenant_id = $2
			group by je.status`, *existingJE, tenantID).Scan(&journalStatus, &existingDebit); err != nil {
			if !errors.Is(err, pgx.ErrNoRows) {
				return fmt.Errorf("load sale journal: %w", err)
			}
			hasJournal = false
			journalStatus = ""
		}
	}
	action := PlanSaleJournal(progress, hasJournal, journalStatus, existingDebit, grandTotal)
	if action == SaleJournalSkip || action == SaleJournalKeep {
		return nil
	}

	policy, err := processpolicy.LoadTx(ctx, tx, tenantID)
	autoPost := false
	if err == nil {
		autoPost = policy.AccountsAutoPostSales
	}

	var jeID int64
	if action == SaleJournalResync {
		jeID, err = invoicejournal.ResyncTx(ctx, tx, tenantID, userID, orderDate, "Sales "+salesNo, existingJE, lines, autoPost, "Repost sales "+salesNo+" (total change)")
	} else if hasJournal && journalStatus == "draft" {
		jeID, err = invoicejournal.SyncTx(ctx, tx, tenantID, userID, orderDate, "Sales "+salesNo, existingJE, lines, autoPost)
	} else {
		jeID, err = invoicejournal.SyncTx(ctx, tx, tenantID, userID, orderDate, "Sales "+salesNo, nil, lines, autoPost)
	}
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
