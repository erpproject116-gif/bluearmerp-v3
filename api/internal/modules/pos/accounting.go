package pos

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/finance"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/invoicejournal"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/ledger"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
)

const (
	defaultReceivableCode = "1089"
	defaultSalesCode      = "210"
	defaultCashCode       = "1020"
	defaultCardCode       = "1023"
	salesTaxPayableCode   = "2559"
)

type posAccountingSettings struct {
	AutoPostAccounting  bool
	AutoCreateReceipt   bool
	SalesAccountID      *int64
	ReceivableAccountID *int64
	CashAccountID       *int64
	CardAccountID       *int64
}

type CheckoutAccountingResult struct {
	JournalEntryID    *int64
	OfficialReceiptID *int64
}

func postCheckoutAccounting(
	ctx context.Context,
	tx pgx.Tx,
	tenantID, userID, salesID, partnerID, currencyID int64,
	orderDate time.Time,
	salesNo string,
	subtotal, taxTotal, grandTotal float64,
	primaryTender string,
) (CheckoutAccountingResult, error) {
	var out CheckoutAccountingResult
	cfg, err := loadPosAccountingSettings(ctx, tx, tenantID)
	if err != nil {
		return out, err
	}
	if !cfg.AutoPostAccounting {
		return out, nil
	}

	receivableID, err := resolveAccount(ctx, tx, tenantID, cfg.ReceivableAccountID, defaultReceivableCode)
	if err != nil {
		return out, fmt.Errorf("receivable account: %w", err)
	}
	salesAcctID, err := resolveAccount(ctx, tx, tenantID, cfg.SalesAccountID, defaultSalesCode)
	if err != nil {
		return out, fmt.Errorf("sales account: %w", err)
	}

	policy, err := processpolicy.LoadTx(ctx, tx, tenantID)
	if err != nil {
		return out, err
	}
	var autoPostSales bool
	_ = tx.QueryRow(ctx, `select coalesce(accounts_auto_post_sales, false) from public.tenant_process_policies where tenant_id = $1`, tenantID).Scan(&autoPostSales)

	partner := partnerID
	lines := []invoicejournal.Line{
		{AccountID: receivableID, Debit: grandTotal, PartyID: &partner, Remark: "A/R - " + salesNo},
		{AccountID: salesAcctID, Credit: subtotal, Remark: "Sales - " + salesNo},
	}
	if taxTotal > 0 {
		taxAcct, e := invoicejournal.ResolveAccountIDTx(ctx, tx, tenantID, salesTaxPayableCode)
		if e == nil {
			lines = append(lines, invoicejournal.Line{AccountID: taxAcct, Credit: taxTotal, Remark: "Output VAT - " + salesNo})
		}
	}

	jeID, err := invoicejournal.SyncTx(ctx, tx, tenantID, userID, orderDate, "POS Sales "+salesNo, nil, lines, autoPostSales)
	if err != nil {
		return out, fmt.Errorf("sales journal: %w", err)
	}
	out.JournalEntryID = &jeID

	if _, err := tx.Exec(ctx, `
		update public.sa_sales
		set sales_account_id = $2, deposit_account_id = $3, invoice_journal_entry_id = $4, updated_at = now()
		where id = $1 and tenant_id = $5`,
		salesID, salesAcctID, receivableID, jeID, tenantID); err != nil {
		return out, err
	}

	if !cfg.AutoCreateReceipt {
		return out, nil
	}

	cashAcctID, err := tenderDepositAccount(ctx, tx, tenantID, cfg, primaryTender)
	if err != nil {
		return out, fmt.Errorf("deposit account: %w", err)
	}
	cashCode, cashName, err := accountCodeName(ctx, tx, tenantID, cashAcctID)
	if err != nil {
		return out, err
	}
	recvCode, recvName, err := accountCodeName(ctx, tx, tenantID, receivableID)
	if err != nil {
		return out, err
	}

	var dateSeq int
	var receiptNo string
	if err := tx.QueryRow(ctx,
		`select date_seq, receipt_no from public.allocate_fin_receipt_sequences($1, $2::date)`,
		tenantID, orderDate).Scan(&dateSeq, &receiptNo); err != nil {
		return out, fmt.Errorf("receipt sequence: %w", err)
	}

	var receiptID int64
	paymentMethod := strings.TrimSpace(primaryTender)
	if paymentMethod == "" {
		paymentMethod = "cash"
	}
	ref := "POS " + salesNo
	if err := tx.QueryRow(ctx, `
		insert into public.fin_official_receipts (
		  tenant_id, receipt_date, date_seq, receipt_no,
		  partner_id, currency_id, payment_method, reference_no, notes,
		  amount_total, created_by_user_id, accounting_slip_no
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		returning id`,
		tenantID, orderDate, dateSeq, receiptNo,
		partnerID, currencyID, paymentMethod, ref, "Auto from POS checkout",
		grandTotal, userID, "CR "+receiptNo).Scan(&receiptID); err != nil {
		return out, fmt.Errorf("official receipt: %w", err)
	}
	out.OfficialReceiptID = &receiptID

	if _, err := tx.Exec(ctx, `
		insert into public.fin_receipt_applications (official_receipt_id, sales_id, applied_amount)
		values ($1, $2, $3)`, receiptID, salesID, grandTotal); err != nil {
		return out, err
	}

	if _, err := tx.Exec(ctx, `
		insert into public.fin_receipt_journal_lines (
		  official_receipt_id, line_no, deposit_account_code, deposit_account_name,
		  gl_account_code, gl_account_name, partner_id, amount
		) values ($1, 1, $2, $3, $4, $5, $6, $7)`,
		receiptID, cashCode, cashName, recvCode, recvName, partnerID, grandTotal); err != nil {
		return out, err
	}

	ev := ledger.PostingEvent{
		TenantID:   tenantID,
		SourceType: "official_receipt",
		SourceID:   receiptID,
		Lines: []ledger.PostingLine{
			{AccountCode: cashCode, Debit: grandTotal, PartyID: &partner},
			{AccountCode: recvCode, Credit: grandTotal, PartyID: &partner},
		},
	}
	poster := ledger.JournalPoster{
		AutoOR:            policy.AccountsAutoPostOR,
		AutoPV:            policy.AccountsAutoPostPV,
		RequireJEApproval: policy.FinanceRequireJEApproval,
	}
	if err := finance.PostLedgerEventTx(ctx, tx, poster, ev); err != nil {
		return out, fmt.Errorf("receipt journal: %w", err)
	}

	return out, nil
}

