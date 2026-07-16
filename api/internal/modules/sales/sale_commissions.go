package sales

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

type SaleCommissionLine struct {
	ID               int64   `json:"id,omitempty"`
	LineNo           int     `json:"line_no"`
	TicUserID        *int64  `json:"tic_user_id,omitempty"`
	TicName          string  `json:"tic_name"`
	CalcMode         string  `json:"calc_mode"` // percent | fixed
	RateValue        float64 `json:"rate_value"`
	BaseAmount       float64 `json:"base_amount"`
	CommissionAmount float64 `json:"commission_amount"`
	Notes            *string `json:"notes,omitempty"`
}

// CommissionLineInput is the public payload for writing commission lines (Sales + POS).
type CommissionLineInput struct {
	LineNo    int     `json:"line_no"`
	TicUserID *int64  `json:"tic_user_id"`
	TicName   string  `json:"tic_name"`
	CalcMode  string  `json:"calc_mode"`
	RateValue float64 `json:"rate_value"`
	Notes     *string `json:"notes"`
}

type saleCommissionLineBody = CommissionLineInput

func normalizeCalcMode(mode string) string {
	m := strings.ToLower(strings.TrimSpace(mode))
	if m == "fixed" {
		return "fixed"
	}
	return "percent"
}

func computeCommissionAmount(mode string, rateValue, baseAmount float64) float64 {
	if rateValue < 0 {
		rateValue = 0
	}
	if baseAmount < 0 {
		baseAmount = 0
	}
	switch normalizeCalcMode(mode) {
	case "fixed":
		return roundMoney4(rateValue)
	default:
		return roundMoney4(baseAmount * rateValue / 100.0)
	}
}

func roundMoney4(v float64) float64 {
	return float64(int64(v*10000+0.5)) / 10000
}

func validateCommissionBodies(lines []saleCommissionLineBody) map[string]string {
	for i, ln := range lines {
		mode := normalizeCalcMode(ln.CalcMode)
		if mode != "percent" && mode != "fixed" {
			return map[string]string{fmt.Sprintf("commissions[%d].calc_mode", i): "Must be percent or fixed."}
		}
		if ln.RateValue < 0 {
			return map[string]string{fmt.Sprintf("commissions[%d].rate_value", i): "Cannot be negative."}
		}
		if mode == "percent" && ln.RateValue > 100 {
			return map[string]string{fmt.Sprintf("commissions[%d].rate_value", i): "Percent cannot exceed 100."}
		}
		name := strings.TrimSpace(ln.TicName)
		if name == "" && (ln.TicUserID == nil || *ln.TicUserID <= 0) {
			return map[string]string{fmt.Sprintf("commissions[%d].tic_name", i): "TIC name or user is required when adding a commission line."}
		}
	}
	return nil
}

