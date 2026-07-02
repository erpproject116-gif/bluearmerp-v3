package purchaseorder

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/taxcalc"
)

var ErrPurchaseRequestNotFound = errors.New("purchase request not found")

type CreateFromPROptions struct {
	OrderDate *string
	DateSeq   *int
	Reference *string
	Notes     *string
}

type docflowValidationError struct {
	fields map[string]string
}

func (e *docflowValidationError) Error() string {
	return "validation failed"
}

func docflowValidation(fields map[string]string) error {
	return &docflowValidationError{fields: fields}
}

func asDocflowValidation(err error) (map[string]string, bool) {
	var ve *docflowValidationError
	if errors.As(err, &ve) {
		return ve.fields, true
	}
	return nil, false
}

// CreateFromPurchaseRequest creates a purchase order from an approved purchase request.
// If a PO already exists for the PR, the existing id is returned.
func CreateFromPurchaseRequest(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, prID int64, opts CreateFromPROptions) (int64, error) {
	var existingID int64
	err := pool.QueryRow(ctx, `
		select po.id from public.po_purchase_orders po
		where po.tenant_id = $1 and po.purchase_request_id = $2 and po.deleted_at is null
		order by po.id desc limit 1`, tu.TenantID, prID).Scan(&existingID)
	if err == nil {
		return existingID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}

	var prTaxTypeID, prCurrencyID, prLocationID int64
	var prPartnerID, prPicUserID, prProjectID *int64
	var prPicName, prProgressStatus string
	var prProjectName, prReference, prNotes *string
	var prApprovedAt *time.Time
	err = pool.QueryRow(ctx, `
		select tax_type_id, currency_id, partner_id, pic_user_id, pic_name,
		  location_id, project_id, project_name, reference, notes, progress_status, approved_at
		from public.pr_purchase_requests
		where id = $1 and tenant_id = $2 and deleted_at is null`,
		prID, tu.TenantID).Scan(
		&prTaxTypeID, &prCurrencyID, &prPartnerID, &prPicUserID, &prPicName,
		&prLocationID, &prProjectID, &prProjectName, &prReference, &prNotes, &prProgressStatus, &prApprovedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, ErrPurchaseRequestNotFound
		}
		return 0, err
	}

	policy, err := processpolicy.Load(ctx, pool, tu.TenantID)
	if err != nil {
		return 0, err
	}
	if vErrs := processpolicy.ValidatePurchaseRequestForPO(policy, prProgressStatus, prApprovedAt); vErrs != nil {
		return 0, docflowValidation(vErrs)
	}

	orderDate := time.Now()
	if opts.OrderDate != nil && strings.TrimSpace(*opts.OrderDate) != "" {
		orderDate, err = parseDate(*opts.OrderDate)
		if err != nil {
			return 0, docflowValidation(map[string]string{"order_date": "Invalid date. Use YYYY-MM-DD."})
		}
	}

	tt, err := loadTaxCalcType(ctx, pool, tu.TenantID, prTaxTypeID)
	if err != nil {
		return 0, err
	}

	rows, err := pool.Query(ctx, `
		select ln.id, ln.line_no, ln.partner_id, ln.partner_code, ln.partner_name,
		  ln.item_id, ln.item_code, ln.item_name, ln.spec_name, ln.description,
		  ln.qty::float8, ln.input_basis, ln.unit_non_vat::float8, ln.unit_vat_inc::float8,
		  ln.remark, coalesce(sl.slipped, 0)::float8
		from public.pr_purchase_request_lines ln
		left join (
		  select purchase_request_line_id, sum(qty) as slipped
		  from public.pr_purchase_request_slip_lines
		  group by purchase_request_line_id
		) sl on sl.purchase_request_line_id = ln.id
		where ln.purchase_request_id = $1
		order by ln.line_no`, prID)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	var computed []computedLine
	lineNo := 0
	for rows.Next() {
		var prLineID int64
		var lnLineNo int
		var partnerID, itemID *int64
		var partnerCode, partnerName, itemCode, itemName string
		var specName, description, remark *string
		var qty, unitNonVat, unitVatInc, slipped float64
		var inputBasis string
		if err := rows.Scan(&prLineID, &lnLineNo, &partnerID, &partnerCode, &partnerName,
			&itemID, &itemCode, &itemName, &specName, &description,
			&qty, &inputBasis, &unitNonVat, &unitVatInc, &remark, &slipped); err != nil {
			return 0, err
		}
		openQty := qty - slipped
		if openQty <= 0 {
			continue
		}
		if inputBasis == "" {
			inputBasis = taxcalc.InputVatIncUnit
		}
		unitPrice := unitVatInc
		if inputBasis == taxcalc.InputNonVatUnit {
			unitPrice = unitNonVat
		}
		lineNo++
		amounts := taxcalc.ComputeLine(tt, unitPrice, openQty, inputBasis)
		prLineIDCopy := prLineID
		computed = append(computed, computedLine{
			LineNo:                lineNo,
			PurchaseRequestLineID: &prLineIDCopy,
			PartnerID:             partnerID,
			PartnerCode:           partnerCode,
			PartnerName:           partnerName,
			ItemID:                itemID,
			ItemCode:              itemCode,
			ItemName:              itemName,
			SpecName:              specName,
			Description:           description,
			Qty:                   openQty,
			InputBasis:            inputBasis,
			Amounts:               amounts,
			Remark:                remark,
		})
	}
	if len(computed) == 0 {
		return 0, docflowValidation(map[string]string{"lines": "No open lines available on this purchase request."})
	}

	headerPartnerID := resolveHeaderPartnerID(prPartnerID, computed)
	subtotal, taxTotal, grandTotal := sumPurchaseOrderTotals(computed)

	reference := prReference
	if opts.Reference != nil {
		reference = opts.Reference
	}
	notes := prNotes
	if opts.Notes != nil {
		notes = opts.Notes
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	dateSeq, purchaseOrderNo, seqErrs := allocatePurchaseOrderSequences(ctx, tx, tu.TenantID, orderDate, opts.DateSeq, 0)
	if seqErrs != nil {
		return 0, docflowValidation(seqErrs)
	}

	prIDCopy := prID
	var id int64
	err = tx.QueryRow(ctx, `
		insert into public.po_purchase_orders (
		  tenant_id, order_date, date_seq, purchase_order_no,
		  purchase_request_id, rfq_id, supplier_quotation_id, tax_type_id, currency_id, partner_id,
		  pic_user_id, pic_name, location_id, project_id, project_name,
		  status, reference, notes,
		  subtotal, tax_total, grand_total, created_by_user_id
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'draft',$16,$17,$18,$19,$20,$21)
		returning id`,
		tu.TenantID, orderDate, dateSeq, purchaseOrderNo,
		&prIDCopy, nil, nil, prTaxTypeID, prCurrencyID, headerPartnerID,
		prPicUserID, strings.TrimSpace(prPicName), prLocationID, prProjectID, prProjectName,
		reference, notes,
		subtotal, taxTotal, grandTotal, tu.AppUserID).Scan(&id)
	if err != nil {
		return 0, err
	}

	if _, err := insertPurchaseOrderLines(ctx, tx, id, computed); err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}

	_ = audit.Log(ctx, pool, tu.TenantID, tu.AppUserID, "purchase_order.create_from_pr", "po_purchase_order", &id, nil, map[string]any{"purchase_request_id": prID})
	return id, nil
}

// AsDocflowValidation extracts field validation errors from docflow service errors.
func AsDocflowValidation(err error) (map[string]string, bool) {
	return asDocflowValidation(err)
}
