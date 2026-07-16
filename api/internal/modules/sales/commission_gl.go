package sales

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/financedefaults"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/invoicejournal"
)

// postCommissionJournalForSale creates one JE (DR expense / CR payable) for all
// unposted accruals on a completed sale. No-op when accounts are not mapped.
func postCommissionJournalForSale(ctx context.Context, tx pgx.Tx, tenantID, userID, salesID int64) error {
	d, err := financedefaults.Load(ctx, tx, tenantID)
	if err != nil {
		if strings.Contains(err.Error(), "commission_expense_account_id") ||
			strings.Contains(err.Error(), "auto_post_commission_journal") {
			return nil // migration not applied yet
		}
		return err
	}
	if d.CommissionExpenseAccountID == nil || *d.CommissionExpenseAccountID <= 0 {
		return nil
	}
	if d.CommissionPayableAccountID == nil || *d.CommissionPayableAccountID <= 0 {
		return nil
	}
	expID := *d.CommissionExpenseAccountID
	payID := *d.CommissionPayableAccountID

	var salesNo string
	var orderDate time.Time
	err = tx.QueryRow(ctx, `
		select sales_no, order_date
		from public.sa_sales
		where id = $1 and tenant_id = $2 and deleted_at is null`,
		salesID, tenantID).Scan(&salesNo, &orderDate)
	if err != nil {
		return err
	}

	rows, err := tx.Query(ctx, `
		select id, commission_amount::float8, coalesce(beneficiary_name, ''), salesperson_user_id
		from public.sa_commission_accruals
		where tenant_id = $1 and sales_id = $2
		  and status = 'accrued'
		  and journal_entry_id is null
		  and commission_amount > 0
		order by id`, tenantID, salesID)
	if err != nil {
		return err
	}
	defer rows.Close()

	type pend struct {
		id     int64
		amt    float64
		name   string
		userID *int64
	}
	var pending []pend
	var total float64
	for rows.Next() {
		var p pend
		if err := rows.Scan(&p.id, &p.amt, &p.name, &p.userID); err != nil {
			return err
		}
		pending = append(pending, p)
		total += p.amt
	}
	if len(pending) == 0 || total <= 0 {
		return nil
	}

	remark := fmt.Sprintf("Sales commissions — %s", salesNo)
	lines := []invoicejournal.Line{
		{AccountID: expID, Debit: total, Remark: remark},
		{AccountID: payID, Credit: total, Remark: remark},
	}
	jeID, err := invoicejournal.SyncTx(ctx, tx, tenantID, userID, orderDate, remark, nil, lines, d.AutoPostCommissionJournal)
	if err != nil {
		return fmt.Errorf("commission journal: %w", err)
	}
	for _, p := range pending {
		name := strings.TrimSpace(p.name)
		if name == "" && p.userID != nil {
			_ = tx.QueryRow(ctx, `select coalesce(full_name,'') from public.users where id=$1`, *p.userID).Scan(&name)
		}
		if _, err := tx.Exec(ctx, `
			update public.sa_commission_accruals
			set journal_entry_id = $2,
			    beneficiary_name = coalesce(nullif(beneficiary_name,''), nullif($3,''), beneficiary_name)
			where id = $1 and tenant_id = $4`,
			p.id, jeID, name, tenantID); err != nil {
			return err
		}
	}
	return nil
}

// resolveCommissionAccounts reports whether both commission GL slots are mapped.
func resolveCommissionAccounts(ctx context.Context, tx pgx.Tx, tenantID int64) (expenseID, payableID int64, ok bool, err error) {
	d, err := financedefaults.Load(ctx, tx, tenantID)
	if err != nil {
		if strings.Contains(err.Error(), "commission_expense_account_id") {
			return 0, 0, false, nil
		}
		return 0, 0, false, err
	}
	if d.CommissionExpenseAccountID == nil || *d.CommissionExpenseAccountID <= 0 {
		return 0, 0, false, nil
	}
	if d.CommissionPayableAccountID == nil || *d.CommissionPayableAccountID <= 0 {
		return 0, 0, false, nil
	}
	return *d.CommissionExpenseAccountID, *d.CommissionPayableAccountID, true, nil
}
