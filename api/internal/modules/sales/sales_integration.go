package sales

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/inventory"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth/datascope"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/fulfillment"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/openlines"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// salesUsesDeliveryBalance is true only when split fulfillment is on AND the
// tenant requires a Delivery Receipt before invoicing. Otherwise Sales can draw
// against ordered residual (Load Slip / Convert from SO).
func salesUsesDeliveryBalance(p processpolicy.Policy) bool {
	return !p.LegacyCombinedSORelease && p.SalesRequireDeliveryReceipt
}

type openSalesOrderLineRow struct {
	SalesOrderID         int64   `json:"sales_order_id"`
	SalesOrderLineID     int64   `json:"sales_order_line_id"`
	DateNoDisplay        string  `json:"date_no_display"`
	SalesOrderNo         string  `json:"sales_order_no"`
	ProgressStatus       string  `json:"progress_status"`
	CustomerName         string  `json:"customer_name"`
	LocationID           int64   `json:"location_id"`
	LocationName         string  `json:"location_name"`
	PartnerID            int64   `json:"partner_id"`
	TaxTypeID            int64   `json:"tax_type_id"`
	CurrencyID           int64   `json:"currency_id"`
	PicName              string  `json:"pic_name"`
	ProjectID            *int64  `json:"project_id,omitempty"`
	ProjectName          string  `json:"project_name"`
	PaymentTerms         string  `json:"payment_terms"`
	Notes                string  `json:"notes"`
	ItemID               *int64  `json:"item_id,omitempty"`
	ItemCode             string  `json:"item_code"`
	ItemName             string  `json:"item_name"`
	Description          *string `json:"description,omitempty"`
	ReleasedQty          float64 `json:"released_qty"`
	DeliveredQty         float64 `json:"delivered_qty"`
	BalanceQty           float64 `json:"balance_qty"`
	UnitID               *int64  `json:"unit_id,omitempty"`
	UnitCode             *string `json:"unit_code,omitempty"`
	UnitVatInc           float64 `json:"unit_vat_inc"`
	Remark               *string `json:"remark,omitempty"`
	TrackSerial          bool    `json:"track_serial,omitempty"`
}

