package finance

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type withholdingLineBody struct {
	TaxCodeID  int64   `json:"tax_code_id"`
	BaseAmount float64 `json:"base_amount"`
}

type WithholdingLineResponse struct {
	ID          int64   `json:"id"`
	TaxCodeID   int64   `json:"tax_code_id"`
	Code        string  `json:"code"`
	Description string  `json:"description"`
	RatePct     float64 `json:"rate_pct"`
	BaseAmount  float64 `json:"base_amount"`
	TaxAmount   float64 `json:"tax_amount"`
}

// syncPaymentVoucherCheck creates a check register entry when paying by check.
func syncPaymentVoucherCheck(ctx context.Context, tx pgx.Tx, tenantID, pvID int64, userID *int64, paymentDate time.Time, payeeName, paymentMethod string, referenceNo *string, bankAccountID *int64, amount float64) error {
	if strings.TrimSpace(paymentMethod) != "check" {
		return nil
	}
	checkNo := strings.TrimSpace(derefString(referenceNo))
	if checkNo == "" {
		return nil
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

func insertWithholdingLines(ctx context.Context, tx pgx.Tx, tenantID int64, refType string, refID int64, lines []withholdingLineBody) error {
	for _, ln := range lines {
		if ln.TaxCodeID <= 0 || ln.BaseAmount <= 0 {
			continue
		}
		var rate float64
		if err := tx.QueryRow(ctx, `
			select rate_pct::float8 from public.fin_withholding_tax_codes
			where id = $1 and tenant_id = $2 and active = true`, ln.TaxCodeID, tenantID).Scan(&rate); err != nil {
			return fmt.Errorf("withholding tax code not found")
		}
		taxAmount := ln.BaseAmount * rate / 100.0
		_, err := tx.Exec(ctx, `
			insert into public.fin_withholding_tax_lines (tenant_id, ref_type, ref_id, tax_code_id, base_amount, tax_amount)
			values ($1, $2, $3, $4, $5, $6)`,
			tenantID, refType, refID, ln.TaxCodeID, ln.BaseAmount, taxAmount)
		if err != nil {
			return err
		}
	}
	return nil
}

func derefString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func sumWithholdingTax(ctx context.Context, tx pgx.Tx, tenantID int64, lines []withholdingLineBody) (float64, error) {
	var total float64
	for _, ln := range lines {
		if ln.TaxCodeID <= 0 || ln.BaseAmount <= 0 {
			continue
		}
		var rate float64
		if err := tx.QueryRow(ctx, `
			select rate_pct::float8 from public.fin_withholding_tax_codes
			where id = $1 and tenant_id = $2 and active = true`, ln.TaxCodeID, tenantID).Scan(&rate); err != nil {
			return 0, fmt.Errorf("withholding tax code not found")
		}
		total += ln.BaseAmount * rate / 100.0
	}
	return total, nil
}

func listWithholdingLines(ctx context.Context, pool *pgxpool.Pool, tenantID int64, refType string, refID int64) ([]WithholdingLineResponse, error) {
	rows, err := pool.Query(ctx, `
		select wl.id, wl.tax_code_id, tc.code, tc.description, tc.rate_pct::float8, wl.base_amount::float8, wl.tax_amount::float8
		from public.fin_withholding_tax_lines wl
		join public.fin_withholding_tax_codes tc on tc.id = wl.tax_code_id
		where wl.tenant_id = $1 and wl.ref_type = $2 and wl.ref_id = $3
		order by wl.id`, tenantID, refType, refID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []WithholdingLineResponse
	for rows.Next() {
		var row WithholdingLineResponse
		if err := rows.Scan(&row.ID, &row.TaxCodeID, &row.Code, &row.Description, &row.RatePct, &row.BaseAmount, &row.TaxAmount); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	if out == nil {
		out = []WithholdingLineResponse{}
	}
	return out, nil
}
