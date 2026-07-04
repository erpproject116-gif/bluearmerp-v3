package salesorder

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/attachmentx"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/taxcalc"
)

var ErrQuotationNotFound = errors.New("quotation not found")

type docflowValidationError struct {
	fields map[string]string
}

func (e *docflowValidationError) Error() string {
	return "validation failed"
}

func docflowValidation(fields map[string]string) error {
	return &docflowValidationError{fields: fields}
}

// CreateFromQuotation creates a sales order from a quotation using open quotation lines.
// If an SO already exists for the quotation, the existing id is returned.
func CreateFromQuotation(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, quotationID int64) (int64, error) {
	var existingID int64
	err := pool.QueryRow(ctx, `
		select id from public.so_sales_orders
		where tenant_id = $1 and source_quotation_id = $2 and deleted_at is null
		order by id desc limit 1`, tu.TenantID, quotationID).Scan(&existingID)
	if err == nil {
		return existingID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}

	var taxTypeID, currencyID, partnerID, locationID int64
	var picUserID, projectID *int64
	var picName string
	var projectName, reference, notes, paymentTerms *string
	err = pool.QueryRow(ctx, `
		select tax_type_id, currency_id, partner_id, pic_user_id, pic_name,
		  location_id, project_id, project_name, reference_no, notes, payment_terms
		from public.quo_quotations
		where id = $1 and tenant_id = $2 and deleted_at is null`,
		quotationID, tu.TenantID).Scan(
		&taxTypeID, &currencyID, &partnerID, &picUserID, &picName,
		&locationID, &projectID, &projectName, &reference, &notes, &paymentTerms,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, ErrQuotationNotFound
		}
		return 0, err
	}

	policy, err := processpolicy.Load(ctx, pool, tu.TenantID)
	if err != nil {
		return 0, err
	}
	quotationIDCopy := quotationID
	if vErrs := processpolicy.ValidateSalesOrderCreate(policy, &quotationIDCopy); vErrs != nil {
		return 0, docflowValidation(vErrs)
	}

	tt, err := loadTaxCalcType(ctx, pool, tu.TenantID, taxTypeID)
	if err != nil {
		return 0, fmt.Errorf("tax type not found: %w", err)
	}

	rows, err := pool.Query(ctx, `
		select ln.id, ln.line_no, ln.item_id, ln.item_code, ln.item_name, ln.description,
		  ln.qty::float8, ln.unit_vat_inc::float8, ln.remark,
		  coalesce(slip.fulfilled, 0)::float8
		from public.quo_quotation_lines ln
		left join (
		  select quotation_line_id, sum(qty) as fulfilled
		  from public.quo_quotation_slip_lines
		  group by quotation_line_id
		) slip on slip.quotation_line_id = ln.id
		where ln.quotation_id = $1
		order by ln.line_no`, quotationID)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	var lineBodies []salesOrderLineBody
	for rows.Next() {
		var quotationLineID int64
		var lineNo int
		var itemID *int64
		var itemCode, itemName string
		var description, remark *string
		var qty, unitVatInc, fulfilled float64
		if err := rows.Scan(&quotationLineID, &lineNo, &itemID, &itemCode, &itemName, &description,
			&qty, &unitVatInc, &remark, &fulfilled); err != nil {
			return 0, err
		}
		openQty := qty - fulfilled
		if openQty <= 0.0001 {
			continue
		}
		qLineID := quotationLineID
		lineBodies = append(lineBodies, salesOrderLineBody{
			LineNo:                lineNo,
			ItemID:                itemID,
			ItemCode:              itemCode,
			ItemName:              itemName,
			Description:           description,
			Qty:                   openQty,
			UnitPrice:             unitVatInc,
			InputBasis:            taxcalc.InputVatIncUnit,
			Remark:                remark,
			SourceQuotationLineID: &qLineID,
		})
	}
	if len(lineBodies) == 0 {
		return 0, docflowValidation(map[string]string{"lines": "No open lines available on this quotation."})
	}

	lineBodies = applyPartnerRatesToSOLines(ctx, pool, tu.TenantID, partnerID, lineBodies)
	computed, errs := computeSalesOrderLines(tt, lineBodies)
	if errs != nil {
		return 0, docflowValidation(errs)
	}
	if convErrs := validateQuotationConversion(ctx, pool, tu.TenantID, computed); convErrs != nil {
		return 0, docflowValidation(convErrs)
	}

	subtotal, taxTotal, grandTotal := sumSalesOrderTotals(computed)
	orderDate := time.Now()

	tx, err := pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	var dateSeq int
	var salesOrderNo string
	if err := tx.QueryRow(ctx,
		`select date_seq, sales_order_no from public.allocate_sales_order_sequences($1, $2::date)`,
		tu.TenantID, orderDate).Scan(&dateSeq, &salesOrderNo); err != nil {
		return 0, err
	}

	dateNoDisplay := formatDateNoDisplay(orderDate, dateSeq)

	var id int64
	err = tx.QueryRow(ctx, `
		insert into public.so_sales_orders (
		  tenant_id, order_date, date_seq, sales_order_no,
		  tax_type_id, currency_id, partner_id, pic_user_id, pic_name,
		  location_id, project_id, project_name,
		  reference, notes, payment_terms, progress_status,
		  subtotal, tax_total, grand_total, source_quotation_id, created_by_user_id
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'unconfirmed',$16,$17,$18,$19,$20)
		returning id`,
		tu.TenantID, orderDate, dateSeq, salesOrderNo,
		taxTypeID, currencyID, partnerID, picUserID, strings.TrimSpace(picName),
		locationID, projectID, projectName,
		reference, notes, paymentTerms,
		subtotal, taxTotal, grandTotal, quotationID, tu.AppUserID).Scan(&id)
	if err != nil {
		return 0, err
	}

	lineIDs, err := insertSalesOrderLines(ctx, tx, id, computed)
	if err != nil {
		return 0, err
	}

	if err := writeQuotationSlipsForSalesOrder(ctx, tx, tu.TenantID, id, salesOrderNo, dateNoDisplay, computed, lineIDs); err != nil {
		return 0, docflowValidation(map[string]string{"conversion": err.Error()})
	}

	if !policy.LegacyCombinedSORelease {
		reserveInputs := make([]soLineReserveInput, 0, len(computed))
		for i, ln := range computed {
			reserveInputs = append(reserveInputs, soLineReserveInput{
				LineID: lineIDs[i], ItemID: ln.ItemID, Qty: ln.Qty, Reserved: 0,
			})
		}
		if err := syncSalesOrderReservations(ctx, tx, tu.TenantID, locationID, tu.AppUserID, reserveInputs, policy.LegacyCombinedSORelease); err != nil {
			return 0, docflowValidation(map[string]string{"lines": err.Error()})
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}

	_ = audit.Log(ctx, pool, tu.TenantID, tu.AppUserID, "sales_order.create_from_quotation", "so_sales_order", &id, nil, map[string]any{"quotation_id": quotationID})

	// Carry the quotation's attachments along to the sales order (best-effort).
	_ = attachmentx.Copy(ctx, pool, attachmentx.CopyParams{
		SrcBaseDir: attachmentx.Dir("quotation"),
		DstBaseDir: attachmentx.Dir("sales_order"),
		SrcTable:   "public.quo_quotation_attachments",
		SrcFKCol:   "quotation_id",
		SrcID:      quotationID,
		DstTable:   "public.so_sales_order_attachments",
		DstFKCol:   "sales_order_id",
		DstID:      id,
		TenantID:   tu.TenantID,
	})
	return id, nil
}
