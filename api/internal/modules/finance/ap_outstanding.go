package finance

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

func supplierPaymentApplied(ctx context.Context, q Querier, tenantID, invoiceID int64, excludePaymentID *int64) (float64, error) {
	sql := `
		select coalesce(sum(a.applied_amount), 0)::float8
		from public.fin_payment_applications a
		join public.fin_payment_vouchers pv on pv.id = a.payment_voucher_id
		where a.supplier_invoice_id = $1 and pv.tenant_id = $2 and pv.deleted_at is null`
	args := []any{invoiceID, tenantID}
	if excludePaymentID != nil {
		sql += ` and pv.id <> $3`
		args = append(args, *excludePaymentID)
	}
	var applied float64
	err := q.QueryRow(ctx, sql, args...).Scan(&applied)
	return applied, err
}

func supplierVendorCreditApplied(ctx context.Context, q Querier, tenantID, invoiceID int64) (float64, error) {
	var applied float64
	err := q.QueryRow(ctx, `
		select coalesce(sum(a.applied_amount), 0)::float8
		from public.fin_vendor_credit_applications a
		join public.fin_vendor_credits vc on vc.id = a.vendor_credit_id
		where a.supplier_invoice_id = $1 and vc.tenant_id = $2 and vc.deleted_at is null`,
		invoiceID, tenantID).Scan(&applied)
	return applied, err
}

func computeSupplierInvoiceOutstanding(grandTotal, payments, vendorCredits float64) float64 {
	return grandTotal - payments - vendorCredits
}

func supplierInvoiceOutstandingQ(ctx context.Context, q Querier, tenantID, invoiceID int64, excludePaymentID *int64) (float64, error) {
	var grandTotal float64
	err := q.QueryRow(ctx, `
		select grand_total::float8 from public.fin_supplier_invoices
		where id = $1 and tenant_id = $2 and deleted_at is null`, invoiceID, tenantID).Scan(&grandTotal)
	if err != nil {
		return 0, err
	}
	payments, err := supplierPaymentApplied(ctx, q, tenantID, invoiceID, excludePaymentID)
	if err != nil {
		return 0, err
	}
	credits, err := supplierVendorCreditApplied(ctx, q, tenantID, invoiceID)
	if err != nil {
		return 0, err
	}
	return computeSupplierInvoiceOutstanding(grandTotal, payments, credits), nil
}

func supplierInvoiceOutstanding(ctx context.Context, pool *pgxpool.Pool, tenantID, invoiceID int64, excludePaymentID *int64) (float64, error) {
	return supplierInvoiceOutstandingQ(ctx, pool, tenantID, invoiceID, excludePaymentID)
}
