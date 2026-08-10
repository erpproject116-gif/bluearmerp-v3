package finance

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customfields"
)

const entitySupplierInvoice = "fin_supplier_invoice"

func attachSupplierInvoiceCustom(ctx context.Context, pool *pgxpool.Pool, tenantID int64, entityID int64) map[string]any {
	vals, err := customfields.LoadValues(ctx, pool, tenantID, entitySupplierInvoice, entityID)
	if err != nil || len(vals) == 0 {
		return nil
	}
	return vals
}

func saveSupplierInvoiceCustom(ctx context.Context, tx pgx.Tx, tenantID int64, entityID int64, values map[string]any) map[string]string {
	return customfields.ValidateAndSave(ctx, tx, tenantID, entitySupplierInvoice, entityID, values)
}
