package finance

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/financedefaults"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/ledger"
)

type expensePayOpts struct {
	PaymentMethod string
	BankAccountID *int64
	ReferenceNo   *string
	PaymentDate   *time.Time
}

func buildExpensePaymentPostingEvent(tenantID, paymentID, partnerID int64, amountTotal float64, paymentMethod, payableAccountCode string) ledger.PostingEvent {
	creditAcct := "1020"
	switch strings.TrimSpace(paymentMethod) {
	case "bank_transfer":
		creditAcct = "1023"
	case "check":
		creditAcct = "1029"
	}
	debitAcct := strings.TrimSpace(payableAccountCode)
	if debitAcct == "" {
		debitAcct = "2010"
	}
	partner := partnerID
	return ledger.PostingEvent{
		TenantID:   tenantID,
		SourceType: "payment_voucher",
		SourceID:   paymentID,
		Lines: []ledger.PostingLine{
			{AccountCode: debitAcct, Debit: amountTotal, PartyID: &partner},
			{AccountCode: creditAcct, Credit: amountTotal, PartyID: &partner},
		},
	}
}

func resolvePayableAccountCode(ctx context.Context, tx pgx.Tx, tenantID int64) string {
	accountID, err := financedefaults.ResolveByRole(ctx, tx, tenantID, financedefaults.RolePayable)
	if err != nil {
		return "2010"
	}
	var code string
	if err := tx.QueryRow(ctx, `
		select account_code from public.fin_accounts
		where id = $1 and tenant_id = $2 and deleted_at is null`, accountID, tenantID).Scan(&code); err != nil || strings.TrimSpace(code) == "" {
		return "2010"
	}
	return code
}

func resolveExpenseAccountCode(ctx context.Context, tx pgx.Tx, tenantID int64) (string, error) {
	accountID, err := financedefaults.ResolveByRole(ctx, tx, tenantID, financedefaults.RolePurchase)
	if err != nil {
		return "5010", nil
	}
	var code string
	if err := tx.QueryRow(ctx, `
		select account_code from public.fin_accounts
		where id = $1 and tenant_id = $2 and deleted_at is null`, accountID, tenantID).Scan(&code); err != nil || strings.TrimSpace(code) == "" {
		return "5010", nil
	}
	return code, nil
}

func defaultTenantCurrencyID(ctx context.Context, tx pgx.Tx, tenantID int64) (int64, error) {
	var currencyID int64
	err := tx.QueryRow(ctx, `
		select id from public.quo_currencies
		where tenant_id = $1 and status = 'active' and deleted_at is null
		order by is_default desc, id limit 1`, tenantID).Scan(&currencyID)
	return currencyID, err
}

// syncExpenseBankOutflow records a bank register withdrawal for expense payments
// paid by check or bank transfer against a bank account.
func syncExpenseBankOutflow(ctx context.Context, tx pgx.Tx, tenantID, pvID int64, userID *int64, paymentDate time.Time, payeeName, paymentMethod, documentNo string, bankAccountID *int64, amount float64) error {
	if bankAccountID == nil || *bankAccountID <= 0 {
		return nil
	}
	pm := strings.TrimSpace(paymentMethod)
	if pm != "check" && pm != "bank_transfer" {
		return nil
	}
	checkNo := strings.TrimSpace(documentNo)
	if checkNo == "" {
		checkNo = fmt.Sprintf("EXP-PV-%d", pvID)
	}
	var existing int64
	err := tx.QueryRow(ctx, `
		select id from public.fin_checks where tenant_id = $1 and payment_voucher_id = $2 limit 1`,
		tenantID, pvID).Scan(&existing)
	if err == nil {
		return nil
	}
	_, err = tx.Exec(ctx, `
		insert into public.fin_checks (tenant_id, check_no, check_date, bank_account_id, payee_name, amount, status, payment_voucher_id, created_by_user_id)
		values ($1, $2, $3::date, $4, $5, $6, 'issued', $7, $8)`,
		tenantID, checkNo, paymentDate, bankAccountID, payeeName, amount, pvID, userID)
	return err
}

