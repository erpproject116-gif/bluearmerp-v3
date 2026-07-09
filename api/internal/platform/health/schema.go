package health

import (
	"context"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/migrate"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// CriticalTables must exist for core selling/buying/finance flows. Missing any → schema unhealthy.
var CriticalTables = []string{
	"schema_migrations",
	"sa_sales",
	"sa_sales_attachments",
	"so_sales_orders",
	"quo_quotations",
	"po_purchase_orders",
	"po_purchase_order_attachments",
	"gr_goods_receipts",
	"fin_supplier_invoices",
	"fin_supplier_invoice_attachments",
	"fin_official_receipts",
	"fin_payment_vouchers",
	"fin_journal_entries",
	"tenant_process_policies",
}

// SchemaHandler reports migration status and presence of critical tables.
// Returns 503 when pending migrations exist or a required table is missing.
func SchemaHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		pending, err := migrate.PendingPool(ctx, pool, "")
		if err != nil {
			response.Err(w, http.StatusServiceUnavailable, "Failed to read migration status: "+err.Error(), "ERR_SCHEMA")
			return
		}

		missing := missingTables(ctx, pool, CriticalTables)
		latest, _ := latestApplied(ctx, pool)

		healthy := len(pending) == 0 && len(missing) == 0
		body := map[string]any{
			"healthy":              healthy,
			"latest_migration":     latest,
			"pending_migrations":     pending,
			"pending_count":        len(pending),
			"missing_tables":       missing,
			"migrations_directory": migrate.Dir(),
		}

		if healthy {
			response.OK(w, body, "OK")
			return
		}
		msg := "Schema not ready."
		if len(pending) > 0 {
			msg = "Pending database migrations — run: go run ./cmd/migrate"
		} else if len(missing) > 0 {
			msg = "Missing required database tables — apply migrations."
		}
		response.JSON(w, http.StatusServiceUnavailable, response.Envelope{
			Success: false,
			Message: msg,
			Data:    body,
			Code:    "ERR_SCHEMA",
		})
	}
}

func missingTables(ctx context.Context, pool *pgxpool.Pool, tables []string) []string {
	var missing []string
	for _, name := range tables {
		var ok bool
		err := pool.QueryRow(ctx, `
			select exists (
			  select 1 from information_schema.tables
			  where table_schema = 'public' and table_name = $1
			)`, name).Scan(&ok)
		if err != nil || !ok {
			missing = append(missing, name)
		}
	}
	return missing
}

func latestApplied(ctx context.Context, pool *pgxpool.Pool) (string, error) {
	var v string
	err := pool.QueryRow(ctx, `select coalesce(max(version), '') from public.schema_migrations`).Scan(&v)
	return v, err
}