func replaceSaleCommissions(ctx context.Context, tx pgx.Tx, tenantID, salesID int64, grandTotal float64, bodies []saleCommissionLineBody) error {
	if _, err := tx.Exec(ctx, `
		delete from public.sa_commission_accruals
		where tenant_id = $1 and sales_id = $2 and sale_commission_line_id is not null`,
		tenantID, salesID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `delete from public.sa_sales_commission_lines where tenant_id=$1 and sales_id=$2`, tenantID, salesID); err != nil {
		return err
	}
	for i, b := range bodies {
		name := strings.TrimSpace(b.TicName)
		if name == "" && b.TicUserID != nil && *b.TicUserID > 0 {
			_ = tx.QueryRow(ctx, `select coalesce(full_name,'') from public.users where id=$1`, *b.TicUserID).Scan(&name)
		}
		if name == "" {
			continue // skip empty optional rows
		}
		mode := normalizeCalcMode(b.CalcMode)
		amt := computeCommissionAmount(mode, b.RateValue, grandTotal)
		lineNo := b.LineNo
		if lineNo <= 0 {
			lineNo = i + 1
		}
		if _, err := tx.Exec(ctx, `
			insert into public.sa_sales_commission_lines (
			  tenant_id, sales_id, line_no, tic_user_id, tic_name, calc_mode, rate_value, base_amount, commission_amount, notes
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
			tenantID, salesID, lineNo, b.TicUserID, name, mode, b.RateValue, grandTotal, amt, b.Notes,
		); err != nil {
			return err
		}
	}
	return nil
}

func loadSaleCommissions(ctx context.Context, q interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, tenantID, salesID int64) ([]SaleCommissionLine, error) {
	rows, err := q.Query(ctx, `
		select id, line_no, tic_user_id, tic_name, calc_mode, rate_value::float8,
		  base_amount::float8, commission_amount::float8, notes
		from public.sa_sales_commission_lines
		where tenant_id = $1 and sales_id = $2
		order by line_no, id`, tenantID, salesID)
	if err != nil {
		// Table may not exist yet before migration — treat as empty.
		if strings.Contains(err.Error(), "sa_sales_commission_lines") {
			return []SaleCommissionLine{}, nil
		}
		return nil, err
	}
	defer rows.Close()
	var out []SaleCommissionLine
	for rows.Next() {
		var ln SaleCommissionLine
		if err := rows.Scan(&ln.ID, &ln.LineNo, &ln.TicUserID, &ln.TicName, &ln.CalcMode, &ln.RateValue,
			&ln.BaseAmount, &ln.CommissionAmount, &ln.Notes); err != nil {
			return nil, err
		}
		out = append(out, ln)
	}
	if out == nil {
		out = []SaleCommissionLine{}
	}
	return out, nil
}

// accrueSaleLineCommissions posts accruals from explicit sale commission lines (idempotent per line).
func accrueSaleLineCommissions(ctx context.Context, tx pgx.Tx, tenantID, salesID int64) error {
	var progress string
	err := tx.QueryRow(ctx, `
		select progress_status from public.sa_sales
		where id=$1 and tenant_id=$2 and deleted_at is null`, salesID, tenantID).Scan(&progress)
	if err != nil {
		return err
	}
	if progress != "completed" {
		return nil
	}
	rows, err := tx.Query(ctx, `
		select id, tic_user_id, base_amount::float8, commission_amount::float8
		from public.sa_sales_commission_lines
		where tenant_id=$1 and sales_id=$2 and commission_amount > 0
		order by line_no`, tenantID, salesID)
	if err != nil {
		if strings.Contains(err.Error(), "sa_sales_commission_lines") {
			return nil
		}
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var lineID int64
		var tic *int64
		var base, amt float64
		if err := rows.Scan(&lineID, &tic, &base, &amt); err != nil {
			return err
		}
		var exists int64
		_ = tx.QueryRow(ctx, `
			select id from public.sa_commission_accruals
			where tenant_id=$1 and sales_id=$2 and sale_commission_line_id=$3`,
			tenantID, salesID, lineID).Scan(&exists)
		if exists > 0 {
			continue
		}
		if _, err := tx.Exec(ctx, `
			insert into public.sa_commission_accruals (
			  tenant_id, rule_id, sales_id, salesperson_user_id, base_amount, commission_amount, status, sale_commission_line_id
			) values ($1, null, $2, $3, $4, $5, 'accrued', $6)`,
			tenantID, salesID, tic, base, amt, lineID); err != nil {
			return fmt.Errorf("insert line commission accrual: %w", err)
		}
		// Best-effort display name (column from migration 176).
		_, _ = tx.Exec(ctx, `
			update public.sa_commission_accruals a
			set beneficiary_name = scl.tic_name
			from public.sa_sales_commission_lines scl
			where a.sale_commission_line_id = scl.id and a.tenant_id = $1 and a.sales_id = $2 and a.sale_commission_line_id = $3`,
			tenantID, salesID, lineID)
	}
	return nil
}

// ApplyCompletedSaleCommissions writes optional TIC lines, accrues rule + line commissions, and posts GL.
func ApplyCompletedSaleCommissions(ctx context.Context, tx pgx.Tx, tenantID, userID, salesID int64, grandTotal float64, inputs []CommissionLineInput) error {
	if len(inputs) > 0 {
		if v := validateCommissionBodies(inputs); v != nil {
			for _, msg := range v {
				return fmt.Errorf("%s", msg)
			}
		}
		if err := replaceSaleCommissions(ctx, tx, tenantID, salesID, grandTotal, inputs); err != nil {
			return err
		}
	}
	if err := accrueCommissionForSale(ctx, tx, tenantID, salesID); err != nil {
		return err
	}
	if err := accrueSaleLineCommissions(ctx, tx, tenantID, salesID); err != nil {
		return err
	}
	return postCommissionJournalForSale(ctx, tx, tenantID, userID, salesID)
}
