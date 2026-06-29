package sales

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type returnLinesBody struct {
	LineIDs []int64 `json:"line_ids"`
}

func postReturnSaleLines(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		salesID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body returnLinesBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.LineIDs) == 0 {
			response.Validation(w, map[string]string{"line_ids": "At least one line id is required."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to return lines.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var tenantID int64
		err = tx.QueryRow(r.Context(), `
			select tenant_id from public.sa_sales
			where id = $1 and deleted_at is null
			for update`, salesID).Scan(&tenantID)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Sales not found.", "ERR_NOT_FOUND")
			return
		}
		if tenantID != tu.TenantID {
			response.Err(w, http.StatusForbidden, "Forbidden.", "ERR_FORBIDDEN")
			return
		}

		var found int
		if err := tx.QueryRow(r.Context(), `
			select count(*) from public.sa_sales_lines
			where sales_id = $1 and id = any($2)`, salesID, body.LineIDs).Scan(&found); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to validate lines.", "ERR_INTERNAL")
			return
		}
		if found != len(body.LineIDs) {
			response.Validation(w, map[string]string{"line_ids": "One or more lines do not belong to this sale."})
			return
		}

		if err := reverseSaleStockForLines(r.Context(), tx, tu.TenantID, body.LineIDs); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to reverse stock.", "ERR_INTERNAL")
			return
		}
		if err := reverseSaleLotForLines(r.Context(), tx, tu.TenantID, body.LineIDs); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to reverse lot qty.", "ERR_INTERNAL")
			return
		}
		if err := reverseSaleSerialsForLines(r.Context(), tx, tu.TenantID, salesID, body.LineIDs); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to reverse serials.", "ERR_INTERNAL")
			return
		}
		if err := voidWarrantyForSaleLines(r.Context(), tx, tu.TenantID, body.LineIDs); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to void warranty.", "ERR_INTERNAL")
			return
		}

		if err := deleteSalesOrderSlipsForLines(r.Context(), tx, tu.TenantID, body.LineIDs); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update sales order slips.", "ERR_INTERNAL")
			return
		}

		_, err = tx.Exec(r.Context(), `delete from public.sa_sales_lines where sales_id = $1 and id = any($2)`, salesID, body.LineIDs)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to remove lines.", "ERR_INTERNAL")
			return
		}

		if err := recomputeSaleTotals(r.Context(), tx, salesID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update totals.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to return lines.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales.return_lines", "sa_sales", &salesID, nil, body)
		sale, _ := loadSale(r.Context(), pool, tu.TenantID, salesID)
		response.OK(w, sale, "Lines returned.")
	}
}

func deleteSalesOrderSlipsForLines(ctx context.Context, tx pgx.Tx, tenantID int64, lineIDs []int64) error {
	rows, err := tx.Query(ctx, `
		select distinct ln.source_sales_order_line_id, ln.sales_id
		from public.sa_sales_lines ln
		where ln.id = any($1) and ln.source_sales_order_line_id is not null`, lineIDs)
	if err != nil {
		return err
	}
	defer rows.Close()

	type slipKey struct {
		soLineID int64
		salesID  int64
	}
	var keys []slipKey
	for rows.Next() {
		var k slipKey
		if err := rows.Scan(&k.soLineID, &k.salesID); err != nil {
			return err
		}
		keys = append(keys, k)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for _, k := range keys {
		_, err := tx.Exec(ctx, `
			delete from public.so_sales_order_slip_lines
			where sales_order_line_id = $1 and sales_id = $2`, k.soLineID, k.salesID)
		if err != nil {
			return err
		}
		var salesOrderID int64
		if err := tx.QueryRow(ctx,
			`select sales_order_id from public.so_sales_order_lines where id = $1`, k.soLineID).Scan(&salesOrderID); err != nil {
			continue
		}
		if err := recomputeSalesOrderFulfillmentStatus(ctx, tx, tenantID, salesOrderID); err != nil {
			return err
		}
	}
	return nil
}
