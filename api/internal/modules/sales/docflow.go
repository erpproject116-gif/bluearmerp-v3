package sales

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/crm"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/approval"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/attachmentx"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/creditlimit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/taxcalc"
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

// validateSourceSOApproval enforces the SO approval policy for every sales order
// referenced by the sale (header source SO and any SO-linked lines).
func validateSourceSOApproval(ctx context.Context, pool *pgxpool.Pool, tenantID int64, policy processpolicy.Policy, headerSOID *int64, lines []saleLineBody) map[string]string {
	if !policy.SalesRequireSOApproval {
		return nil
	}
	soIDs := map[int64]bool{}
	if headerSOID != nil && *headerSOID > 0 {
		soIDs[*headerSOID] = true
	}
	var lineIDs []int64
	for _, ln := range lines {
		if ln.SourceSalesOrderLineID != nil && *ln.SourceSalesOrderLineID > 0 {
			lineIDs = append(lineIDs, *ln.SourceSalesOrderLineID)
		}
	}
	if len(lineIDs) > 0 {
		rows, err := pool.Query(ctx, `
			select distinct ln.sales_order_id
			from public.so_sales_order_lines ln
			join public.so_sales_orders so on so.id = ln.sales_order_id
			where ln.id = any($1) and so.tenant_id = $2`, lineIDs, tenantID)
		if err != nil {
			return map[string]string{"lines": "Couldn't find the linked sales order. Refresh and try Load Slip again."}
		}
		defer rows.Close()
		for rows.Next() {
			var soID int64
			if err := rows.Scan(&soID); err != nil {
				return map[string]string{"lines": "Couldn't find the linked sales order. Refresh and try Load Slip again."}
			}
			soIDs[soID] = true
		}
	}
	for soID := range soIDs {
		status, found, err := approval.Status(ctx, pool, tenantID, "sales_order", soID)
		if err != nil {
			return map[string]string{"lines": "Failed to check sales order approval."}
		}
		if v := processpolicy.ValidateSalesOrderApproval(policy, found, status); v != nil {
			return map[string]string{"lines": v["sales_order_id"]}
		}
	}
	return nil
}

