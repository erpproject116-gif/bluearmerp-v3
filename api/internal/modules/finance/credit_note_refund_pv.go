package finance

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/ledger"
)

type customerRefundPVOpts struct {
	PaymentMethod string
	ReferenceNo   *string
	BankAccountID *int64
	Notes         string
}

func normalizeRefundPaymentMethod(method string) string {
	pm := strings.TrimSpace(method)
	switch pm {
	case "bank_transfer", "check":
		return pm
	case "gcash", "ewallet", "e-wallet":
		return "cash"
	default:
		if pm == "" {
			return "cash"
		}
		return "cash"
	}
}

func buildCustomerRefundPostingEvent(tenantID, paymentID, partnerID int64, amount float64, paymentMethod string) ledger.PostingEvent {
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
			{AccountCode: "1130", Debit: amount, PartyID: &partner},
			{AccountCode: creditAcct, Credit: amount, PartyID: &partner},
		},
	}
}

// createCustomerRefundPVInTx records a disbursement PV for a customer cash refund.
func createCustomerRefundPVInTx(
	ctx context.Context,
	tx pgx.Tx,
	tenantID, userID, partnerID int64,
	amount float64,
	opts customerRefundPVOpts,
) (pvID int64, paymentNo string, err error) {
	if partnerID <= 0 {
		return 0, "", fmt.Errorf("customer partner is required for payment voucher refund")
	}
	if amount <= 0 {
		return 0, "", fmt.Errorf("refund amount must be positive")
	}

	pm := normalizeRefundPaymentMethod(opts.PaymentMethod)
	if pm != "cash" && (opts.BankAccountID == nil || *opts.BankAccountID <= 0) {
		return 0, "", fmt.Errorf("bank account is required for check or bank transfer refunds")
	}

	currencyID, err := defaultTenantCurrencyID(ctx, tx, tenantID)
	if err != nil {
		return 0, "", fmt.Errorf("no currency configured")
	}

	paymentDate := time.Now()
	var dateSeq int
	if err := tx.QueryRow(ctx,
		`select date_seq, payment_no from public.allocate_fin_payment_voucher_sequences($1, $2::date)`,
		tenantID, paymentDate).Scan(&dateSeq, &paymentNo); err != nil {
		return 0, "", err
	}

	notes := strings.TrimSpace(opts.Notes)
	if notes == "" {
		notes = "Customer refund"
	}

	err = tx.QueryRow(ctx, `
		insert into public.fin_payment_vouchers (
		  tenant_id, payment_date, date_seq, payment_no,
		  partner_id, currency_id, payment_method, reference_no, notes,
		  amount_total, created_by_user_id
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		returning id`,
		tenantID, paymentDate, dateSeq, paymentNo,
		partnerID, currencyID, pm, opts.ReferenceNo, &notes, amount, userID,
	).Scan(&pvID)
	if err != nil {
		return 0, "", err
	}

	var payeeName string
	_ = tx.QueryRow(ctx, `select company_name from public.inv_partners where id = $1 and tenant_id = $2`, partnerID, tenantID).Scan(&payeeName)
	if err := syncPaymentVoucherCheck(ctx, tx, tenantID, pvID, &userID, paymentDate, payeeName, pm, opts.ReferenceNo, opts.BankAccountID, amount); err != nil {
		return 0, "", err
	}
	if err := syncExpenseBankOutflow(ctx, tx, tenantID, pvID, &userID, paymentDate, payeeName, pm, paymentNo, opts.BankAccountID, amount); err != nil {
		return 0, "", err
	}

	ev := withEntryDate(buildCustomerRefundPostingEvent(tenantID, pvID, partnerID, amount, pm), paymentDate)
	if _, err := postWithJournalPoster(ctx, tx, tenantID, ev); err != nil {
		return 0, "", err
	}
	return pvID, paymentNo, nil
}

func createCreditNoteRefundExpenseInTx(
	ctx context.Context,
	tx pgx.Tx,
	tenantID, userID int64,
	partnerID *int64,
	customerName, creditNo string,
	remaining float64,
	refReference string,
) (int64, string, error) {
	today := time.Now().Format("2006-01-02")
	expenseNo := fmt.Sprintf("REF-%s", creditNo)
	var expenseID int64
	err := tx.QueryRow(ctx, `
		insert into public.fin_expenses (
		  tenant_id, expense_date, expense_no, partner_id, vendor_name,
		  category, description, amount, tax_amount,
		  payment_status, paid_at, reference, created_by_user_id
		) values ($1, $2::date, $3, $4, $5, 'refund', $6, $7, 0, 'paid', now(), $8, $9)
		returning id`,
		tenantID, today, expenseNo, partnerID, customerName,
		fmt.Sprintf("Refund from credit note %s", creditNo),
		remaining, strings.TrimSpace(refReference), userID,
	).Scan(&expenseID)
	if err != nil {
		return 0, "", err
	}
	return expenseID, expenseNo, nil
}