func loadPosAccountingSettings(ctx context.Context, tx pgx.Tx, tenantID int64) (posAccountingSettings, error) {
	var s posAccountingSettings
	err := tx.QueryRow(ctx, `
		select coalesce(auto_post_accounting, true), coalesce(auto_create_receipt, true),
		  sales_account_id, receivable_account_id, cash_account_id, card_account_id
		from public.pos_settings where tenant_id = $1`, tenantID).Scan(
		&s.AutoPostAccounting, &s.AutoCreateReceipt,
		&s.SalesAccountID, &s.ReceivableAccountID, &s.CashAccountID, &s.CardAccountID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return posAccountingSettings{AutoPostAccounting: true, AutoCreateReceipt: true}, nil
		}
		return s, err
	}
	return s, nil
}

func resolveAccount(ctx context.Context, tx pgx.Tx, tenantID int64, configured *int64, fallbackCode string) (int64, error) {
	if configured != nil && *configured > 0 {
		var id int64
		err := tx.QueryRow(ctx, `
			select id from public.fin_accounts
			where id = $1 and tenant_id = $2 and is_active and deleted_at is null`, *configured, tenantID).Scan(&id)
		if err == nil {
			return id, nil
		}
	}
	return invoicejournal.ResolveAccountIDTx(ctx, tx, tenantID, fallbackCode)
}

func tenderDepositAccount(ctx context.Context, tx pgx.Tx, tenantID int64, cfg posAccountingSettings, tender string) (int64, error) {
	t := strings.ToLower(strings.TrimSpace(tender))
	if t == "cash" || t == "" {
		return resolveAccount(ctx, tx, tenantID, cfg.CashAccountID, defaultCashCode)
	}
	return resolveAccount(ctx, tx, tenantID, cfg.CardAccountID, defaultCardCode)
}

func accountCodeName(ctx context.Context, tx pgx.Tx, tenantID, accountID int64) (code, name string, err error) {
	err = tx.QueryRow(ctx, `
		select account_code, account_name from public.fin_accounts
		where id = $1 and tenant_id = $2`, accountID, tenantID).Scan(&code, &name)
	return
}