func listOpenSalesOrderLines(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		// New Sales Load Slip: only Completed SOs may be invoiced (Confirm / In progress is not enough).
		p := httputil.ParseListParams(r, "order_date", map[string]string{
			"order_date":     "so.order_date",
			"sales_order_no": "so.sales_order_no",
			"customer_name":  "p.company_name",
			"item_code":      "ln.item_code",
		})
		pageSize := openlines.PageSize(r, p.PageSize)
		offset := (p.Page - 1) * pageSize

		// Open residual = ordered − already invoiced (serial release still enforced on Save).
		where := `so.tenant_id = $1 and so.deleted_at is null
			and so.progress_status = 'completed'
			and (ln.qty - coalesce(slip.sold, 0)) > 0.0001`
		args := []any{tu.TenantID}
		argN := 2

		if p.Q != "" {
			where += fmt.Sprintf(` and (
				so.sales_order_no ilike $%d or p.company_name ilike $%d or
				coalesce(p.partner_code, '') ilike $%d or
				ln.item_code ilike $%d or ln.item_name ilike $%d or
				coalesce(ln.remark, '') ilike $%d)`, argN, argN, argN, argN, argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}

		f := openlines.ParseFilters(r, 0)
		where, args, argN = f.Apply(where, args, argN, "so.partner_id", "so.order_date", "so.sales_order_no")

		dsScope, argN, err := datascope.ApplyUserScopesSQL(r.Context(), pool, tu, datascope.ListFilter{
			CustomerColumn: "so.partner_id",
			LocationColumn: "so.location_id",
		}, argN, &args)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to apply data scopes.", "ERR_INTERNAL")
			return
		}
		where += dsScope

		q := fmt.Sprintf(`
			select so.id, ln.id, so.order_date, so.date_seq, so.sales_order_no, so.progress_status,
			  p.company_name, so.location_id, l.location_name, so.partner_id,
			  so.tax_type_id, so.currency_id, so.pic_name,
			  so.project_id, coalesce(so.project_name, ''),
			  coalesce(so.payment_terms, ''), coalesce(so.notes, ''),
			  ln.item_id, ln.item_code, ln.item_name, ln.description,
			  coalesce(rel.released, 0)::float8,
			  coalesce(dr.delivered, 0)::float8,
			  (ln.qty - coalesce(slip.sold, 0))::float8,
			  ln.unit_id, ln.unit_code,
			  ln.unit_vat_inc::float8, ln.remark,
			  coalesce(i.track_serial, false),
			  count(*) over()
			from public.so_sales_orders so
			join public.inv_partners p on p.id = so.partner_id
			join public.inv_locations l on l.id = so.location_id
			join public.so_sales_order_lines ln on ln.sales_order_id = so.id
			left join public.inv_items i on i.id = ln.item_id
			left join (
			  select sales_order_line_id, sum(release_qty) as released
			  from public.so_sales_order_release_lines
			  group by sales_order_line_id
			) rel on rel.sales_order_line_id = ln.id
			left join (
			  select sales_order_line_id, sum(qty) as delivered
			  from public.so_sales_order_slip_lines
			  where slip_type = 'delivery_receipt'
			  group by sales_order_line_id
			) dr on dr.sales_order_line_id = ln.id
			left join (
			  select sales_order_line_id, sum(qty) as sold
			  from public.so_sales_order_slip_lines
			  where slip_type = 'sales'
			  group by sales_order_line_id
			) slip on slip.sales_order_line_id = ln.id
			where %s
			order by so.order_date desc, ln.line_no asc
			limit $%d offset $%d`, where, argN, argN+1)
		args = append(args, pageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list sales order lines.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []openSalesOrderLineRow
		var total int64
		for rows.Next() {
			var row openSalesOrderLineRow
			var orderDate time.Time
			var dateSeq int
			if err := rows.Scan(
				&row.SalesOrderID, &row.SalesOrderLineID, &orderDate, &dateSeq, &row.SalesOrderNo, &row.ProgressStatus,
				&row.CustomerName, &row.LocationID, &row.LocationName, &row.PartnerID,
				&row.TaxTypeID, &row.CurrencyID, &row.PicName,
				&row.ProjectID, &row.ProjectName, &row.PaymentTerms, &row.Notes,
				&row.ItemID, &row.ItemCode, &row.ItemName, &row.Description,
				&row.ReleasedQty, &row.DeliveredQty, &row.BalanceQty,
				&row.UnitID, &row.UnitCode,
				&row.UnitVatInc, &row.Remark, &row.TrackSerial, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read sales order lines.", "ERR_INTERNAL")
				return
			}
			row.DateNoDisplay = formatDateNoDisplay(orderDate, dateSeq)
			out = append(out, row)
		}
		if out == nil {
			out = []openSalesOrderLineRow{}
		}
		response.OKList(w, out, p.Page, pageSize, total)
	}
}

func balanceExpr(useDelivery bool) string {
	if useDelivery {
		return "coalesce(dr.delivered, 0) - coalesce(slip.sold, 0)"
	}
	// Legacy: ordered residual for normal items; released residual for serial-tracked lines.
	return `case when coalesce(i.track_serial, false)
		then coalesce(rel.released, 0) - coalesce(slip.sold, 0)
		else ln.qty - coalesce(slip.sold, 0) end`
}

func soMustBeCompletedForSaleMessage() string {
	return "Sales order progress must be Completed before creating a New Sale (Confirm / In progress is not enough)."
}

func zeroBalanceMessage(useDelivery bool) string {
	if useDelivery {
		return "No delivered balance available. Post a Delivery Receipt against the Completed sales order first."
	}
	return "No open sales order quantity available. For serial-tracked items, release quantity on Pick List first."
}

