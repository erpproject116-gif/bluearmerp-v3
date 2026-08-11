package finance

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/financedefaults"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/invoicejournal"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
)

func applicationTotalReduction(applied, discount float64) float64 {
	return applied + discount
}

func loadARPaymentDiscountAccountID(ctx context.Context, q Querier, tenantID int64) (*int64, error) {
	var id *int64
	err := q.QueryRow(ctx, `
		select ar_payment_discount_account_id
		from public.tenant_process_policies
		where tenant_id = $1`, tenantID).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "ar_payment_discount_account_id") {
			return nil, nil
		}
		return nil, err
	}
	return id, nil
}

func loadAPPaymentDiscountAccountID(ctx context.Context, q Querier, tenantID int64) (*int64, error) {
	var id *int64
	err := q.QueryRow(ctx, `
		select ap_payment_discount_account_id
		from public.tenant_process_policies
		where tenant_id = $1`, tenantID).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "ap_payment_discount_account_id") {
			return nil, nil
		}
		return nil, err
	}
	return id, nil
}

func requireDiscountAccountConfigured(ctx context.Context, q Querier, tenantID int64, side string, discountTotal float64) error {
	if discountTotal <= 0.0001 {
		return nil
	}
	var id *int64
	var err error
	if side == "ap" {
		id, err = loadAPPaymentDiscountAccountID(ctx, q, tenantID)
	} else {
		id, err = loadARPaymentDiscountAccountID(ctx, q, tenantID)
	}
	if err != nil {
		return err
	}
	if id == nil || *id <= 0 {
		return fmt.Errorf("map a %s payment discount GL account under Process Policies before applying discounts", side)
	}
	return nil
}

func resolveReceivableAccountID(ctx context.Context, tx pgx.Tx, tenantID int64) (int64, error) {
	defs, err := financedefaults.Load(ctx, tx, tenantID)
	if err == nil && defs.ReceivableAccountID != nil && *defs.ReceivableAccountID > 0 {
		return *defs.ReceivableAccountID, nil
	}
	if id, e := invoicejournal.ResolveAccountIDTx(ctx, tx, tenantID, "1100"); e == nil {
		return id, nil
	}
	return invoicejournal.ResolveAccountIDTx(ctx, tx, tenantID, "1089")
}

func resolvePayableAccountID(ctx context.Context, tx pgx.Tx, tenantID int64) (int64, error) {
	defs, err := financedefaults.Load(ctx, tx, tenantID)
	if err == nil && defs.PayableAccountID != nil && *defs.PayableAccountID > 0 {
		return *defs.PayableAccountID, nil
	}
	if id, e := invoicejournal.ResolveAccountIDTx(ctx, tx, tenantID, "2010"); e == nil {
		return id, nil
	}
	return invoicejournal.ResolveAccountIDTx(ctx, tx, tenantID, "2519")
}

// postARPaymentDiscountJournalTx posts DR discount expense / CR A/R for OR discounts.
func postARPaymentDiscountJournalTx(
	ctx context.Context, tx pgx.Tx, tenantID, userID, partnerID int64,
	entryDate time.Time, receiptNo string, discountTotal float64,
) error {
	if discountTotal <= 0.0001 {
		return nil
	}
	discID, err := loadARPaymentDiscountAccountID(ctx, tx, tenantID)
	if err != nil {
		return err
	}
	if discID == nil || *discID <= 0 {
		return fmt.Errorf("AR payment discount account is not configured")
	}
	arID, err := resolveReceivableAccountID(ctx, tx, tenantID)
	if err != nil {
		return fmt.Errorf("receivable account for discount: %w", err)
	}
	partner := partnerID
	lines := []invoicejournal.Line{
		{AccountID: *discID, Debit: discountTotal, PartyID: &partner, Remark: "AR payment discount - " + receiptNo},
		{AccountID: arID, Credit: discountTotal, PartyID: &partner, Remark: "A/R discount - " + receiptNo},
	}
	policy, _ := processpolicy.LoadTx(ctx, tx, tenantID)
	_, err = invoicejournal.SyncTx(ctx, tx, tenantID, userID, entryDate, "OR discount "+receiptNo, nil, lines, policy.AccountsAutoPostOR)
	return err
}

// postAPPaymentDiscountJournalTx posts DR A/P / CR purchase discount for PV discounts.
func postAPPaymentDiscountJournalTx(
	ctx context.Context, tx pgx.Tx, tenantID, userID, partnerID int64,
	entryDate time.Time, paymentNo string, discountTotal float64,
) error {
	if discountTotal <= 0.0001 {
		return nil
	}
	discID, err := loadAPPaymentDiscountAccountID(ctx, tx, tenantID)
	if err != nil {
		return err
	}
	if discID == nil || *discID <= 0 {
		return fmt.Errorf("AP payment discount account is not configured")
	}
	apID, err := resolvePayableAccountID(ctx, tx, tenantID)
	if err != nil {
		return fmt.Errorf("payable account for discount: %w", err)
	}
	partner := partnerID
	lines := []invoicejournal.Line{
		{AccountID: apID, Debit: discountTotal, PartyID: &partner, Remark: "A/P discount - " + paymentNo},
		{AccountID: *discID, Credit: discountTotal, PartyID: &partner, Remark: "AP payment discount - " + paymentNo},
	}
	policy, _ := processpolicy.LoadTx(ctx, tx, tenantID)
	_, err = invoicejournal.SyncTx(ctx, tx, tenantID, userID, entryDate, "PV discount "+paymentNo, nil, lines, policy.AccountsAutoPostPV)
	return err
}
