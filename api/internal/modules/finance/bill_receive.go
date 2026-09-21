package finance

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/inventory"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/inventorygl"
)

type billLotLine struct {
	LotNo string  `json:"lot_no"`
	Qty   float64 `json:"qty"`
}

func normalizeSerialNos(raw []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(raw))
	for _, s := range raw {
		sn := strings.TrimSpace(s)
		if sn == "" || seen[strings.ToLower(sn)] {
			continue
		}
		seen[strings.ToLower(sn)] = true
		out = append(out, sn)
	}
	return out
}

func confirmingBillProgress(progress string) bool {
	p := strings.TrimSpace(strings.ToLower(progress))
	return p == "completed" || p == "confirm" || p == "e_approval"
}

func trackingPolicyRequired(policy string) bool {
	return !strings.EqualFold(strings.TrimSpace(policy), "optional")
}

func validateTrackingCapture(
	trackSerial bool,
	serialPolicy string,
	trackLot bool,
	lotPolicy string,
	qty float64,
	rawSerials []string,
	lots []billLotLine,
) error {
	serials := normalizeSerialNos(rawSerials)
	if trackSerial {
		required := trackingPolicyRequired(serialPolicy)
		if len(serials) > 0 || required {
			needQty := int(math.Floor(qty + 1e-9))
			if needQty < 1 {
				return errors.New("qty must be at least 1 for serial-tracked items")
			}
			if len(serials) != needQty {
				return fmt.Errorf("serial count (%d) must equal qty (%d)", len(serials), needQty)
			}
		}
	}
	if trackLot {
		required := trackingPolicyRequired(lotPolicy)
		if len(lots) > 0 || required {
			var sum float64
			for _, lot := range lots {
				sum += lot.Qty
			}
			if math.Abs(sum-qty) > 0.0001 {
				return fmt.Errorf("lot qty sum (%.4f) must equal line qty (%.4f)", sum, qty)
			}
		}
	}
	return nil
}

func validateBillLineSerialLots(ctx context.Context, tx pgx.Tx, tenantID int64, ln supplierInvoiceLineBody) (trackSerial, trackLot bool, itemID int64, serialPolicy, lotPolicy string, err error) {
	var id *int64
	if ln.ItemID != nil && *ln.ItemID > 0 {
		id = ln.ItemID
	} else if ln.PurchaseOrderLineID != nil && *ln.PurchaseOrderLineID > 0 {
		_ = tx.QueryRow(ctx, `select item_id from public.po_purchase_order_lines where id = $1`, *ln.PurchaseOrderLineID).Scan(&id)
	} else if ln.GoodsReceiptLineID != nil && *ln.GoodsReceiptLineID > 0 {
		_ = tx.QueryRow(ctx, `
			select pol.item_id from public.gr_goods_receipt_lines grl
			join public.po_purchase_order_lines pol on pol.id = grl.purchase_order_line_id
			where grl.id = $1`, *ln.GoodsReceiptLineID).Scan(&id)
		if id == nil {
			_ = tx.QueryRow(ctx, `
				select sil.item_id from public.fin_supplier_invoice_lines sil
				where sil.goods_receipt_line_id = $1 limit 1`, *ln.GoodsReceiptLineID).Scan(&id)
		}
	}
	if id == nil || *id <= 0 {
		// Resolve by code
		code := strings.TrimSpace(ln.ItemCode)
		if code != "" {
			var found int64
			if e := tx.QueryRow(ctx, `
				select id from public.inv_items
				where tenant_id = $1 and deleted_at is null and lower(item_code) = lower($2)
				limit 1`, tenantID, code).Scan(&found); e == nil {
				id = &found
			}
		}
	}
	if id == nil || *id <= 0 {
		return false, false, 0, "", "", nil
	}
	itemID = *id
	_ = tx.QueryRow(ctx, `
		select coalesce(track_serial, false), coalesce(track_lot, false),
		       coalesce(serial_policy, 'required'), coalesce(lot_policy, 'required')
		from public.inv_items where id = $1 and tenant_id = $2`, itemID, tenantID).
		Scan(&trackSerial, &trackLot, &serialPolicy, &lotPolicy)

	if err := validateTrackingCapture(
		trackSerial,
		serialPolicy,
		trackLot,
		lotPolicy,
		ln.Qty,
		ln.SerialNos,
		ln.LotLines,
	); err != nil {
		return trackSerial, trackLot, itemID, serialPolicy, lotPolicy, err
	}
	return trackSerial, trackLot, itemID, serialPolicy, lotPolicy, nil
}

