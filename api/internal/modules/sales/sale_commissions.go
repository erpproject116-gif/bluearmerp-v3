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
	Scope            string  `json:"scope"` // transaction | item
	SalesLineID      *int64  `json:"sales_line_id,omitempty"`
	SalesLineNo      *int    `json:"sales_line_no,omitempty"`
	ItemLabel        string  `json:"item_label,omitempty"`
}

// CommissionLineInput is the public payload for writing commission lines (Sales + POS).
type CommissionLineInput struct {
	LineNo      int     `json:"line_no"`
	TicUserID   *int64  `json:"tic_user_id"`
	TicName     string  `json:"tic_name"`
	CalcMode    string  `json:"calc_mode"`
	RateValue   float64 `json:"rate_value"`
	Notes       *string `json:"notes"`
	Scope       string  `json:"scope"` // transaction | item (default transaction)
	SalesLineID *int64  `json:"sales_line_id"`
	SalesLineNo *int    `json:"sales_line_no"`
}

type saleCommissionLineBody = CommissionLineInput

func normalizeCalcMode(mode string) string {
	m := strings.ToLower(strings.TrimSpace(mode))
	if m == "fixed" {
		return "fixed"
	}
	return "percent"
}

func normalizeCommissionScope(scope string) string {
	if strings.ToLower(strings.TrimSpace(scope)) == "item" {
		return "item"
	}
	return "transaction"
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
		scope := normalizeCommissionScope(ln.Scope)
		if scope == "item" {
			hasLine := (ln.SalesLineID != nil && *ln.SalesLineID > 0) || (ln.SalesLineNo != nil && *ln.SalesLineNo > 0)
			if !hasLine {
				return map[string]string{fmt.Sprintf("commissions[%d].sales_line_no", i): "Pick a sale line for per-item commission."}
			}
		}
	}
	return nil
}

func resolveCommissionBase(ctx context.Context, tx pgx.Tx, salesID int64, grandTotal float64, b saleCommissionLineBody) (base float64, scope string, salesLineID *int64, salesLineNo *int, err error) {
	scope = normalizeCommissionScope(b.Scope)
	base = grandTotal
	if scope != "item" {
		return base, scope, nil, nil, nil
	}
	var lineID int64
	var lineNo int
	var lineTotal float64
	if b.SalesLineID != nil && *b.SalesLineID > 0 {
		err = tx.QueryRow(ctx, `
			select id, line_no, line_total::float8
			from public.sa_sales_lines
			where sales_id = $1 and id = $2`, salesID, *b.SalesLineID).Scan(&lineID, &lineNo, &lineTotal)
	} else if b.SalesLineNo != nil && *b.SalesLineNo > 0 {
		err = tx.QueryRow(ctx, `
			select id, line_no, line_total::float8
			from public.sa_sales_lines
			where sales_id = $1 and line_no = $2`, salesID, *b.SalesLineNo).Scan(&lineID, &lineNo, &lineTotal)
	} else {
		return 0, scope, nil, nil, fmt.Errorf("sales line required for item commission")
	}
	if err != nil {
		return 0, scope, nil, nil, fmt.Errorf("sale line not found for item commission")
	}
	base = lineTotal
	salesLineID = &lineID
	salesLineNo = &lineNo
	return base, scope, salesLineID, salesLineNo, nil
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
		base, scope, salesLineID, salesLineNo, err := resolveCommissionBase(ctx, tx, salesID, grandTotal, b)
		if err != nil {
			return err
		}
		mode := normalizeCalcMode(b.CalcMode)
		amt := computeCommissionAmount(mode, b.RateValue, base)
		lineNo := b.LineNo
		if lineNo <= 0 {
			lineNo = i + 1
		}
		if _, err := tx.Exec(ctx, `
			insert into public.sa_sales_commission_lines (
			  tenant_id, sales_id, line_no, tic_user_id, tic_name, calc_mode, rate_value,
			  base_amount, commission_amount, notes, scope, sales_line_id, sales_line_no
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
			tenantID, salesID, lineNo, b.TicUserID, name, mode, b.RateValue,
			base, amt, b.Notes, scope, salesLineID, salesLineNo,
		); err != nil {
			// Pre-migration: fall back without scope columns.
			if strings.Contains(err.Error(), "scope") || strings.Contains(err.Error(), "sales_line") || strings.Contains(err.Error(), "42703") {
				if _, err2 := tx.Exec(ctx, `
					insert into public.sa_sales_commission_lines (
					  tenant_id, sales_id, line_no, tic_user_id, tic_name, calc_mode, rate_value, base_amount, commission_amount, notes
					) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
					tenantID, salesID, lineNo, b.TicUserID, name, mode, b.RateValue, base, amt, b.Notes,
				); err2 != nil {
					return err2
				}
				continue
			}
			return err
		}
	}
	return nil
}