func salesOrderLineQtyError(balance, qty float64) string {
	if qty > balance+0.0001 {
		return fmt.Sprintf("Exceeds available balance (%.4f).", balance)
	}
	return ""
}

type releaseSoldLine struct {
	released float64
	sold     float64
}

func computeSalesOrderFulfillmentStatus(lines []releaseSoldLine) string {
	totalReleasedLines := 0
	fullySold := 0
	anySold := false
	for _, ln := range lines {
		if ln.released <= 0.0001 {
			continue
		}
		totalReleasedLines++
		if ln.sold > 0.0001 {
			anySold = true
		}
		if ln.sold+0.0001 >= ln.released {
			fullySold++
		}
	}
	status := "none"
	if anySold {
		status = "partial"
	}
	if totalReleasedLines > 0 && fullySold == totalReleasedLines {
		status = "completed"
	}
	return status
}

func salesOrderLineBalance(ctx context.Context, tx pgx.Tx, tenantID, salesOrderLineID int64, useDelivery bool) (float64, error) {
	var balance float64
	err := tx.QueryRow(ctx, fmt.Sprintf(`
		select (%s)::float8
		from public.so_sales_order_lines ln
		join public.so_sales_orders so on so.id = ln.sales_order_id
		left join public.inv_items i on i.id = ln.item_id
		left join (
		  select sales_order_line_id, sum(release_qty) as released
		  from public.so_sales_order_release_lines
		  group by sales_order_line_id
		) rel on rel.sales_order_line_id = ln.id
		left join (
		  select sales_order_line_id, sum(qty) as delivered
		  from public.so_sales_order_slip_lines
		  where slip_type = 'delivery_receipt'
		  group by sales_order_line_id
		) dr on dr.sales_order_line_id = ln.id
		left join (
		  select sales_order_line_id, sum(qty) as sold
		  from public.so_sales_order_slip_lines
		  where slip_type = 'sales'
		  group by sales_order_line_id
		) slip on slip.sales_order_line_id = ln.id
		where ln.id = $1 and so.tenant_id = $2 and so.deleted_at is null`,
		balanceExpr(useDelivery)), salesOrderLineID, tenantID).Scan(&balance)
	return balance, err
}