// receiveForSupplierInvoiceLineTx posts stock (and serials/lots) under the hood via a posted GR.
// Returns GR line id when a new receive was created, or nil when bill-only (already received / GR-sourced).
func receiveForSupplierInvoiceLineTx(
	ctx context.Context, tx pgx.Tx,
	tenantID, userID, locationID, partnerID int64,
	ln supplierInvoiceLineBody,
) (*int64, error) {
	// Already linked to a posted GR — bill only.
	if ln.GoodsReceiptLineID != nil && *ln.GoodsReceiptLineID > 0 {
		return ln.GoodsReceiptLineID, nil
	}

	trackSerial, trackLot, itemID, _, _, err := validateBillLineSerialLots(ctx, tx, tenantID, ln)
	if err != nil {
		return nil, err
	}
	serials := normalizeSerialNos(ln.SerialNos)

	if ln.PurchaseOrderLineID != nil && *ln.PurchaseOrderLineID > 0 {
		return receiveFromPOLine(ctx, tx, tenantID, userID, locationID, partnerID, *ln.PurchaseOrderLineID, ln.Qty, serials, ln.LotLines, trackSerial, trackLot, ln.WarrantyDurationMonths)
	}

	// Blank Purchase Receive line: post stock as soon as serials/lots (if required) are complete —
	// same as PO-linked lines. Progress can stay Unconfirmed for AP; confirm still links journal.
	if itemID <= 0 {
		return nil, nil
	}
	return receiveBlankItem(ctx, tx, tenantID, userID, locationID, partnerID, itemID, ln, serials, trackSerial, trackLot)
}

func receiveFromPOLine(
	ctx context.Context, tx pgx.Tx,
	tenantID, userID, locationID, partnerID, purchaseOrderLineID int64,
	invoiceQty float64, serials []string, lots []billLotLine,
	trackSerial, trackLot bool, invoiceWarrantyMonths *int,
) (*int64, error) {
	var poID int64
	var ordered, received float64
	var itemID *int64
	var unitID *int64
	var unitCost float64
	var trackInventory bool
	var warrantyMonths *int
	err := tx.QueryRow(ctx, `
		select po.id, pol.qty::float8, coalesce(pol.received_qty, 0)::float8,
		  pol.item_id, pol.unit_id, coalesce(pol.unit_non_vat, 0)::float8,
		  coalesce(i.track_inventory_qty, false),
		  coalesce(pol.warranty_duration_months, i.warranty_duration_months)
		from public.po_purchase_order_lines pol
		join public.po_purchase_orders po on po.id = pol.purchase_order_id
		left join public.inv_items i on i.id = pol.item_id
		where pol.id = $1 and po.tenant_id = $2 and po.deleted_at is null
		  and po.status in ('draft', 'confirmed', 'partially_received', 'received')`,
		purchaseOrderLineID, tenantID,
	).Scan(&poID, &ordered, &received, &itemID, &unitID, &unitCost, &trackInventory, &warrantyMonths)
	if err != nil {
		return nil, errors.New("Purchase order line no longer exists (PO was re-saved). Use Load Slip again.")
	}
	if invoiceWarrantyMonths != nil {
		warrantyMonths = invoiceWarrantyMonths
	}

	openReceive := ordered - received
	if openReceive <= 0.0001 {
		return nil, nil
	}
	if invoiceQty > openReceive+0.0001 {
		return nil, fmt.Errorf("Bill qty is higher than unreceived PO quantity (%.4f available). Receive goods first, or lower the bill qty", openReceive)
	}

	grLineID, grID, receiptDate, err := insertPostedGR(ctx, tx, tenantID, userID, locationID, &poID, &purchaseOrderLineID, invoiceQty, unitCost)
	if err != nil {
		return nil, err
	}

	if err := applyStockAndTracking(ctx, tx, tenantID, userID, locationID, partnerID, grID, grLineID, itemID, unitID, invoiceQty, unitCost, trackInventory, trackSerial, trackLot, serials, lots, warrantyMonths, &purchaseOrderLineID, receiptDate); err != nil {
		return nil, err
	}

	tag, err := tx.Exec(ctx, `
		update public.po_purchase_order_lines
		set received_qty = received_qty + $1
		where id = $2 and (qty - received_qty) >= $1 - 0.0001`,
		invoiceQty, purchaseOrderLineID)
	if err != nil || tag.RowsAffected() == 0 {
		return nil, errors.New("failed to update purchase order received quantity")
	}

	var openLines int
	if err := tx.QueryRow(ctx, `
		select count(*) from public.po_purchase_order_lines
		where purchase_order_id = $1 and (qty - received_qty) > 0.0001`, poID).Scan(&openLines); err != nil {
		return nil, err
	}
	newPOStatus := "received"
	if openLines > 0 {
		newPOStatus = "partially_received"
	}
	if _, err := tx.Exec(ctx, `
		update public.po_purchase_orders set status = $1, updated_at = now() where id = $2`,
		newPOStatus, poID); err != nil {
		return nil, errors.New("failed to update purchase order status")
	}
	return &grLineID, nil
}

