package finance

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Querier is satisfied by *pgxpool.Pool and pgx.Tx.
type Querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// saleAppliedLateralSQL returns a LEFT JOIN LATERAL that exposes recv.received as the
// total applied to a sales invoice from ORs + credit notes + retainers.
// salesAlias is the table alias for sa_sales (typically "s").
func saleAppliedLateralSQL(salesAlias string) string {
	return saleAppliedLateralSQLAsOf(salesAlias, "")
}

// saleReceiptApplied returns OR applications against a sales invoice.
func saleReceiptApplied(ctx context.Context, q Querier, tenantID, salesID int64, excludeReceiptID *int64) (float64, error) {
	sql := `
		select coalesce(sum(a.applied_amount), 0)::float8
		from public.fin_receipt_applications a
		join public.fin_official_receipts r on r.id = a.official_receipt_id
		where a.sales_id = $1 and r.tenant_id = $2 and r.deleted_at is null`
	args := []any{salesID, tenantID}
	if excludeReceiptID != nil {
		sql += ` and r.id <> $3`
		args = append(args, *excludeReceiptID)
	}
	var applied float64
	err := q.QueryRow(ctx, sql, args...).Scan(&applied)
	return applied, err
}

func saleCreditApplied(ctx context.Context, q Querier, tenantID, salesID int64) (float64, error) {
	var applied float64
	err := q.QueryRow(ctx, `
		select coalesce(sum(a.applied_amount), 0)::float8
		from public.fin_credit_note_applications a
		join public.fin_credit_notes c on c.id = a.credit_note_id
		where a.sales_id = $1 and c.tenant_id = $2 and c.deleted_at is null`,
		salesID, tenantID).Scan(&applied)
	return applied, err
}

func saleRetainerApplied(ctx context.Context, q Querier, tenantID, salesID int64) (float64, error) {
	var applied float64
	err := q.QueryRow(ctx, `
		select coalesce(sum(a.applied_amount), 0)::float8
		from public.fin_retainer_applications a
		join public.fin_retainer_invoices ri on ri.id = a.retainer_id
		where a.sales_id = $1 and ri.tenant_id = $2 and ri.deleted_at is null`,
		salesID, tenantID).Scan(&applied)
	return applied, err
}

// computeSaleOutstanding is pure AR math: grand_total − (receipts + credits + retainers).
func computeSaleOutstanding(grandTotal, receipts, credits, retainers float64) float64 {
	return grandTotal - receipts - credits - retainers
}

// saleOutstandingAmount is grand_total minus OR + credit note + retainer applications.
func saleOutstandingAmount(ctx context.Context, pool *pgxpool.Pool, tenantID, salesID int64, excludeReceiptID *int64) (float64, error) {
	return saleOutstandingAmountQ(ctx, pool, tenantID, salesID, excludeReceiptID)
}

func saleOutstandingAmountQ(ctx context.Context, q Querier, tenantID, salesID int64, excludeReceiptID *int64) (float64, error) {
	var grandTotal float64
	err := q.QueryRow(ctx, `
		select grand_total::float8 from public.sa_sales
		where id = $1 and tenant_id = $2 and deleted_at is null`, salesID, tenantID).Scan(&grandTotal)
	if err != nil {
		return 0, err
	}
	receipts, err := saleReceiptApplied(ctx, q, tenantID, salesID, excludeReceiptID)
	if err != nil {
		return 0, err
	}
	credits, err := saleCreditApplied(ctx, q, tenantID, salesID)
	if err != nil {
		return 0, err
	}
	retainers, err := saleRetainerApplied(ctx, q, tenantID, salesID)
	if err != nil {
		return 0, err
	}
	return computeSaleOutstanding(grandTotal, receipts, credits, retainers), nil
}

// partnerOpenCreditOnAccount is remaining open credit notes + retainers for a partner.
func partnerOpenCreditOnAccount(ctx context.Context, q Querier, tenantID, partnerID int64) (float64, error) {
	var credit, retainer float64
	err := q.QueryRow(ctx, `
		select coalesce(sum(remaining_amount), 0)::float8
		from public.fin_credit_notes
		where tenant_id = $1 and partner_id = $2 and deleted_at is null
		  and status in ('open', 'applied') and remaining_amount > 0`,
		tenantID, partnerID).Scan(&credit)
	if err != nil {
		return 0, err
	}
	err = q.QueryRow(ctx, `
		select coalesce(sum(remaining_amount), 0)::float8
		from public.fin_retainer_invoices
		where tenant_id = $1 and partner_id = $2 and deleted_at is null
		  and status in ('open', 'applied') and remaining_amount > 0`,
		tenantID, partnerID).Scan(&retainer)
	if err != nil {
		return 0, err
	}
	return credit + retainer, nil
}

// saleAppliedLateralSQLAsOf filters parent document dates when asOfParam is set (e.g. "$2::date").
func saleAppliedLateralSQLAsOf(salesAlias, asOfParam string) string {
	orDate, cnDate, riDate := "", "", ""
	if asOfParam != "" {
		orDate = " and r.receipt_date <= " + asOfParam
		cnDate = " and c.credit_date <= " + asOfParam
		riDate = " and ri.retainer_date <= " + asOfParam
	}
	return fmt.Sprintf(`
		left join lateral (
		  select (
		    coalesce((
		      select sum(a.applied_amount)
		      from public.fin_receipt_applications a
		      join public.fin_official_receipts r on r.id = a.official_receipt_id
		      where a.sales_id = %s.id and r.deleted_at is null%s
		    ), 0)
		    + coalesce((
		      select sum(a.applied_amount)
		      from public.fin_credit_note_applications a
		      join public.fin_credit_notes c on c.id = a.credit_note_id
		      where a.sales_id = %s.id and c.deleted_at is null%s
		    ), 0)
		    + coalesce((
		      select sum(a.applied_amount)
		      from public.fin_retainer_applications a
		      join public.fin_retainer_invoices ri on ri.id = a.retainer_id
		      where a.sales_id = %s.id and ri.deleted_at is null%s
		    ), 0)
		  )::float8 as received
		) recv on true`, salesAlias, orDate, salesAlias, cnDate, salesAlias, riDate)
}

// SaleAppliedLateralSQLAsOf is the exported form of the sales applied-amount lateral (OR + CN + retainer).
func SaleAppliedLateralSQLAsOf(salesAlias, asOfParam string) string {
	return saleAppliedLateralSQLAsOf(salesAlias, asOfParam)
}
