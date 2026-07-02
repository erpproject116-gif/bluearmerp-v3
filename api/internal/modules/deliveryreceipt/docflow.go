package deliveryreceipt

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

var ErrSalesOrderNotFound = errors.New("sales order not found")

type docflowValidationError struct {
	fields map[string]string
}

func (e *docflowValidationError) Error() string {
	return "validation failed"
}

func docflowValidation(fields map[string]string) error {
	return &docflowValidationError{fields: fields}
}

// CreateFromSalesOrder creates a draft delivery receipt from undelivered released sales order lines.
// If a delivery receipt already exists for the sales order, the existing id is returned.
func CreateFromSalesOrder(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, soID int64) (int64, error) {
	var existingID int64
	err := pool.QueryRow(ctx, `
		select id from public.dr_delivery_receipts
		where tenant_id = $1 and sales_order_id = $2 and deleted_at is null
		order by id desc limit 1`, tu.TenantID, soID).Scan(&existingID)
	if err == nil {
		return existingID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}

	var partnerID, locationID int64
	err = pool.QueryRow(ctx, `
		select partner_id, location_id from public.so_sales_orders
		where id = $1 and tenant_id = $2 and deleted_at is null`,
		soID, tu.TenantID).Scan(&partnerID, &locationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, ErrSalesOrderNotFound
		}
		return 0, err
	}

	rows, err := pool.Query(ctx, `
		select ln.id, rl.id,
		  (coalesce(rl.release_qty, rel.total_released) - coalesce(dr.delivered, 0))::float8
		from public.so_sales_order_lines ln
		join public.so_sales_orders so on so.id = ln.sales_order_id
		left join (
		  select sales_order_line_id, sum(release_qty) as total_released
		  from public.so_sales_order_release_lines
		  group by sales_order_line_id
		) rel on rel.sales_order_line_id = ln.id
		left join public.so_sales_order_release_lines rl on rl.sales_order_line_id = ln.id
		left join (
		  select sales_order_line_id, sum(qty) as delivered
		  from public.so_sales_order_slip_lines
		  where slip_type = 'delivery_receipt'
		  group by sales_order_line_id
		) dr on dr.sales_order_line_id = ln.id
		where so.id = $1 and so.tenant_id = $2 and so.deleted_at is null
		  and coalesce(rel.total_released, 0) > 0.0001
		  and (coalesce(rl.release_qty, rel.total_released) - coalesce(dr.delivered, 0)) > 0.0001
		order by ln.line_no asc, rl.id asc nulls last`, soID, tu.TenantID)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	type drLineInput struct {
		SalesOrderLineID        int64
		SalesOrderReleaseLineID *int64
		Qty                     float64
	}
	var lineInputs []drLineInput
	for rows.Next() {
		var soLineID int64
		var releaseLineID *int64
		var balance float64
		if err := rows.Scan(&soLineID, &releaseLineID, &balance); err != nil {
			return 0, err
		}
		lineInputs = append(lineInputs, drLineInput{
			SalesOrderLineID:        soLineID,
			SalesOrderReleaseLineID: releaseLineID,
			Qty:                     balance,
		})
	}
	if len(lineInputs) == 0 {
		return 0, docflowValidation(map[string]string{"lines": "No undelivered released lines available on this sales order."})
	}

	deliveryDate := time.Now()

	tx, err := pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	var dateSeq int
	var deliveryNo string
	if err := tx.QueryRow(ctx,
		`select date_seq, delivery_no from public.allocate_dr_delivery_receipt_sequences($1, $2::date)`,
		tu.TenantID, deliveryDate).Scan(&dateSeq, &deliveryNo); err != nil {
		return 0, err
	}

	soIDCopy := soID
	var drID int64
	err = tx.QueryRow(ctx, `
		insert into public.dr_delivery_receipts (
		  tenant_id, delivery_date, date_seq, delivery_no, sales_order_id,
		  partner_id, location_id, status, created_by_user_id
		) values ($1, $2, $3, $4, $5, $6, $7, 'draft', $8)
		returning id`,
		tu.TenantID, deliveryDate, dateSeq, deliveryNo, soIDCopy,
		partnerID, locationID, tu.AppUserID).Scan(&drID)
	if err != nil {
		return 0, err
	}

	for i, ln := range lineInputs {
		balance, err := undeliveredBalance(ctx, tx, tu.TenantID, ln.SalesOrderLineID)
		if err != nil {
			return 0, docflowValidation(map[string]string{fmt.Sprintf("lines[%d].sales_order_line_id", i): "Line not found."})
		}
		if ln.Qty > balance+0.0001 {
			return 0, docflowValidation(map[string]string{fmt.Sprintf("lines[%d].qty", i): fmt.Sprintf("Exceeds undelivered balance (%.4f).", balance)})
		}
		var itemID *int64
		var itemCode, itemName string
		if err := tx.QueryRow(ctx, `
			select item_id, item_code, item_name from public.so_sales_order_lines where id = $1`,
			ln.SalesOrderLineID).Scan(&itemID, &itemCode, &itemName); err != nil {
			return 0, docflowValidation(map[string]string{fmt.Sprintf("lines[%d].sales_order_line_id", i): "Line not found."})
		}
		_, err = tx.Exec(ctx, `
			insert into public.dr_delivery_receipt_lines (
			  delivery_receipt_id, sales_order_line_id, sales_order_release_line_id,
			  line_no, item_id, item_code, item_name, qty
			) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
			drID, ln.SalesOrderLineID, ln.SalesOrderReleaseLineID, i+1, itemID, itemCode, itemName, ln.Qty)
		if err != nil {
			return 0, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}

	_ = audit.Log(ctx, pool, tu.TenantID, tu.AppUserID, "delivery_receipt.create_from_sales_order", "dr_delivery_receipt", &drID, nil, map[string]any{"sales_order_id": soID})
	return drID, nil
}