func receiveBlankItem(
	ctx context.Context, tx pgx.Tx,
	tenantID, userID, locationID, partnerID, itemID int64,
	ln supplierInvoiceLineBody, serials []string,
	trackSerial, trackLot bool,
) (*int64, error) {
	var trackInventory bool
	var itemWarrantyMonths *int
	_ = tx.QueryRow(ctx, `
		select coalesce(track_inventory_qty, false), warranty_duration_months
		from public.inv_items where id = $1 and tenant_id = $2`, itemID, tenantID).
		Scan(&trackInventory, &itemWarrantyMonths)
	warrantyMonths := ln.WarrantyDurationMonths
	if warrantyMonths == nil {
		warrantyMonths = itemWarrantyMonths
	}

	unitCost := ln.UnitNonVat
	if unitCost <= 0 {
		unitCost = ln.UnitPrice
	}
	grLineID, grID, receiptDate, err := insertPostedGR(ctx, tx, tenantID, userID, locationID, nil, nil, ln.Qty, unitCost)
	if err != nil {
		return nil, err
	}
	itemPtr := itemID
	if err := applyStockAndTracking(ctx, tx, tenantID, userID, locationID, partnerID, grID, grLineID, &itemPtr, ln.UnitID, ln.Qty, unitCost, trackInventory, trackSerial, trackLot, serials, ln.LotLines, warrantyMonths, nil, receiptDate); err != nil {
		return nil, err
	}
	return &grLineID, nil
}

func insertPostedGR(
	ctx context.Context, tx pgx.Tx,
	tenantID, userID, locationID int64,
	poID, poLineID *int64,
	qty, unitCost float64,
) (grLineID, grID int64, receiptDate time.Time, err error) {
	var locTenant int64
	if err = tx.QueryRow(ctx, `
		select tenant_id from public.inv_locations where id = $1 and deleted_at is null`, locationID).
		Scan(&locTenant); err != nil || locTenant != tenantID {
		return 0, 0, time.Time{}, errors.New("invalid location for auto-receive")
	}

	err = tx.QueryRow(ctx, `
		insert into public.gr_goods_receipts (
		  tenant_id, purchase_order_id, receipt_date, location_id, status,
		  inspection_status, reference, notes, created_by_user_id
		) values ($1, $2, current_date, $3, 'posted', 'released', $4, $5, $6)
		returning id, receipt_date`,
		tenantID, poID, locationID,
		"Auto-receive on Bill", "Created automatically when confirming/saving a Bill with open receive qty.",
		userID,
	).Scan(&grID, &receiptDate)
	if err != nil {
		return 0, 0, time.Time{}, fmt.Errorf("failed to auto-create goods receipt: %w", err)
	}

	err = tx.QueryRow(ctx, `
		insert into public.gr_goods_receipt_lines (
		  goods_receipt_id, purchase_order_line_id, line_no, expected_qty, received_qty,
		  base_unit_cost, unit_cost
		) values ($1, $2, 1, $3, $3, $4, $4)
		returning id`,
		grID, poLineID, qty, unitCost,
	).Scan(&grLineID)
	if err != nil {
		return 0, 0, time.Time{}, fmt.Errorf("failed to auto-create goods receipt line: %w", err)
	}
	return grLineID, grID, receiptDate, nil
}