func validateSalesOrderConversion(ctx context.Context, pool *pgxpool.Pool, tenantID int64, lines []computedLine) map[string]string {
	policy, err := processpolicy.Load(ctx, pool, tenantID)
	if err != nil {
		return map[string]string{"body": "Failed to load process policies."}
	}
	useDelivery := salesUsesDeliveryBalance(policy)
	errs := map[string]string{}
	for i, ln := range lines {
		if ln.SourceSalesOrderLineID == nil {
			continue
		}
		var balance float64
		var progress string
		err := pool.QueryRow(ctx, fmt.Sprintf(`
			select (%s)::float8, so.progress_status
			from public.so_sales_order_lines ln
			join public.so_sales_orders so on so.id = ln.sales_order_id
			left join public.inv_items i on i.id = ln.item_id
			left join (
			  select sales_order_line_id, sum(release_qty) as released
			  from public.so_sales_order_release_lines
			  group by sales_order_line_id
			) rel on rel.sales_order_line_id = ln.id
			left join (
			  select sales_order_line_id, sum(qty) as delivered
			  from public.so_sales_order_slip_lines
			  where slip_type = 'delivery_receipt'
			  group by sales_order_line_id
			) dr on dr.sales_order_line_id = ln.id
			left join (
			  select sales_order_line_id, sum(qty) as sold
			  from public.so_sales_order_slip_lines
			  where slip_type = 'sales'
			  group by sales_order_line_id
			) slip on slip.sales_order_line_id = ln.id
			where ln.id = $1 and so.tenant_id = $2 and so.deleted_at is null`,
			balanceExpr(useDelivery)), *ln.SourceSalesOrderLineID, tenantID).Scan(&balance, &progress)
		if err != nil {
			errs[fmt.Sprintf("lines[%d].source_sales_order_line_id", i)] = "Sales order line not found."
			continue
		}
		if progress != "completed" {
			errs[fmt.Sprintf("lines[%d].source_sales_order_line_id", i)] = soMustBeCompletedForSaleMessage()
			continue
		}
		if balance <= 0.0001 {
			msg := zeroBalanceMessage(useDelivery)
			errs[fmt.Sprintf("lines[%d].source_sales_order_line_id", i)] = msg
			continue
		}
		if msg := salesOrderLineQtyError(balance, ln.Qty); msg != "" {
			errs[fmt.Sprintf("lines[%d].qty", i)] = msg
			continue
		}
		if useDelivery {
			var delivered float64
			_ = pool.QueryRow(ctx, `
				select coalesce(delivered_qty, 0)::float8 from public.so_sales_order_lines where id = $1`,
				*ln.SourceSalesOrderLineID).Scan(&delivered)
			if vErr := processpolicy.ValidateSalesInvoiceQtyAgainstDelivery(policy, ln.Qty, delivered); vErr != nil {
				for k, msg := range vErr {
					errs[fmt.Sprintf("lines[%d].%s", i, k)] = msg
				}
			}
		}
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func writeSalesOrderSlipsForSales(ctx context.Context, tx pgx.Tx, tenantID, salesID, userID int64, salesNo, dateNoDisplay string, lines []computedLine, useDelivery bool) error {
	salesOrderIDs := map[int64]struct{}{}
	for i, ln := range lines {
		if ln.SourceSalesOrderLineID == nil {
			continue
		}
		if !useDelivery {
			if err := ensureLegacyReleaseForInvoice(ctx, tx, tenantID, userID, *ln.SourceSalesOrderLineID, ln.Qty); err != nil {
				return fmt.Errorf("Line %d: %w", i+1, err)
			}
		}
		balance, err := salesOrderLineBalance(ctx, tx, tenantID, *ln.SourceSalesOrderLineID, useDelivery)
		if err != nil {
			return errors.New("Sales order line not found for conversion.")
		}
		if ln.Qty > balance+0.0001 {
			return fmt.Errorf("Line %d exceeds available balance.", i+1)
		}
		slipRef := salesNo
		_, err = tx.Exec(ctx, `
			insert into public.so_sales_order_slip_lines
			  (sales_order_line_id, slip_type, slip_ref, slip_date_no, qty, sales_id)
			values ($1, 'sales', $2, $3, $4, $5)`,
			*ln.SourceSalesOrderLineID, slipRef, dateNoDisplay, ln.Qty, salesID)
		if err != nil {
			return err
		}

		if err := fulfillment.SyncSOLineQty(ctx, tx, *ln.SourceSalesOrderLineID); err != nil {
			return err
		}

		var salesOrderID int64
		if err := tx.QueryRow(ctx,
			`select sales_order_id from public.so_sales_order_lines where id = $1`,
			*ln.SourceSalesOrderLineID).Scan(&salesOrderID); err == nil {
			salesOrderIDs[salesOrderID] = struct{}{}
		}
	}

	for soid := range salesOrderIDs {
		if err := recomputeSalesOrderFulfillmentStatus(ctx, tx, tenantID, soid); err != nil {
			return err
		}
	}
	return nil
}

// ensureLegacyReleaseForInvoice creates Pick List release rows (and stock deduction) when
// invoicing ordered SO qty that was never released — skip-friendly legacy combined mode.
func ensureLegacyReleaseForInvoice(ctx context.Context, tx pgx.Tx, tenantID, userID, salesOrderLineID int64, invoiceQty float64) error {
	var locationID int64
	var itemID *int64
	var released, sold float64
	var trackInventory, trackSerial bool
	err := tx.QueryRow(ctx, `
		select so.location_id, ln.item_id,
		  coalesce(rel.released, 0)::float8,
		  coalesce(slip.sold, 0)::float8,
		  coalesce(i.track_inventory_qty, false),
		  coalesce(i.track_serial, false)
		from public.so_sales_order_lines ln
		join public.so_sales_orders so on so.id = ln.sales_order_id
		left join public.inv_items i on i.id = ln.item_id
		left join (
		  select sales_order_line_id, sum(release_qty) as released
		  from public.so_sales_order_release_lines
		  group by sales_order_line_id
		) rel on rel.sales_order_line_id = ln.id
		left join (
		  select sales_order_line_id, sum(qty) as sold
		  from public.so_sales_order_slip_lines
		  where slip_type = 'sales'
		  group by sales_order_line_id
		) slip on slip.sales_order_line_id = ln.id
		where ln.id = $1 and so.tenant_id = $2 and so.deleted_at is null
		  and so.progress_status = 'completed'`,
		salesOrderLineID, tenantID,
	).Scan(&locationID, &itemID, &released, &sold, &trackInventory, &trackSerial)
	if err != nil {
		return errors.New(soMustBeCompletedForSaleMessage())
	}

	availableReleased := released - sold
	if availableReleased+0.0001 >= invoiceQty {
		return nil
	}
	shortfall := invoiceQty - availableReleased
	if shortfall <= 0.0001 {
		return nil
	}
	if trackSerial {
		return errors.New("serial-tracked items require Sales Order → Pick List release before invoicing")
	}

	var releaseLineID int64
	err = tx.QueryRow(ctx, `
		insert into public.so_sales_order_release_lines
		  (sales_order_line_id, location_id, release_date, release_qty, created_by_user_id)
		values ($1, $2, current_date, $3, $4)
		returning id`,
		salesOrderLineID, locationID, shortfall, userID,
	).Scan(&releaseLineID)
	if err != nil {
		return errors.New("failed to auto-release sales order quantity")
	}

	if trackInventory && itemID != nil {
		if err := inventory.DeductOnHandStock(ctx, tx, tenantID, *itemID, locationID, shortfall); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `
			insert into public.inv_stock_movements
			  (tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, created_by_user_id)
			values ($1, $2, $3, $4, 'so_release', 'so_release_line', $5, $6)`,
			tenantID, *itemID, locationID, -shortfall, releaseLineID, userID)
		if err != nil {
			return errors.New("failed to record stock movement for auto-release")
		}
	}
	return nil
}

func recomputeSalesOrderFulfillmentStatus(ctx context.Context, tx pgx.Tx, tenantID, salesOrderID int64) error {
	var lines []releaseSoldLine

	rows, err := tx.Query(ctx, `
		select coalesce(rel.released, 0)::float8, coalesce(slip.sold, 0)::float8
		from public.so_sales_order_lines ln
		left join (
		  select sales_order_line_id, sum(release_qty) as released
		  from public.so_sales_order_release_lines
		  group by sales_order_line_id
		) rel on rel.sales_order_line_id = ln.id
		left join (
		  select sales_order_line_id, sum(qty) as sold
		  from public.so_sales_order_slip_lines
		  group by sales_order_line_id
		) slip on slip.sales_order_line_id = ln.id
		where ln.sales_order_id = $1`, salesOrderID)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var released, sold float64
		if err := rows.Scan(&released, &sold); err != nil {
			return err
		}
		lines = append(lines, releaseSoldLine{released: released, sold: sold})
	}

	status := computeSalesOrderFulfillmentStatus(lines)

	_, err = tx.Exec(ctx, `
		update public.so_sales_orders
		set fulfillment_status = $1, updated_at = now()
		where id = $2 and tenant_id = $3`,
		status, salesOrderID, tenantID)
	return err
}