func payExpenseInTx(ctx context.Context, tx pgx.Tx, tenantID, userID, expenseID int64, opts expensePayOpts) (int64, error) {
	var (
		expenseDate time.Time
		expenseNo   string
		partnerID   *int64
		vendorName  string
		description string
		amount      float64
		taxAmount   float64
		status      string
		pvID        *int64
	)
	err := tx.QueryRow(ctx, `
		select expense_date, expense_no, partner_id, vendor_name, description,
		  amount::float8, tax_amount::float8, payment_status, payment_voucher_id
		from public.fin_expenses
		where id = $1 and tenant_id = $2 and deleted_at is null
		for update`, expenseID, tenantID).Scan(
		&expenseDate, &expenseNo, &partnerID, &vendorName, &description,
		&amount, &taxAmount, &status, &pvID,
	)
	if err != nil {
		return 0, err
	}
	if status == "paid" {
		return 0, fmt.Errorf("expense already paid")
	}
	if partnerID == nil || *partnerID <= 0 {
		return 0, fmt.Errorf("link a vendor partner before marking this expense paid")
	}

	pm := strings.TrimSpace(opts.PaymentMethod)
	if pm == "" {
		if opts.BankAccountID != nil && *opts.BankAccountID > 0 {
			pm = "bank_transfer"
		} else {
			pm = "cash"
		}
	}
	switch pm {
	case "cash", "check", "bank_transfer":
	default:
		return 0, fmt.Errorf("payment method must be cash, check, or bank_transfer")
	}
	if pm != "cash" && (opts.BankAccountID == nil || *opts.BankAccountID <= 0) {
		return 0, fmt.Errorf("bank account is required for check or bank transfer payments")
	}

	currencyID, err := defaultTenantCurrencyID(ctx, tx, tenantID)
	if err != nil {
		return 0, fmt.Errorf("no currency configured")
	}

	paymentDate := expenseDate
	if opts.PaymentDate != nil && !opts.PaymentDate.IsZero() {
		paymentDate = *opts.PaymentDate
	}
	if paymentDate.IsZero() {
		paymentDate = time.Now()
	}
	total := amount + taxAmount
	if total < 0 {
		total = 0
	}

	var dateSeq int
	var paymentNo string
	if err := tx.QueryRow(ctx,
		`select date_seq, payment_no from public.allocate_fin_payment_voucher_sequences($1, $2::date)`,
		tenantID, paymentDate).Scan(&dateSeq, &paymentNo); err != nil {
		return 0, err
	}

	payee := strings.TrimSpace(vendorName)
	if payee == "" {
		payee = strings.TrimSpace(description)
	}
	if payee == "" {
		payee = "Expense payee"
	}
	notes := fmt.Sprintf("Expense payment: %s", expenseNo)
	refNo := opts.ReferenceNo
	if refNo == nil || strings.TrimSpace(*refNo) == "" {
		ref := expenseNo
		refNo = &ref
	}

	var newPVID int64
	err = tx.QueryRow(ctx, `
		insert into public.fin_payment_vouchers (
		  tenant_id, payment_date, date_seq, payment_no,
		  partner_id, currency_id, payment_method, reference_no, notes,
		  amount_total, created_by_user_id
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		returning id`,
		tenantID, paymentDate, dateSeq, paymentNo,
		*partnerID, currencyID, pm, refNo, &notes, total, userID,
	).Scan(&newPVID)
	if err != nil {
		return 0, err
	}

	docNo := paymentNo
	if pm == "check" && refNo != nil && strings.TrimSpace(*refNo) != "" {
		docNo = strings.TrimSpace(*refNo)
	}
	if err := syncExpenseBankOutflow(ctx, tx, tenantID, newPVID, &userID, paymentDate, payee, pm, docNo, opts.BankAccountID, total); err != nil {
		return 0, err
	}

	expenseAcct, _ := resolveExpenseAccountCode(ctx, tx, tenantID)
	_ = expenseAcct // accrual already posted expense; payment settles A/P
	payableCode := resolvePayableAccountCode(ctx, tx, tenantID)
	ev := withEntryDate(buildExpensePaymentPostingEvent(tenantID, newPVID, *partnerID, total, pm, payableCode), paymentDate)
	if _, err := postWithJournalPoster(ctx, tx, tenantID, ev); err != nil {
		return 0, err
	}

	tag, err := tx.Exec(ctx, `
		update public.fin_expenses
		set payment_status = 'paid', paid_at = now(), payment_voucher_id = $3, updated_at = now()
		where id = $1 and tenant_id = $2 and deleted_at is null and payment_status = 'unpaid'`,
		expenseID, tenantID, newPVID)
	if err != nil {
		return 0, err
	}
	if tag.RowsAffected() == 0 {
		return 0, fmt.Errorf("expense not found or already paid")
	}
	return newPVID, nil
}