func applyStockAndTracking(
	ctx context.Context, tx pgx.Tx,
	tenantID, userID, locationID, partnerID, grID, grLineID int64,
	itemID *int64, unitID *int64, invoiceQty, unitCost float64,
	trackInventory, trackSerial, trackLot bool,
	serials []string, lots []billLotLine, warrantyMonths *int,
	poLineID *int64, receiptDate time.Time,
) error {
	if itemID == nil || *itemID <= 0 {
		return nil
	}
	baseQty := invoiceQty
	bq, err := inventory.BaseQtyForLine(ctx, tx, tenantID, *itemID, unitID, invoiceQty)
	if err != nil {
		return err
	}
	baseQty = bq

	for _, sn := range serials {
		if _, err := tx.Exec(ctx, `
			insert into public.gr_goods_receipt_serials (goods_receipt_line_id, serial_no)
			values ($1, $2)`, grLineID, sn); err != nil {
			return fmt.Errorf("duplicate or invalid serial %q", sn)
		}
	}
	for _, lot := range lots {
		lotNo := strings.TrimSpace(lot.LotNo)
		if lotNo == "" || lot.Qty <= 0 {
			continue
		}
		if _, err := tx.Exec(ctx, `
			insert into public.gr_goods_receipt_line_lots (goods_receipt_line_id, lot_no, qty)
			values ($1, $2, $3)`, grLineID, lotNo, lot.Qty); err != nil {
			return fmt.Errorf("failed to add lot %q", lotNo)
		}
	}

	if trackSerial && len(serials) > 0 {
		var ledgerDup int
		if err := tx.QueryRow(ctx, `
			select count(*) from public.inv_serial_units su
			where su.tenant_id = $1 and su.status <> 'void'
			  and su.serial_no = any($2::text[])`, tenantID, serials).Scan(&ledgerDup); err != nil {
			return err
		}
		if ledgerDup > 0 {
			return errors.New("one or more serials already exist in inventory")
		}
		var wEnd *time.Time
		if warrantyMonths != nil && *warrantyMonths > 0 {
			t := receiptDate.AddDate(0, *warrantyMonths, 0)
			wEnd = &t
		}
		var partnerArg any
		if partnerID > 0 {
			partnerArg = partnerID
		}
		unitRows, err := tx.Query(ctx, `
			insert into public.inv_serial_units (
			  tenant_id, item_id, serial_no, status, location_id, partner_id,
			  warranty_start, warranty_end, purchase_order_line_id, goods_receipt_line_id,
			  received_at
			)
			select $1, $2, gs.serial_no, 'in_stock', $3, $4,
			  $5::date, $6::date, $7, $8,
			  $5::timestamptz
			from public.gr_goods_receipt_serials gs
			where gs.goods_receipt_line_id = $8
			returning id`,
			tenantID, *itemID, locationID, partnerArg,
			receiptDate, wEnd, poLineID, grLineID,
		)
		if err != nil {
			return errors.New("failed to create serial units")
		}
		// Collect ids first — pgx forbids another query on the same tx while rows are open ("conn busy").
		var unitIDs []int64
		for unitRows.Next() {
			var unitIDRow int64
			if err := unitRows.Scan(&unitIDRow); err != nil {
				unitRows.Close()
				return err
			}
			unitIDs = append(unitIDs, unitIDRow)
		}
		if err := unitRows.Err(); err != nil {
			unitRows.Close()
			return err
		}
		unitRows.Close()
		locID := locationID
		uid := userID
		for _, unitIDRow := range unitIDs {
			if err := inventory.InsertSerialEvent(ctx, tx, tenantID, unitIDRow, "received", nil, &locID, "goods_receipt", grID, &uid); err != nil {
				return err
			}
		}
	}

	if trackLot {
		for _, lot := range lots {
			lotNo := strings.TrimSpace(lot.LotNo)
			if lotNo == "" || lot.Qty <= 0 {
				continue
			}
			var lotBatchID int64
			err := tx.QueryRow(ctx, `
				insert into public.inv_lot_batches (
				  tenant_id, item_id, lot_no, location_id, qty_on_hand,
				  purchase_order_line_id, goods_receipt_line_id
				) values ($1, $2, $3, $4, $5, $6, $7)
				on conflict (tenant_id, item_id, lot_no, location_id)
				do update set qty_on_hand = inv_lot_batches.qty_on_hand + excluded.qty_on_hand,
				  goods_receipt_line_id = coalesce(inv_lot_batches.goods_receipt_line_id, excluded.goods_receipt_line_id)
				returning id`,
				tenantID, *itemID, lotNo, locationID, lot.Qty, poLineID, grLineID).Scan(&lotBatchID)
			if err != nil {
				// Fallback without on-conflict if unique differs
				err = tx.QueryRow(ctx, `
					insert into public.inv_lot_batches (
					  tenant_id, item_id, lot_no, location_id, qty_on_hand,
					  purchase_order_line_id, goods_receipt_line_id
					) values ($1, $2, $3, $4, $5, $6, $7)
					returning id`,
					tenantID, *itemID, lotNo, locationID, lot.Qty, poLineID, grLineID).Scan(&lotBatchID)
				if err != nil {
					return fmt.Errorf("failed to post lot %q: %w", lotNo, err)
				}
			}
			lotLocID := locationID
			lotUserID := userID
			if err := inventory.InsertLotEvent(ctx, tx, inventory.LotEventInput{
				TenantID:        tenantID,
				LotBatchID:      lotBatchID,
				EventType:       "received",
				ToLocationID:    &lotLocID,
				Qty:             lot.Qty,
				RefType:         "goods_receipt",
				RefID:           &grID,
				CreatedByUserID: &lotUserID,
			}); err != nil {
				return err
			}
		}
	}

	if trackInventory || trackLot || trackSerial {
		if baseQty > 0 {
			_, err = tx.Exec(ctx, `
				insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand)
				values ($1, $2, $3, $4)
				on conflict (tenant_id, item_id, location_id)
				do update set qty_on_hand = inv_item_location_balances.qty_on_hand + excluded.qty_on_hand, updated_at = now()`,
				tenantID, *itemID, locationID, baseQty)
			if err != nil {
				return errors.New("failed to update stock on auto-receive")
			}
			_, err = tx.Exec(ctx, `
				insert into public.inv_stock_movements (
				  tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, created_by_user_id
				) values ($1, $2, $3, $4, 'goods_receipt', 'goods_receipt', $5, $6)`,
				tenantID, *itemID, locationID, baseQty, grID, userID)
			if err != nil {
				return errors.New("failed to record stock movement for auto-receive")
			}
		}
		if trackInventory && baseQty > 0 {
			if _, err := inventorygl.PostReceiptTx(
				ctx, tx, tenantID, userID, receiptDate,
				"goods_receipt", grID, "Auto-receive on Bill",
				[]inventorygl.Line{{
					ItemID:         *itemID,
					Qty:            baseQty,
					UnitCost:       unitCost,
					TrackInventory: true,
				}},
			); err != nil {
				return fmt.Errorf("failed to post inventory GL for auto-receive: %w", err)
			}
		}
	}
	return nil
}

func marshalSerialNos(serials []string) []byte {
	if serials == nil {
		serials = []string{}
	}
	b, _ := json.Marshal(normalizeSerialNos(serials))
	return b
}

func marshalLotLines(lots []billLotLine) []byte {
	if lots == nil {
		lots = []billLotLine{}
	}
	b, _ := json.Marshal(lots)
	return b
}
