package finance

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/inventory"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/attachmentx"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/fulfillment"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/taxcalc"
)

var ErrGoodsReceiptNotFound = errors.New("goods receipt not found")

type docflowValidationError struct {
	fields map[string]string
}

func (e *docflowValidationError) Error() string {
	return "validation failed"
}

func docflowValidation(fields map[string]string) error {
	return &docflowValidationError{fields: fields}
}

// ValidationFields returns field messages when err is a docflow validation error.
func ValidationFields(err error) map[string]string {
	var ve *docflowValidationError
	if errors.As(err, &ve) {
		return ve.fields
	}
	return nil
}

// CreateSupplierInvoiceFromGoodsReceipt creates a supplier invoice from open goods receipt lines.
// If a supplier invoice already exists for the goods receipt, the existing id is returned.
func CreateSupplierInvoiceFromGoodsReceipt(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, grID int64) (int64, error) {
	var existingID int64
	err := pool.QueryRow(ctx, `
		select si.id
		from public.fin_supplier_invoices si
		where si.tenant_id = $1 and si.deleted_at is null
		  and exists (
		    select 1
		    from public.fin_supplier_invoice_lines sil
		    join public.gr_goods_receipt_lines grl on grl.id = sil.goods_receipt_line_id
		    where sil.supplier_invoice_id = si.id and grl.goods_receipt_id = $2
		  )
		order by si.id desc limit 1`, tu.TenantID, grID).Scan(&existingID)
	if err == nil {
		return existingID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}

	var receiptDate time.Time
	var grStatus string
	var partnerID, currencyID, taxTypeID int64
	err = pool.QueryRow(ctx, `
		select gr.receipt_date, gr.status, po.partner_id, po.currency_id, po.tax_type_id
		from public.gr_goods_receipts gr
		join public.po_purchase_orders po on po.id = gr.purchase_order_id
		where gr.id = $1 and gr.tenant_id = $2`, grID, tu.TenantID).Scan(
		&receiptDate, &grStatus, &partnerID, &currencyID, &taxTypeID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, ErrGoodsReceiptNotFound
		}
		return 0, err
	}
	if grStatus != "posted" {
		return 0, docflowValidation(map[string]string{"goods_receipt_id": "Goods receipt must be posted before invoicing."})
	}

	policy, err := processpolicy.Load(ctx, pool, tu.TenantID)
	if err != nil {
		return 0, err
	}

	tt, err := loadTaxCalcType(ctx, pool, tu.TenantID, taxTypeID)
	if err != nil {
		return 0, fmt.Errorf("tax type not found: %w", err)
	}

	rows, err := pool.Query(ctx, `
		select grl.id,
		  (grl.received_qty - coalesce(sl.billed, 0))::float8,
		  pol.unit_non_vat::float8, pol.unit_vat_inc::float8
		from public.gr_goods_receipt_lines grl
		join public.gr_goods_receipts gr on gr.id = grl.goods_receipt_id
		join public.po_purchase_order_lines pol on pol.id = grl.purchase_order_line_id
		left join (
		  select goods_receipt_line_id, sum(qty) as billed
		  from public.gr_goods_receipt_slip_lines
		  where slip_type = 'supplier_invoice'
		  group by goods_receipt_line_id
		) sl on sl.goods_receipt_line_id = grl.id
		where gr.id = $1 and gr.tenant_id = $2
		  and (grl.received_qty - coalesce(sl.billed, 0)) > 0.0001
		order by grl.line_no`, grID, tu.TenantID)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	var invLines []supplierInvoiceLineBody
	for rows.Next() {
		var grLineID int64
		var balance, unitNonVat, unitVatInc float64
		if err := rows.Scan(&grLineID, &balance, &unitNonVat, &unitVatInc); err != nil {
			return 0, err
		}
		amounts := taxcalc.ComputeLine(tt, unitVatInc, balance, taxcalc.InputVatIncUnit)
		grLineIDCopy := grLineID
		invLines = append(invLines, supplierInvoiceLineBody{
			GoodsReceiptLineID: &grLineIDCopy,
			Qty:                balance,
			UnitNonVat:         unitNonVat,
			NonVatTotal:        amounts.NonVatTotal,
			TaxAmount:          amounts.TaxAmount,
			UnitVatInc:         amounts.UnitVatInc,
			LineTotal:          amounts.LineTotal,
		})
	}
	if len(invLines) == 0 {
		return 0, docflowValidation(map[string]string{"lines": "No open lines available on this goods receipt."})
	}

	body := supplierInvoiceBody{
		InvoiceDate: receiptDate.Format("2006-01-02"),
		PartnerID:   partnerID,
		CurrencyID:  currencyID,
		Lines:       invLines,
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	if errs := validateSupplierInvoiceLines(ctx, tx, tu.TenantID, body.PartnerID, policy, body.Lines); errs != nil {
		return 0, docflowValidation(errs)
	}

	subtotal, taxTotal, grandTotal := sumSupplierInvoiceTotals(body.Lines)

	var dateSeq int
	var invoiceNo string
	if err := tx.QueryRow(ctx,
		`select date_seq, invoice_no from public.allocate_fin_supplier_invoice_sequences($1, $2::date)`,
		tu.TenantID, receiptDate).Scan(&dateSeq, &invoiceNo); err != nil {
		return 0, err
	}

	var id int64
	err = tx.QueryRow(ctx, `
		insert into public.fin_supplier_invoices (
		  tenant_id, invoice_date, date_seq, invoice_no,
		  partner_id, currency_id,
		  subtotal, tax_total, grand_total, progress_status, created_by_user_id
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'completed',$10)
		returning id`,
		tu.TenantID, receiptDate, dateSeq, invoiceNo,
		body.PartnerID, body.CurrencyID,
		subtotal, taxTotal, grandTotal, tu.AppUserID).Scan(&id)
	if err != nil {
		return 0, err
	}

	dateNoDisplay := formatDateNoDisplay(receiptDate, dateSeq)
	for i, ln := range body.Lines {
		lineNo := i + 1
		var itemID *int64
		var itemCode, itemName string
		var poLineID *int64
		var unitID *int64
		var unitCode string
		if ln.GoodsReceiptLineID != nil && *ln.GoodsReceiptLineID > 0 {
			_, polID, _, _, err := grLineBalance(ctx, tx, tu.TenantID, *ln.GoodsReceiptLineID)
			if err != nil {
				return 0, err
			}
			poLineID = &polID
			_ = tx.QueryRow(ctx, `
				select pol.item_id, pol.item_code, pol.item_name, pol.unit_id, coalesce(pol.unit_code, '')
				from public.po_purchase_order_lines pol where pol.id = $1`, polID).
				Scan(&itemID, &itemCode, &itemName, &unitID, &unitCode)
		}
		resolvedUnitID, resolvedUnitCode := inventory.ResolveLineUnit(ctx, tx, tu.TenantID, itemID, unitID, unitCode)

		var lineID int64
		err = tx.QueryRow(ctx, `
			insert into public.fin_supplier_invoice_lines (
			  supplier_invoice_id, line_no, goods_receipt_line_id, purchase_order_line_id,
			  item_id, item_code, item_name, qty, unit_id, unit_code,
			  unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
			returning id`,
			id, lineNo, ln.GoodsReceiptLineID, poLineID,
			itemID, itemCode, itemName, ln.Qty, resolvedUnitID, resolvedUnitCode,
			ln.UnitNonVat, ln.NonVatTotal, ln.TaxAmount, ln.UnitVatInc, ln.LineTotal).Scan(&lineID)
		if err != nil {
			return 0, err
		}

		if ln.GoodsReceiptLineID != nil && *ln.GoodsReceiptLineID > 0 {
			_, err = tx.Exec(ctx, `
				insert into public.gr_goods_receipt_slip_lines (
				  goods_receipt_line_id, slip_type, slip_ref, slip_date_no, qty, supplier_invoice_id
				) values ($1, 'supplier_invoice', $2, $3, $4, $5)`,
				*ln.GoodsReceiptLineID, invoiceNo, dateNoDisplay, ln.Qty, id)
			if err != nil {
				return 0, err
			}
			if poLineID != nil {
				if err := fulfillment.SyncPOLineBilledQty(ctx, tx, *poLineID); err != nil {
					return 0, err
				}
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}

	_ = audit.Log(ctx, pool, tu.TenantID, tu.AppUserID, "finance.supplier_invoice.create_from_gr", "fin_supplier_invoice", &id, nil, map[string]any{"goods_receipt_id": grID})

	// Carry the originating Purchase Order's attachments along to the Purchase (best-effort).
	var poID int64
	if err := pool.QueryRow(ctx,
		`select purchase_order_id from public.gr_goods_receipts where id = $1 and tenant_id = $2`,
		grID, tu.TenantID).Scan(&poID); err == nil && poID > 0 {
		_, _ = attachmentx.Copy(ctx, pool, attachmentx.CopyParams{
			SrcBaseDir: attachmentx.Dir("purchase_order"),
			DstBaseDir: attachmentx.Dir("supplier_invoice"),
			SrcTable:   "public.po_purchase_order_attachments",
			SrcFKCol:   "purchase_order_id",
			SrcID:      poID,
			DstTable:   "public.fin_supplier_invoice_attachments",
			DstFKCol:   "supplier_invoice_id",
			DstID:      id,
			TenantID:   tu.TenantID,
		})
	}
	return id, nil
}

func loadTaxCalcType(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (taxcalc.TaxType, error) {
	var tt taxcalc.TaxType
	err := pool.QueryRow(ctx, `
		select tax_mode, rate_percent::float8
		from public.quo_tax_types
		where id = $1 and tenant_id = $2 and deleted_at is null and status = 'active'`,
		id, tenantID).Scan(&tt.TaxMode, &tt.RatePercent)
	return tt, err
}
