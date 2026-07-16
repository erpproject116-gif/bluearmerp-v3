package sales

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type commissionRuleMatch struct {
	ID                int64
	SalespersonUserID *int64
	ItemCategoryID    *int64
	RatePct           float64
}

type saleLineCommission struct {
	LineTotal  float64
	CategoryID *int64
}

// accrueCommissionForSale creates commission accrual rows when a sale is completed (idempotent per rule).
func accrueCommissionForSale(ctx context.Context, tx pgx.Tx, tenantID, salesID int64) error {
	var progress string
	var picUserID *int64
	var grandTotal float64
	err := tx.QueryRow(ctx, `
		select progress_status, pic_user_id, grand_total::float8
		from public.sa_sales
		where id = $1 and tenant_id = $2 and deleted_at is null`,
		salesID, tenantID).Scan(&progress, &picUserID, &grandTotal)
	if err != nil {
		return err
	}
	if progress != "completed" || grandTotal <= 0 {
		return nil
	}

	rules, err := loadActiveCommissionRules(ctx, tx, tenantID)
	if err != nil {
		return err
	}
	if len(rules) == 0 {
		return nil
	}

	lines, err := loadSaleLinesForCommission(ctx, tx, salesID)
	if err != nil {
		return err
	}

	salespersonID := int64(0)
	if picUserID != nil {
		salespersonID = *picUserID
	}

	for _, rule := range rules {
		base := commissionBaseForRule(rule, picUserID, grandTotal, lines)
		if base <= 0 {
			continue
		}
		commission := base * rule.RatePct / 100.0
		if commission <= 0 {
			continue
		}
		var spID *int64
		if salespersonID > 0 {
			spID = &salespersonID
		}
		_, err = tx.Exec(ctx, `
			insert into public.sa_commission_accruals (
			  tenant_id, rule_id, sales_id, salesperson_user_id, base_amount, commission_amount, status
			) values ($1, $2, $3, $4, $5, $6, 'accrued')
			on conflict (tenant_id, sales_id, rule_id) do nothing`,
			tenantID, rule.ID, salesID, spID, base, commission)
		if err != nil {
			return fmt.Errorf("insert commission accrual: %w", err)
		}
	}
	return nil
}

func commissionBaseForRule(rule commissionRuleMatch, picUserID *int64, grandTotal float64, lines []saleLineCommission) float64 {
	if rule.SalespersonUserID != nil {
		if picUserID == nil || *rule.SalespersonUserID != *picUserID {
			return 0
		}
	}
	if rule.ItemCategoryID != nil {
		var sum float64
		for _, ln := range lines {
			if ln.CategoryID != nil && *ln.CategoryID == *rule.ItemCategoryID {
				sum += ln.LineTotal
			}
		}
		return sum
	}
	return grandTotal
}

func loadSaleLinesForCommission(ctx context.Context, tx pgx.Tx, salesID int64) ([]saleLineCommission, error) {
	rows, err := tx.Query(ctx, `
		select ln.line_total::float8, i.item_category_id
		from public.sa_sales_lines ln
		left join public.inv_items i on i.id = ln.item_id
		where ln.sales_id = $1
		order by ln.line_no`, salesID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []saleLineCommission
	for rows.Next() {
		var ln saleLineCommission
		if err := rows.Scan(&ln.LineTotal, &ln.CategoryID); err != nil {
			return nil, err
		}
		out = append(out, ln)
	}
	return out, nil
}

func accrueCommissionForSalePool(ctx context.Context, pool *pgxpool.Pool, tenantID, salesID int64) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := accrueCommissionForSale(ctx, tx, tenantID, salesID); err != nil {
		return err
	}
	if err := accrueSaleLineCommissions(ctx, tx, tenantID, salesID); err != nil {
		return err
	}
	if err := postCommissionJournalForSale(ctx, tx, tenantID, 0, salesID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func loadActiveCommissionRules(ctx context.Context, tx pgx.Tx, tenantID int64) ([]commissionRuleMatch, error) {
	rows, err := tx.Query(ctx, `
		select id, salesperson_user_id, item_category_id, rate_pct::float8
		from public.sa_commission_rules
		where tenant_id = $1 and active = true
		order by id`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []commissionRuleMatch
	for rows.Next() {
		var row commissionRuleMatch
		if err := rows.Scan(&row.ID, &row.SalespersonUserID, &row.ItemCategoryID, &row.RatePct); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, nil
}