// CreateFromSalesOrder creates a sales invoice from open sales order lines.
// If a sale already exists for the sales order, the existing id is returned.
func CreateFromSalesOrder(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, soID int64) (int64, error) {
	var existingID int64
	err := pool.QueryRow(ctx, `
		select id from public.sa_sales
		where tenant_id = $1 and source_sales_order_id = $2 and deleted_at is null
		order by id desc limit 1`, tu.TenantID, soID).Scan(&existingID)
	if err == nil {
		return existingID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}

	policy, err := processpolicy.Load(ctx, pool, tu.TenantID)
	if err != nil {
		return 0, err
	}
	if policy.SalesRequireSOApproval {
		status, found, err := approval.Status(ctx, pool, tu.TenantID, "sales_order", soID)
		if err != nil {
			return 0, err
		}
		if v := processpolicy.ValidateSalesOrderApproval(policy, found, status); v != nil {
			return 0, docflowValidation(v)
		}
	}
	useDelivery := salesUsesDeliveryBalance(policy)

	var taxTypeID, currencyID, partnerID, locationID int64
	var picUserID, projectID *int64
	var picName string
	var projectName, reference, notes, paymentTerms *string
	var progressStatus string
	err = pool.QueryRow(ctx, `
		select tax_type_id, currency_id, partner_id, pic_user_id, pic_name,
		  location_id, project_id, project_name, reference, notes, payment_terms, progress_status
		from public.so_sales_orders
		where id = $1 and tenant_id = $2 and deleted_at is null`,
		soID, tu.TenantID).Scan(
		&taxTypeID, &currencyID, &partnerID, &picUserID, &picName,
		&locationID, &projectID, &projectName, &reference, &notes, &paymentTerms, &progressStatus,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, ErrSalesOrderNotFound
		}
		return 0, err
	}
	if progressStatus != "completed" {
		return 0, docflowValidation(map[string]string{
			"progress_status": soMustBeCompletedForSaleMessage(),
		})
	}

	tt, err := loadTaxCalcType(ctx, pool, tu.TenantID, taxTypeID)
	if err != nil {
		return 0, fmt.Errorf("tax type not found: %w", err)
	}

	rows, err := pool.Query(ctx, fmt.Sprintf(`
		select ln.id, ln.line_no, ln.item_id, ln.item_code, ln.item_name, ln.description,
		  ln.unit_id, coalesce(ln.unit_code, ''),
		  ln.unit_vat_inc::float8, ln.remark,
		  (%s)::float8
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
		where so.id = $1 and so.tenant_id = $2 and so.deleted_at is null`,
		balanceExpr(useDelivery)), soID, tu.TenantID)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	var lineBodies []saleLineBody
	for rows.Next() {
		var soLineID int64
		var lineNo int
		var itemID *int64
		var itemCode, itemName string
		var description, remark *string
		var unitID *int64
		var unitCode string
		var unitVatInc, balance float64
		if err := rows.Scan(&soLineID, &lineNo, &itemID, &itemCode, &itemName, &description,
			&unitID, &unitCode, &unitVatInc, &remark, &balance); err != nil {
			return 0, err
		}
		if balance <= 0.0001 {
			continue
		}
		soLineIDCopy := soLineID
		body := saleLineBody{
			LineNo:                 lineNo,
			ItemID:                 itemID,
			ItemCode:               itemCode,
			ItemName:               itemName,
			Description:            description,
			Qty:                    balance,
			UnitID:                 unitID,
			UnitCode:               unitCode,
			UnitPrice:              unitVatInc,
			InputBasis:             taxcalc.InputVatIncUnit,
			Remark:                 remark,
			SourceSalesOrderLineID: &soLineIDCopy,
		}
		if itemID != nil {
			ids, loadErr := loadReservedSerialUnitIDsForSOLine(ctx, pool, tu.TenantID, soLineID)
			if loadErr == nil && len(ids) > 0 {
				body.SerialUnitIDs = ids
				if float64(len(ids)) < balance {
					body.Qty = float64(len(ids))
				}
			}
		}
		lineBodies = append(lineBodies, body)
	}
	if len(lineBodies) == 0 {
		msg := "Nothing left to invoice on this sales order. Pick or deliver remaining qty first, or the order is already fully billed."
		if useDelivery {
			msg = "Nothing left to invoice from deliveries on this sales order. Post more Delivery notes or check what was already billed."
		}
		return 0, docflowValidation(map[string]string{"lines": msg})
	}

	templateCode := defaultTemplateCode("")
	lineBodies = applyPartnerRatesToSaleLines(ctx, pool, tu.TenantID, partnerID, lineBodies)
	computed, errs := computeSaleLines(tt, templateCode, lineBodies)
	if errs != nil {
		return 0, docflowValidation(errs)
	}
	resolveComputedLineUnits(ctx, pool, tu.TenantID, computed)
	if convErrs := validateSalesOrderConversion(ctx, pool, tu.TenantID, computed); convErrs != nil {
		return 0, docflowValidation(convErrs)
	}

	subtotal, taxTotal, grandTotal := sumSaleTotals(computed)
	if clErrs, err := creditlimit.ValidateFromPolicy(ctx, pool, tu.TenantID, partnerID, grandTotal); err != nil {
		return 0, err
	} else if clErrs != nil {
		return 0, docflowValidation(clErrs)
	}

	orderDate := time.Now()
	soIDCopy := soID

	tx, err := pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	var dateSeq int
	var salesNo string
	if err := tx.QueryRow(ctx,
		`select date_seq, sales_no from public.allocate_sales_sequences($1, $2::date)`,
		tu.TenantID, orderDate).Scan(&dateSeq, &salesNo); err != nil {
		return 0, err
	}

	dateNoDisplay := formatDateNoDisplay(orderDate, dateSeq)

	var id int64
	err = tx.QueryRow(ctx, `
		insert into public.sa_sales (
		  tenant_id, order_date, date_seq, sales_no,
		  tax_type_id, currency_id, partner_id, pic_user_id, pic_name,
		  location_id, project_id, project_name,
		  payment_terms, notes,
		  progress_status, template_code, source_sales_order_id,
		  subtotal, tax_total, grand_total, created_by_user_id
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'unconfirmed',$15,$16,$17,$18,$19,$20)
		returning id`,
		tu.TenantID, orderDate, dateSeq, salesNo,
		taxTypeID, currencyID, partnerID, picUserID, strings.TrimSpace(picName),
		locationID, projectID, projectName,
		paymentTerms, notes,
		templateCode, soIDCopy,
		subtotal, taxTotal, grandTotal, tu.AppUserID).Scan(&id)
	if err != nil {
		return 0, err
	}

	if err := insertSaleLines(ctx, tx, id, computed); err != nil {
		return 0, err
	}

	if err := validateSaleSerialRequirements(ctx, tx, tu.TenantID, lineBodies); err != nil {
		return 0, docflowValidation(map[string]string{"lines": err.Error()})
	}
	if err := validateSaleLotRequirements(ctx, tx, tu.TenantID, lineBodies); err != nil {
		return 0, docflowValidation(map[string]string{"lines": err.Error()})
	}

	if err := applySaleSerialUnits(ctx, tx, tu.TenantID, id, partnerID, lineBodies); err != nil {
		return 0, docflowValidation(map[string]string{"lines": err.Error()})
	}
	if err := applySaleStock(ctx, tx, tu.TenantID, id, locationID, tu.AppUserID); err != nil {
		return 0, docflowValidation(map[string]string{"lines": err.Error()})
	}
	if err := applySaleLot(ctx, tx, tu.TenantID, id); err != nil {
		return 0, docflowValidation(map[string]string{"lines": err.Error()})
	}

	if _, err := crm.SyncWarrantyAssetsFromSale(ctx, tx, tu.TenantID, id); err != nil {
		return 0, err
	}

	if err := writeSalesOrderSlipsForSales(ctx, tx, tu.TenantID, id, tu.AppUserID, salesNo, dateNoDisplay, computed, useDelivery); err != nil {
		return 0, docflowValidation(map[string]string{"conversion": err.Error()})
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}

	_ = audit.Log(ctx, pool, tu.TenantID, tu.AppUserID, "sales.create_from_sales_order", "sa_sales", &id, nil, map[string]any{"sales_order_id": soID})

	// Carry the sales order's attachments (which include any from the quotation) to the sale (best-effort).
	_, _ = attachmentx.Copy(ctx, pool, attachmentx.CopyParams{
		SrcBaseDir: attachmentx.Dir("sales_order"),
		DstBaseDir: attachmentx.Dir("sales"),
		SrcTable:   "public.so_sales_order_attachments",
		SrcFKCol:   "sales_order_id",
		SrcID:      soID,
		DstTable:   "public.sa_sales_attachments",
		DstFKCol:   "sales_id",
		DstID:      id,
		TenantID:   tu.TenantID,
	})
	return id, nil
}
