package purchaserequest

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/taxcalc"
)

// ErrSalesOrderNotFound is returned when the source sales order does not exist.
var ErrSalesOrderNotFound = errors.New("sales order not found")

type docflowValidationError struct {
	fields map[string]string
}

func (e *docflowValidationError) Error() string { return "validation failed" }

func docflowValidation(fields map[string]string) error {
	return &docflowValidationError{fields: fields}
}

// AsDocflowValidation extracts field validation errors from docflow service errors.
func AsDocflowValidation(err error) (map[string]string, bool) {
	var ve *docflowValidationError
	if errors.As(err, &ve) {
		return ve.fields, true
	}
	return nil, false
}

// CreateFromSalesOrder creates a draft Purchase Request from a Sales Order's open lines.
// This is the selling -> buying pass-down: it records source references for traceability
// but does NOT touch so_sales_order_slip_lines, so it never reduces the sales-fulfillment
// balance of the Sales Order. If a PR already exists for the SO, the existing id is returned.
func CreateFromSalesOrder(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, soID int64) (int64, error) {
	var existingID int64
	err := pool.QueryRow(ctx, `
		select id from public.pr_purchase_requests
		where tenant_id = $1 and source_sales_order_id = $2 and deleted_at is null
		order by id desc limit 1`, tu.TenantID, soID).Scan(&existingID)
	if err == nil {
		return existingID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}

	var taxTypeID, currencyID, partnerID, locationID int64
	var picUserID, projectID *int64
	var picName string
	var projectName, reference, notes *string
	err = pool.QueryRow(ctx, `
		select tax_type_id, currency_id, partner_id, pic_user_id, pic_name,
		  location_id, project_id, project_name, reference, notes
		from public.so_sales_orders
		where id = $1 and tenant_id = $2 and deleted_at is null`,
		soID, tu.TenantID).Scan(
		&taxTypeID, &currencyID, &partnerID, &picUserID, &picName,
		&locationID, &projectID, &projectName, &reference, &notes,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, ErrSalesOrderNotFound
		}
		return 0, err
	}

	tt, err := loadTaxCalcType(ctx, pool, tu.TenantID, taxTypeID)
	if err != nil {
		return 0, err
	}

	rows, err := pool.Query(ctx, `
		select ln.id, ln.line_no, ln.item_id, ln.item_code, ln.item_name, ln.description,
		  ln.qty::float8, ln.unit_vat_inc::float8, ln.remark,
		  coalesce(req.requested, 0)::float8
		from public.so_sales_order_lines ln
		left join (
		  select source_sales_order_line_id, sum(qty) as requested
		  from public.pr_purchase_request_lines
		  where source_sales_order_line_id is not null
		  group by source_sales_order_line_id
		) req on req.source_sales_order_line_id = ln.id
		where ln.sales_order_id = $1
		order by ln.line_no`, soID)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	var computed []computedLine
	lineNo := 0
	for rows.Next() {
		var soLineID int64
		var lnLineNo int
		var itemID *int64
		var itemCode, itemName string
		var description, remark *string
		var qty, unitVatInc, requested float64
		if err := rows.Scan(&soLineID, &lnLineNo, &itemID, &itemCode, &itemName, &description,
			&qty, &unitVatInc, &remark, &requested); err != nil {
			return 0, err
		}
		openQty := qty - requested
		if openQty <= 0.0001 {
			continue
		}
		lineNo++
		amounts := taxcalc.ComputeLine(tt, unitVatInc, openQty, taxcalc.InputVatIncUnit)
		soLineIDCopy := soLineID
		computed = append(computed, computedLine{
			LineNo:                 lineNo,
			ItemID:                 itemID,
			ItemCode:               itemCode,
			ItemName:               itemName,
			Description:            description,
			Qty:                    openQty,
			InputBasis:             taxcalc.InputVatIncUnit,
			Amounts:                amounts,
			Remark:                 remark,
			SourceSalesOrderLineID: &soLineIDCopy,
		})
	}
	if len(computed) == 0 {
		return 0, docflowValidation(map[string]string{"lines": "No open lines available on this sales order."})
	}

	headerPartnerID := &partnerID
	if partnerID <= 0 {
		headerPartnerID = nil
	}
	subtotal, taxTotal, grandTotal := sumPurchaseRequestTotals(computed)
	totalQty := sumLineQty(computed)
	requestDate := time.Now()
	soIDCopy := soID

	tx, err := pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	dateSeq, purchaseRequestNo, seqErrs := allocatePurchaseRequestSequences(ctx, tx, tu.TenantID, requestDate, nil, 0)
	if seqErrs != nil {
		return 0, docflowValidation(seqErrs)
	}

	var id int64
	err = tx.QueryRow(ctx, `
		insert into public.pr_purchase_requests (
		  tenant_id, request_date, date_seq, purchase_request_no,
		  tax_type_id, currency_id, partner_id, pic_user_id, pic_name,
		  location_id, project_id, project_name, cc, domestic_foreign, send_status,
		  progress_status, total_qty, reference, notes,
		  subtotal, tax_total, grand_total, source_sales_order_id, created_by_user_id
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'domestic','unsent','unconfirmed',$14,$15,$16,$17,$18,$19,$20,$21)
		returning id`,
		tu.TenantID, requestDate, dateSeq, purchaseRequestNo,
		taxTypeID, currencyID, headerPartnerID, picUserID, strings.TrimSpace(picName),
		locationID, projectID, projectName, nil,
		totalQty, reference, notes,
		subtotal, taxTotal, grandTotal, soIDCopy, tu.AppUserID).Scan(&id)
	if err != nil {
		return 0, err
	}

	if _, err := insertPurchaseRequestLines(ctx, tx, id, computed); err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}

	_ = audit.Log(ctx, pool, tu.TenantID, tu.AppUserID, "purchase_request.create_from_sales_order", "pr_purchase_request", &id, nil, map[string]any{"sales_order_id": soID})
	return id, nil
}