func loadSaleCommissions(ctx context.Context, q interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, tenantID, salesID int64) ([]SaleCommissionLine, error) {
	rows, err := q.Query(ctx, `
		select c.id, c.line_no, c.tic_user_id, c.tic_name, c.calc_mode, c.rate_value::float8,
		  c.base_amount::float8, c.commission_amount::float8, c.notes,
		  coalesce(c.scope, 'transaction'), c.sales_line_id, c.sales_line_no,
		  coalesce(nullif(trim(sl.item_code || ' — ' || sl.item_name), ' — '), '')
		from public.sa_sales_commission_lines c
		left join public.sa_sales_lines sl on sl.id = c.sales_line_id
		where c.tenant_id = $1 and c.sales_id = $2
		order by c.line_no, c.id`, tenantID, salesID)
	if err != nil {
		// Table may not exist yet / columns missing — try legacy select.
		if strings.Contains(err.Error(), "sa_sales_commission_lines") || strings.Contains(err.Error(), "scope") || strings.Contains(err.Error(), "42703") {
			return loadSaleCommissionsLegacy(ctx, q, tenantID, salesID)
		}
		return nil, err
	}
	defer rows.Close()
	var out []SaleCommissionLine
	for rows.Next() {
		var ln SaleCommissionLine
		if err := rows.Scan(&ln.ID, &ln.LineNo, &ln.TicUserID, &ln.TicName, &ln.CalcMode, &ln.RateValue,
			&ln.BaseAmount, &ln.CommissionAmount, &ln.Notes,
			&ln.Scope, &ln.SalesLineID, &ln.SalesLineNo, &ln.ItemLabel); err != nil {
			return nil, err
		}
		out = append(out, ln)
	}
	if out == nil {
		out = []SaleCommissionLine{}
	}
	return out, nil
}

func loadSaleCommissionsLegacy(ctx context.Context, q interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, tenantID, salesID int64) ([]SaleCommissionLine, error) {
	rows, err := q.Query(ctx, `
		select id, line_no, tic_user_id, tic_name, calc_mode, rate_value::float8,
		  base_amount::float8, commission_amount::float8, notes
		from public.sa_sales_commission_lines
		where tenant_id = $1 and sales_id = $2
		order by line_no, id`, tenantID, salesID)
	if err != nil {
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
		ln.Scope = "transaction"
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
		select id, tic_user_id, tic_name, base_amount::float8, commission_amount::float8
		from public.sa_sales_commission_lines
		where tenant_id=$1 and sales_id=$2 and commission_amount > 0
		order by line_no`, tenantID, salesID)
	if err != nil {
		if strings.Contains(err.Error(), "sa_sales_commission_lines") {
			return nil
		}
		return err
	}
	type lineRow struct {
		id   int64
		tic  *int64
		name string
		base float64
		amt  float64
	}
	var lines []lineRow
	for rows.Next() {
		var ln lineRow
		if err := rows.Scan(&ln.id, &ln.tic, &ln.name, &ln.base, &ln.amt); err != nil {
			rows.Close()
			return err
		}
		lines = append(lines, ln)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	for _, ln := range lines {
		var exists int64
		_ = tx.QueryRow(ctx, `
			select id from public.sa_commission_accruals
			where tenant_id=$1 and sales_id=$2 and sale_commission_line_id=$3`,
			tenantID, salesID, ln.id).Scan(&exists)
		if exists > 0 {
			continue
		}
		// Prefer beneficiary_name on insert (migration 176); fall back without it if column missing.
		if _, err := tx.Exec(ctx, `
			insert into public.sa_commission_accruals (
			  tenant_id, rule_id, sales_id, salesperson_user_id, base_amount, commission_amount, status, sale_commission_line_id, beneficiary_name
			) values ($1, null, $2, $3, $4, $5, 'accrued', $6, nullif($7,''))`,
			tenantID, salesID, ln.tic, ln.base, ln.amt, ln.id, strings.TrimSpace(ln.name)); err != nil {
			if strings.Contains(err.Error(), "beneficiary_name") || strings.Contains(err.Error(), "42703") {
				if _, err2 := tx.Exec(ctx, `
					insert into public.sa_commission_accruals (
					  tenant_id, rule_id, sales_id, salesperson_user_id, base_amount, commission_amount, status, sale_commission_line_id
					) values ($1, null, $2, $3, $4, $5, 'accrued', $6)`,
					tenantID, salesID, ln.tic, ln.base, ln.amt, ln.id); err2 != nil {
					return fmt.Errorf("insert line commission accrual: %w", err2)
				}
			} else {
				return fmt.Errorf("insert line commission accrual: %w", err)
			}
		}
	}
	return nil
}

// ApplyCompletedSaleCommissions writes optional TIC lines, accrues rule + line commissions, and posts GL.
// Missing commission tables or GL mapping never fail the sale — checkout still completes.
func ApplyCompletedSaleCommissions(ctx context.Context, tx pgx.Tx, tenantID, userID, salesID int64, grandTotal float64, inputs []CommissionLineInput) error {
	if len(inputs) > 0 {
		if v := validateCommissionBodies(inputs); v != nil {
			for _, msg := range v {
				return fmt.Errorf("%s", msg)
			}
		}
		if err := replaceSaleCommissions(ctx, tx, tenantID, salesID, grandTotal, inputs); err != nil {
			if strings.Contains(err.Error(), "sa_sales_commission_lines") ||
				strings.Contains(err.Error(), "sa_commission_accruals") {
				return nil
			}
			return err
		}
	}
	if err := accrueCommissionForSale(ctx, tx, tenantID, salesID); err != nil {
		if strings.Contains(err.Error(), "sa_commission") {
			return nil
		}
		return err
	}
	if err := accrueSaleLineCommissions(ctx, tx, tenantID, salesID); err != nil {
		if strings.Contains(err.Error(), "sa_commission") ||
			strings.Contains(err.Error(), "sa_sales_commission") ||
			strings.Contains(err.Error(), "conn busy") {
			return nil
		}
		return err
	}
	if err := postCommissionJournalForSale(ctx, tx, tenantID, userID, salesID); err != nil {
		// Accruals already saved — do not block POS/Sales checkout on JE issues.
		if strings.Contains(err.Error(), "journal_entry_id") ||
			strings.Contains(err.Error(), "beneficiary_name") ||
			strings.Contains(err.Error(), "commission_") ||
			strings.Contains(err.Error(), "fin_journal") {
			return nil
		}
		return nil
	}
	return nil
}
