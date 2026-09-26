package manufacturing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/inventory"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const maxWoOutputBatchSize = 100

type woIssueSerialsBody struct {
	SerialUnitIDs []int64 `json:"serial_unit_ids"`
}

type woIssueLotLine struct {
	LotBatchID int64   `json:"lot_batch_id"`
	Qty        float64 `json:"qty"`
}

type woIssueLotsBody struct {
	Lines []woIssueLotLine `json:"lines"`
}

type woOutputSerialScan struct {
	SerialNo     string `json:"serial_no"`
	ClientScanID string `json:"client_scan_id,omitempty"`
}

type woOutputSerialBatchBody struct {
	Scans []woOutputSerialScan `json:"scans"`
}

type woOutputLotScan struct {
	LotNo           string   `json:"lot_no"`
	Qty             float64  `json:"qty"`
	ExpiryDate      *string  `json:"expiry_date,omitempty"`
	CatchWeight     *float64 `json:"catch_weight,omitempty"`
	ClientScanID    string   `json:"client_scan_id,omitempty"`
	ComponentItemID *int64   `json:"component_item_id,omitempty"`
}

type woOutputLotBatchBody struct {
	Scans []woOutputLotScan `json:"scans"`
}

type woOutputSerialScanResult struct {
	ClientScanID string `json:"client_scan_id,omitempty"`
	SerialNo     string `json:"serial_no"`
	Status       string `json:"status"`
	ID           *int64 `json:"id,omitempty"`
	Message      string `json:"message,omitempty"`
}

type woOutputLotScanResult struct {
	ClientScanID string  `json:"client_scan_id,omitempty"`
	LotNo        string  `json:"lot_no"`
	Qty          float64 `json:"qty,omitempty"`
	Status       string  `json:"status"`
	ID           *int64  `json:"id,omitempty"`
	Message      string  `json:"message,omitempty"`
}

type woScanContextComponent struct {
	ComponentItemID int64   `json:"component_item_id"`
	ComponentCode   string  `json:"component_code"`
	ComponentName   string  `json:"component_name"`
	StockToIssue    float64 `json:"stock_to_issue"`
	TrackSerial     bool    `json:"track_serial"`
	TrackLot        bool    `json:"track_lot"`
	IssuedSerials   int     `json:"issued_serials"`
	IssuedLotQty    float64 `json:"issued_lot_qty"`
}

type woScanContextPayload struct {
	WorkOrderID      int64                    `json:"work_order_id"`
	WorkOrderNo      string                   `json:"work_order_no"`
	Status           string                   `json:"status"`
	LocationID       int64                    `json:"location_id"`
	LocationName     string                   `json:"location_name"`
	FinishedItemID   int64                    `json:"finished_item_id"`
	FinishedItemCode string                   `json:"finished_item_code"`
	FinishedItemName string                   `json:"finished_item_name"`
	QtyToProduce     float64                  `json:"qty_to_produce"`
	TrackSerial      bool                     `json:"track_serial"`
	TrackLot         bool                     `json:"track_lot"`
	OutputSerials    int                      `json:"output_serials"`
	OutputLotQty     float64                  `json:"output_lot_qty"`
	Components       []woScanContextComponent `json:"components"`
}

func issueWorkOrderSerials(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		woID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body woIssueSerialsBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.SerialUnitIDs) == 0 {
			response.Validation(w, map[string]string{"serial_unit_ids": "At least one serial is required."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to issue serials.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		wo, bom, err := loadReleasedWorkOrderForTrace(r.Context(), tx, tu.TenantID, woID)
		if err != nil {
			respondReleasedWOLoadError(w, err, "Only released work orders accept issue scans.")
			return
		}
		componentIDs := bomComponentIDs(bom, wo.FinishedItemID, normalizeBomType(bom.BomType) == "disassembly")

		added := 0
		for _, unitID := range body.SerialUnitIDs {
			// Same serial scanned twice on this job: nothing more to do.
			var alreadyOnJob bool
			_ = tx.QueryRow(r.Context(), `
				select exists(select 1 from public.mfg_wo_issue_serials where work_order_id = $1 and serial_unit_id = $2)`,
				woID, unitID).Scan(&alreadyOnJob)
			if alreadyOnJob {
				continue
			}
			var itemID int64
			var serialNo string
			err := tx.QueryRow(r.Context(), `
				select su.item_id, su.serial_no
				from public.inv_serial_units su
				where su.id = $1 and su.tenant_id = $2 and su.location_id = $3
				  and su.status = 'in_stock'
				  and su.sales_line_id is null
				  and not exists (
				    select 1
				    from public.mfg_wo_issue_serials wis
				    join public.mfg_work_orders o on o.id = wis.work_order_id
				    where wis.serial_unit_id = su.id
				      and o.tenant_id = $2
				      and o.status in ('draft', 'released')
				      and o.id <> $4
				  )
				for update`, unitID, tu.TenantID, wo.LocationID, woID).Scan(&itemID, &serialNo)
			if err != nil {
				response.Validation(w, map[string]string{"serial_unit_ids": fmt.Sprintf("Serial %d is not free in stock at this warehouse (may be reserved, sold, or staged on another job).", unitID)})
				return
			}
			if !componentIDs[itemID] {
				response.Validation(w, map[string]string{"serial_unit_ids": fmt.Sprintf("Serial %s is not a required component.", serialNo)})
				return
			}
			// Stock moves now: the serial leaves the free pool and on-hand drops by one.
			if _, err := tx.Exec(r.Context(), `
				update public.inv_serial_units set status = 'reserved', updated_at = now()
				where id = $1 and tenant_id = $2`, unitID, tu.TenantID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to take serial from stock.", "ERR_INTERNAL")
				return
			}
			loc := wo.LocationID
			if err := inventory.InsertSerialEvent(r.Context(), tx, tu.TenantID, unitID, "reserved", &loc, nil, "mfg_work_order", woID, &tu.AppUserID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to record serial event.", "ERR_INTERNAL")
				return
			}
			if err := inventory.ApplyStockDelta(r.Context(), tx, tu.TenantID, itemID, wo.LocationID, -1, tu.AppUserID, "mfg_work_order", woID, "wo_trace_issue", woIssueStockReason(wo.WorkOrderNo)); err != nil {
				response.ValidationSmart(w, map[string]string{"stock": err.Error()})
				return
			}
			if _, err := tx.Exec(r.Context(), `
				insert into public.mfg_wo_issue_serials (tenant_id, work_order_id, component_item_id, serial_unit_id, stock_posted)
				values ($1, $2, $3, $4, true)`,
				tu.TenantID, woID, itemID, unitID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to stage serial.", "ERR_INTERNAL")
				return
			}
			added++
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to issue serials.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "manufacturing.wo_issue_serials", "mfg_work_order", &woID, nil, body)
		response.OK(w, map[string]any{"added": added, "requested": len(body.SerialUnitIDs)}, "Serials taken from stock.")
	}
}

func issueWorkOrderLots(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		woID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body woIssueLotsBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.Lines) == 0 {
			response.Validation(w, map[string]string{"lines": "At least one lot line is required."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to issue lots.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		wo, bom, err := loadReleasedWorkOrderForTrace(r.Context(), tx, tu.TenantID, woID)
		if err != nil {
			respondReleasedWOLoadError(w, err, "Only released work orders accept issue scans.")
			return
		}
		componentIDs := bomComponentIDs(bom, wo.FinishedItemID, normalizeBomType(bom.BomType) == "disassembly")

		added := 0
		for i, ln := range body.Lines {
			if ln.LotBatchID <= 0 {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].lot_batch_id", i): "Lot batch is required."})
				return
			}
			if ln.Qty <= 0 {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].qty", i): "Quantity must be greater than zero."})
				return
			}
			var itemID int64
			var lotQty float64
			var stagedOther float64
			// Rows taken before stock_posted existed never reduced on-hand, so they still count against free qty.
			err := tx.QueryRow(r.Context(), `
				select lb.item_id, lb.qty_on_hand::float8,
				  coalesce((
				    select sum(wil.qty)::float8
				    from public.mfg_wo_issue_lots wil
				    join public.mfg_work_orders o on o.id = wil.work_order_id
				    where wil.lot_batch_id = lb.id
				      and o.tenant_id = $2
				      and o.status in ('draft', 'released')
				      and not wil.stock_posted
				  ), 0)::float8
				from public.inv_lot_batches lb
				where lb.id = $1 and lb.tenant_id = $2 and lb.location_id = $3
				for update`, ln.LotBatchID, tu.TenantID, wo.LocationID).Scan(&itemID, &lotQty, &stagedOther)
			if err != nil {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].lot_batch_id", i): "Lot batch not found at location."})
				return
			}
			if !componentIDs[itemID] {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].lot_batch_id", i): "Lot item is not a required component."})
				return
			}
			freeQty := lotQty - stagedOther
			if freeQty+0.0001 < ln.Qty {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].qty", i): fmt.Sprintf("Only %.4f free on this lot (on hand %.4f, %.4f already staged on open jobs).", freeQty, lotQty, stagedOther)})
				return
			}
			// Stock moves now: the lot and on-hand drop by the taken qty.
			tag, err := tx.Exec(r.Context(), `
				update public.inv_lot_batches
				set qty_on_hand = qty_on_hand - $1, updated_at = now()
				where id = $2 and tenant_id = $3 and qty_on_hand >= $1`,
				ln.Qty, ln.LotBatchID, tu.TenantID)
			if err != nil || tag.RowsAffected() == 0 {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].qty", i): "Could not take that qty from the lot."})
				return
			}
			loc := wo.LocationID
			if err := inventory.InsertLotEvent(r.Context(), tx, inventory.LotEventInput{
				TenantID:        tu.TenantID,
				LotBatchID:      ln.LotBatchID,
				EventType:       "consumed",
				FromLocationID:  &loc,
				Qty:             ln.Qty,
				RefType:         "mfg_work_order",
				RefID:           &woID,
				Notes:           woIssueStockReason(wo.WorkOrderNo),
				CreatedByUserID: &tu.AppUserID,
			}); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to record lot event.", "ERR_INTERNAL")
				return
			}
			if err := inventory.ApplyStockDelta(r.Context(), tx, tu.TenantID, itemID, wo.LocationID, -ln.Qty, tu.AppUserID, "mfg_work_order", woID, "wo_trace_issue", woIssueStockReason(wo.WorkOrderNo)); err != nil {
				response.ValidationSmart(w, map[string]string{"stock": err.Error()})
				return
			}
			_, err = tx.Exec(r.Context(), `
				insert into public.mfg_wo_issue_lots (tenant_id, work_order_id, component_item_id, lot_batch_id, qty, stock_posted)
				values ($1, $2, $3, $4, $5, true)`,
				tu.TenantID, woID, itemID, ln.LotBatchID, ln.Qty)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to stage lot.", "ERR_INTERNAL")
				return
			}
			added++
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to issue lots.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "manufacturing.wo_issue_lots", "mfg_work_order", &woID, nil, body)
		response.OK(w, map[string]any{"added": added}, "Lots taken from stock.")
	}
}

// woIssueStockReason labels the Inv. Book row for stock taken on a job.
func woIssueStockReason(workOrderNo string) string {
	return strings.TrimSpace(workOrderNo) + " take from stock"
}

// woReturnStockReason labels the Inv. Book row when a taken lot or serial goes back.
func woReturnStockReason(workOrderNo string) string {
	return strings.TrimSpace(workOrderNo) + " put back in stock"
}

// loadOpenWorkOrderForUnstage locks an open (draft/released) job so a taken line can be put back.
func loadOpenWorkOrderForUnstage(ctx context.Context, tx pgx.Tx, tenantID, woID int64) (WorkOrder, error) {
	var wo WorkOrder
	err := tx.QueryRow(ctx, `
		select wo.id, wo.work_order_no, wo.location_id, wo.finished_item_id, wo.status
		from public.mfg_work_orders wo
		where wo.id = $1 and wo.tenant_id = $2
		for update`, woID, tenantID).Scan(&wo.ID, &wo.WorkOrderNo, &wo.LocationID, &wo.FinishedItemID, &wo.Status)
	if err != nil {
		return WorkOrder{}, err
	}
	if wo.Status != WOStatusDraft && wo.Status != WOStatusReleased {
		return wo, errWoNotReleased
	}
	return wo, nil
}

// returnIssueLotStock gives a taken lot qty back to the lot and to on-hand.
func returnIssueLotStock(ctx context.Context, tx pgx.Tx, tenantID, woID, locationID, itemID, lotBatchID int64, qty float64, userID int64, workOrderNo string) error {
	if qty <= 0.0001 {
		return nil
	}
	tag, err := tx.Exec(ctx, `
		update public.inv_lot_batches
		set qty_on_hand = qty_on_hand + $1, updated_at = now()
		where id = $2 and tenant_id = $3`, qty, lotBatchID, tenantID)
	if err != nil || tag.RowsAffected() == 0 {
		return fmt.Errorf("lot batch %d could not be restored", lotBatchID)
	}
	loc := locationID
	if err := inventory.InsertLotEvent(ctx, tx, inventory.LotEventInput{
		TenantID:        tenantID,
		LotBatchID:      lotBatchID,
		EventType:       "returned",
		ToLocationID:    &loc,
		Qty:             qty,
		RefType:         "mfg_work_order",
		RefID:           &woID,
		Notes:           woReturnStockReason(workOrderNo),
		CreatedByUserID: &userID,
	}); err != nil {
		return err
	}
	return inventory.ApplyStockDelta(ctx, tx, tenantID, itemID, locationID, qty, userID, "mfg_work_order", woID, "wo_trace_return", woReturnStockReason(workOrderNo))
}

// returnIssueSerialStock frees a reserved serial and gives one unit back to on-hand.
func returnIssueSerialStock(ctx context.Context, tx pgx.Tx, tenantID, woID, locationID, itemID, unitID int64, userID int64, workOrderNo string) error {
	tag, err := tx.Exec(ctx, `
		update public.inv_serial_units set status = 'in_stock', updated_at = now()
		where id = $1 and tenant_id = $2 and status = 'reserved'`, unitID, tenantID)
	if err != nil || tag.RowsAffected() == 0 {
		return fmt.Errorf("serial %d is no longer reserved for this job", unitID)
	}
	loc := locationID
	if err := inventory.InsertSerialEvent(ctx, tx, tenantID, unitID, "released", nil, &loc, "mfg_work_order", woID, &userID); err != nil {
		return err
	}
	return inventory.ApplyStockDelta(ctx, tx, tenantID, itemID, locationID, 1, userID, "mfg_work_order", woID, "wo_trace_return", woReturnStockReason(workOrderNo))
}

// woReceiveStockReason labels the Inv. Book row for a recorded output that went into stock.
func woReceiveStockReason(workOrderNo string) string {
	return strings.TrimSpace(workOrderNo) + " received"
}

// woVoidStockReason labels the Inv. Book row when a recorded output is removed again.
func woVoidStockReason(workOrderNo string) string {
	return strings.TrimSpace(workOrderNo) + " removed from stock"
}

// receiveWoOutputLotStock puts a recorded output lot into stock as soon as it is recorded.
// Lot-tracked items also get a lot batch and a produced event.
func receiveWoOutputLotStock(ctx context.Context, tx pgx.Tx, tenantID, woID, locationID, itemID int64, lotNo string, qty float64, expiry *time.Time, trackLot bool, movementType string, userID int64, workOrderNo string) error {
	if qty <= 0.0001 {
		return fmt.Errorf("lot qty must be greater than zero")
	}
	if trackLot {
		var lotBatchID int64
		err := tx.QueryRow(ctx, `
			insert into public.inv_lot_batches (
			  tenant_id, item_id, lot_no, location_id, qty_on_hand, expiry_date
			) values ($1, $2, $3, $4, $5, $6)
			on conflict (tenant_id, item_id, lot_no, location_id)
			do update set
			  qty_on_hand = inv_lot_batches.qty_on_hand + excluded.qty_on_hand,
			  expiry_date = coalesce(excluded.expiry_date, inv_lot_batches.expiry_date),
			  updated_at = now()
			returning id`,
			tenantID, itemID, lotNo, locationID, qty, expiry).Scan(&lotBatchID)
		if err != nil {
			return fmt.Errorf("failed to receive lot %s: %w", lotNo, err)
		}
		loc := locationID
		if err := inventory.InsertLotEvent(ctx, tx, inventory.LotEventInput{
			TenantID:        tenantID,
			LotBatchID:      lotBatchID,
			EventType:       "produced",
			ToLocationID:    &loc,
			Qty:             qty,
			RefType:         "mfg_work_order",
			RefID:           &woID,
			Notes:           woReceiveStockReason(workOrderNo),
			CreatedByUserID: &userID,
		}); err != nil {
			return err
		}
	}
	return inventory.ApplyStockDelta(ctx, tx, tenantID, itemID, locationID, qty, userID, "mfg_work_order", woID, movementType, woReceiveStockReason(workOrderNo))
}

// voidWoOutputLotStock takes a recorded output lot back out of stock.
func voidWoOutputLotStock(ctx context.Context, tx pgx.Tx, tenantID, woID, locationID, itemID int64, lotNo string, qty float64, trackLot bool, userID int64, workOrderNo string) error {
	if qty <= 0.0001 {
		return nil
	}
	if trackLot {
		var lotBatchID int64
		err := tx.QueryRow(ctx, `
			select id from public.inv_lot_batches
			where tenant_id = $1 and item_id = $2 and lot_no = $3 and location_id = $4
			for update`, tenantID, itemID, lotNo, locationID).Scan(&lotBatchID)
		if err != nil {
			return fmt.Errorf("lot %s is no longer at this warehouse", lotNo)
		}
		tag, err := tx.Exec(ctx, `
			update public.inv_lot_batches
			set qty_on_hand = qty_on_hand - $1, updated_at = now()
			where id = $2 and qty_on_hand >= $1`, qty, lotBatchID)
		if err != nil || tag.RowsAffected() == 0 {
			return fmt.Errorf("lot %s no longer has %.4f on hand; part of it already left stock", lotNo, qty)
		}
		loc := locationID
		if err := inventory.InsertLotEvent(ctx, tx, inventory.LotEventInput{
			TenantID:        tenantID,
			LotBatchID:      lotBatchID,
			EventType:       "voided",
			FromLocationID:  &loc,
			Qty:             qty,
			RefType:         "mfg_work_order",
			RefID:           &woID,
			Notes:           woVoidStockReason(workOrderNo),
			CreatedByUserID: &userID,
		}); err != nil {
			return err
		}
	}
	return inventory.ApplyStockDelta(ctx, tx, tenantID, itemID, locationID, -qty, userID, "mfg_work_order", woID, "wo_trace_void", woVoidStockReason(workOrderNo))
}

// receiveWoOutputSerialStock creates the finished serial in stock as soon as it is recorded.
func receiveWoOutputSerialStock(ctx context.Context, tx pgx.Tx, tenantID, woID, locationID, itemID int64, serialNo string, userID int64, workOrderNo string) error {
	recvAt := time.Now()
	var warrantyMonths int
	_ = tx.QueryRow(ctx, `select coalesce(warranty_duration_months, 0) from public.inv_items where id = $1`, itemID).Scan(&warrantyMonths)
	var wStart *time.Time
	wEnd := warrantyEndFromMonths(recvAt, warrantyMonths)
	if warrantyMonths > 0 {
		wStart = &recvAt
	}
	var unitID int64
	err := tx.QueryRow(ctx, `
		insert into public.inv_serial_units (
		  tenant_id, item_id, serial_no, status, location_id,
		  warranty_start, warranty_end, received_at
		) values ($1, $2, $3, 'in_stock', $4, $5::date, $6::date, $7::timestamptz)
		returning id`,
		tenantID, itemID, serialNo, locationID, wStart, wEnd,
		recvAt.Format("2006-01-02")+" 12:00:00+00").Scan(&unitID)
	if err != nil {
		return fmt.Errorf("failed to post serial %s: %w", serialNo, err)
	}
	loc := locationID
	if err := inventory.InsertSerialEvent(ctx, tx, tenantID, unitID, "received", nil, &loc, "mfg_work_order", woID, &userID); err != nil {
		return err
	}
	return inventory.ApplyStockDelta(ctx, tx, tenantID, itemID, locationID, 1, userID, "mfg_work_order", woID, "wo_trace_receipt", woReceiveStockReason(workOrderNo))
}

// voidWoOutputSerialStock removes a recorded finished serial from stock again.
func voidWoOutputSerialStock(ctx context.Context, tx pgx.Tx, tenantID, woID, locationID, itemID int64, serialNo string, userID int64, workOrderNo string) error {
	var unitID int64
	err := tx.QueryRow(ctx, `
		update public.inv_serial_units
		set status = 'void', location_id = null, updated_at = now()
		where tenant_id = $1 and item_id = $2 and serial_no = $3 and location_id = $4 and status = 'in_stock'
		returning id`, tenantID, itemID, serialNo, locationID).Scan(&unitID)
	if err != nil {
		return fmt.Errorf("serial %s is no longer in stock at this warehouse", serialNo)
	}
	loc := locationID
	if err := inventory.InsertSerialEvent(ctx, tx, tenantID, unitID, "voided", &loc, nil, "mfg_work_order", woID, &userID); err != nil {
		return err
	}
	return inventory.ApplyStockDelta(ctx, tx, tenantID, itemID, locationID, -1, userID, "mfg_work_order", woID, "wo_trace_void", woVoidStockReason(workOrderNo))
}

// unstageWorkOrderLot puts a taken lot line back in stock while the job is still open.
func unstageWorkOrderLot(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		woID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		lineID, err := strconv.ParseInt(chi.URLParam(r, "lineId"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"lineId": "Invalid line id."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to put the lot back.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		wo, err := loadOpenWorkOrderForUnstage(r.Context(), tx, tu.TenantID, woID)
		if err != nil {
			respondReleasedWOLoadError(w, err, "Only open jobs can put a lot back. This job is already finished.")
			return
		}
		var itemID, lotBatchID int64
		var qty float64
		var posted bool
		err = tx.QueryRow(r.Context(), `
			select component_item_id, lot_batch_id, qty::float8, stock_posted
			from public.mfg_wo_issue_lots
			where id = $1 and work_order_id = $2 and tenant_id = $3
			for update`, lineID, woID, tu.TenantID).Scan(&itemID, &lotBatchID, &qty, &posted)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Taken lot line not found on this job.", "ERR_NOT_FOUND")
			return
		}
		if posted {
			if err := returnIssueLotStock(r.Context(), tx, tu.TenantID, woID, wo.LocationID, itemID, lotBatchID, qty, tu.AppUserID, wo.WorkOrderNo); err != nil {
				response.ValidationSmart(w, map[string]string{"stock": err.Error()})
				return
			}
		}
		if _, err := tx.Exec(r.Context(), `delete from public.mfg_wo_issue_lots where id = $1`, lineID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to put the lot back.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to put the lot back.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "manufacturing.wo_unstage_lot", "mfg_work_order", &woID, nil, map[string]any{"line_id": lineID, "lot_batch_id": lotBatchID, "qty": qty})
		response.OK(w, map[string]any{"line_id": lineID, "qty": qty}, "Lot put back in stock.")
	}
}

// unstageWorkOrderSerial frees a taken serial while the job is still open.
func unstageWorkOrderSerial(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		woID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		lineID, err := strconv.ParseInt(chi.URLParam(r, "lineId"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"lineId": "Invalid line id."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to put the serial back.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		wo, err := loadOpenWorkOrderForUnstage(r.Context(), tx, tu.TenantID, woID)
		if err != nil {
			respondReleasedWOLoadError(w, err, "Only open jobs can put a serial back. This job is already finished.")
			return
		}
		var itemID, unitID int64
		var posted bool
		err = tx.QueryRow(r.Context(), `
			select component_item_id, serial_unit_id, stock_posted
			from public.mfg_wo_issue_serials
			where id = $1 and work_order_id = $2 and tenant_id = $3
			for update`, lineID, woID, tu.TenantID).Scan(&itemID, &unitID, &posted)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Taken serial not found on this job.", "ERR_NOT_FOUND")
			return
		}
		if posted {
			if err := returnIssueSerialStock(r.Context(), tx, tu.TenantID, woID, wo.LocationID, itemID, unitID, tu.AppUserID, wo.WorkOrderNo); err != nil {
				response.ValidationSmart(w, map[string]string{"stock": err.Error()})
				return
			}
		}
		if _, err := tx.Exec(r.Context(), `delete from public.mfg_wo_issue_serials where id = $1`, lineID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to put the serial back.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to put the serial back.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "manufacturing.wo_unstage_serial", "mfg_work_order", &woID, nil, map[string]any{"line_id": lineID, "serial_unit_id": unitID})
		response.OK(w, map[string]any{"line_id": lineID, "serial_unit_id": unitID}, "Serial put back in stock.")
	}
}

func batchWorkOrderOutputSerials(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		woID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body woOutputSerialBatchBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.Scans) == 0 {
			response.Validation(w, map[string]string{"scans": "At least one scan is required."})
			return
		}
		if len(body.Scans) > maxWoOutputBatchSize {
			response.Validation(w, map[string]string{"scans": fmt.Sprintf("Maximum %d scans per batch.", maxWoOutputBatchSize)})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to stage output serials.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		wo, _, err := loadReleasedWorkOrderForTrace(r.Context(), tx, tu.TenantID, woID)
		if err != nil {
			respondReleasedWOLoadError(w, err, "Only released work orders accept output scans.")
			return
		}
		fgSettings, err := inventory.LoadItemTrackingSettings(r.Context(), tx, tu.TenantID, wo.FinishedItemID)
		if err != nil || !fgSettings.TrackSerial {
			response.Validation(w, map[string]string{"item": "Finished item does not track serial numbers."})
			return
		}

		results, err := processWoOutputSerialScans(r.Context(), tx, tu.TenantID, wo, tu.AppUserID, body.Scans)
		if err != nil {
			response.ValidationSmart(w, map[string]string{"stock": err.Error()})
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to stage output serials.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "manufacturing.wo_output_serial_batch", "mfg_work_order", &woID, nil, map[string]any{"count": len(body.Scans)})
		response.OK(w, map[string]any{"results": results}, "Recorded and put in stock.")
	}
}

func batchWorkOrderOutputLots(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		woID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body woOutputLotBatchBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.Scans) == 0 {
			response.Validation(w, map[string]string{"scans": "At least one lot entry is required."})
			return
		}
		if len(body.Scans) > maxWoOutputBatchSize {
			response.Validation(w, map[string]string{"scans": fmt.Sprintf("Maximum %d lot entries per batch.", maxWoOutputBatchSize)})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to stage output lots.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		wo, _, err := loadReleasedWorkOrderForTrace(r.Context(), tx, tu.TenantID, woID)
		if err != nil {
			respondReleasedWOLoadError(w, err, "Only released work orders accept output scans.")
			return
		}
		bom, err := loadBom(r.Context(), tx, tu.TenantID, wo.BomID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "BOM not found.", "ERR_INTERNAL")
			return
		}
		disassembly := normalizeBomType(bom.BomType) == "disassembly"
		hasComponentScans := false
		for _, sc := range body.Scans {
			if sc.ComponentItemID != nil && *sc.ComponentItemID > 0 {
				hasComponentScans = true
				break
			}
		}
		if hasComponentScans {
			if !disassembly {
				response.Validation(w, map[string]string{"component_item_id": "Cut SKU lots are only valid on cut-apart (disassembly) jobs."})
				return
			}
			allowed := map[int64]BomLine{}
			recordOnly := map[int64]bool{}
			for _, ln := range bom.Lines {
				allowed[ln.ComponentItemID] = ln
				// Waste-class cuts are recorded for the variance report but never receive sellable stock.
				if !ReceivesStockForClassification(NormalizeOutputClassification(ln.OutputClassification)) {
					recordOnly[ln.ComponentItemID] = true
				}
			}
			for _, sc := range body.Scans {
				if sc.ComponentItemID == nil || *sc.ComponentItemID <= 0 {
					response.Validation(w, map[string]string{"component_item_id": "Each cut weigh row needs component_item_id."})
					return
				}
				if _, ok := allowed[*sc.ComponentItemID]; !ok {
					response.Validation(w, map[string]string{"component_item_id": "Component is not on this recipe."})
					return
				}
			}
			results, err := processWoOutputLotScans(r.Context(), tx, tu.TenantID, wo, tu.AppUserID, wo.FinishedItemCode, nil, recordOnly, body.Scans)
			if err != nil {
				response.ValidationSmart(w, map[string]string{"stock": err.Error()})
				return
			}
			if err := tx.Commit(r.Context()); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to stage output lots.", "ERR_INTERNAL")
				return
			}
			_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "manufacturing.wo_output_lot_batch", "mfg_work_order", &woID, nil, map[string]any{"count": len(body.Scans), "cut": true})
			response.OK(w, map[string]any{"results": results}, "Recorded and put in stock.")
			return
		}

		fgSettings, err := inventory.LoadItemTrackingSettings(r.Context(), tx, tu.TenantID, wo.FinishedItemID)
		if err != nil || !fgSettings.TrackLot {
			response.Validation(w, map[string]string{"item": "Finished item does not track lots."})
			return
		}

		results, err := processWoOutputLotScans(r.Context(), tx, tu.TenantID, wo, tu.AppUserID, wo.FinishedItemCode, fgSettings.DefaultShelfLifeDays, nil, body.Scans)
		if err != nil {
			response.ValidationSmart(w, map[string]string{"stock": err.Error()})
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to stage output lots.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "manufacturing.wo_output_lot_batch", "mfg_work_order", &woID, nil, map[string]any{"count": len(body.Scans)})
		response.OK(w, map[string]any{"results": results}, "Recorded and put in stock.")
	}
}

func getWorkOrderScanContext(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		woID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		ctx, err := loadWorkOrderScanContext(r.Context(), pool, tu.TenantID, woID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				response.Err(w, http.StatusNotFound, "Work order not found.", "ERR_NOT_FOUND")
				return
			}
			msg := err.Error()
			lower := strings.ToLower(msg)
			// Surface UoM / master-data problems as validation so the floor UI can show the fix.
			if strings.Contains(lower, "base unit") ||
				strings.Contains(lower, "location") ||
				strings.Contains(lower, "component") ||
				strings.Contains(lower, "conversion") ||
				strings.Contains(lower, "add conversion") ||
				strings.Contains(lower, "unit is required") {
				response.Validation(w, map[string]string{"scan_context": msg})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to load scan context.", "ERR_INTERNAL")
			return
		}
		response.OK(w, ctx, "OK")
	}
}

var errWoNotReleased = errors.New("work order not released")

func respondReleasedWOLoadError(w http.ResponseWriter, err error, notReleasedMsg string) {
	if errors.Is(err, errWoNotReleased) {
		response.ValidationSmart(w, map[string]string{"status": notReleasedMsg})
		return
	}
	if errors.Is(err, pgx.ErrNoRows) {
		response.Err(w, http.StatusNotFound, "Work order not found.", "ERR_NOT_FOUND")
		return
	}
	response.Err(w, http.StatusInternalServerError, "Failed to load work order.", "ERR_INTERNAL")
}

func isUndefinedColumnErr(err error, column string) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	col := strings.ToLower(column)
	return strings.Contains(msg, col) && (strings.Contains(msg, "does not exist") || strings.Contains(msg, "undefined_column"))
}

func loadReleasedWorkOrderForTrace(ctx context.Context, tx pgx.Tx, tenantID, woID int64) (WorkOrder, Bom, error) {
	var wo WorkOrder
	var status string
	err := tx.QueryRow(ctx, `
		select wo.id, wo.work_order_no, wo.bom_id, wo.finished_item_id, wo.location_id,
		  wo.qty_to_produce::float8, wo.status,
		  coalesce(fi.item_code, ''), coalesce(fi.item_name, ''),
		  coalesce(loc.location_name, '')
		from public.mfg_work_orders wo
		join public.inv_items fi on fi.id = wo.finished_item_id
		left join public.inv_locations loc on loc.id = wo.location_id
		where wo.id = $1 and wo.tenant_id = $2
		for update of wo`, woID, tenantID).Scan(
		&wo.ID, &wo.WorkOrderNo, &wo.BomID, &wo.FinishedItemID, &wo.LocationID,
		&wo.QtyToProduce, &status, &wo.FinishedItemCode, &wo.FinishedItemName, &wo.LocationName)
	if err != nil {
		return WorkOrder{}, Bom{}, err
	}
	wo.Status = status
	if status != "released" {
		return wo, Bom{}, errWoNotReleased
	}
	bom, err := loadBom(ctx, tx, tenantID, wo.BomID)
	if err != nil {
		return wo, Bom{}, err
	}
	return wo, bom, nil
}

func bomComponentIDs(bom Bom, finishedItemID int64, disassembly bool) map[int64]bool {
	out := map[int64]bool{}
	if disassembly {
		out[finishedItemID] = true
		return out
	}
	for _, ln := range bom.Lines {
		out[ln.ComponentItemID] = true
	}
	return out
}

func normalizeWoSerialNo(s string) string {
	return strings.TrimSpace(strings.Trim(s, "\r\n\t"))
}

func normalizeWoLotNo(s string) string {
	return strings.TrimSpace(s)
}

func autoWoLotNo(itemCode string, seq int) string {
	code := strings.TrimSpace(itemCode)
	if code == "" {
		code = "ITEM"
	}
	return fmt.Sprintf("%s-%s-%03d", time.Now().UTC().Format("20060102"), code, seq)
}

func defaultWoExpiry(shelfDays *int) *time.Time {
	if shelfDays == nil || *shelfDays <= 0 {
		return nil
	}
	d := time.Now().UTC().AddDate(0, 0, *shelfDays)
	t := time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, time.UTC)
	return &t
}

// processWoOutputSerialScans records finished serials and puts each one into stock at once.
func processWoOutputSerialScans(ctx context.Context, tx pgx.Tx, tenantID int64, wo WorkOrder, userID int64, scans []woOutputSerialScan) ([]woOutputSerialScanResult, error) {
	woID := wo.ID
	seen := map[string]bool{}
	results := make([]woOutputSerialScanResult, 0, len(scans))
	for _, sc := range scans {
		res := woOutputSerialScanResult{ClientScanID: sc.ClientScanID, SerialNo: sc.SerialNo}
		serialNo := normalizeWoSerialNo(sc.SerialNo)
		res.SerialNo = serialNo
		if serialNo == "" {
			res.Status = "empty"
			res.Message = "Serial number is required."
			results = append(results, res)
			continue
		}
		if sc.ClientScanID != "" {
			var existingID int64
			var existingNo string
			err := tx.QueryRow(ctx, `
				select id, serial_no from public.mfg_wo_output_serials
				where tenant_id = $1 and work_order_id = $2 and client_scan_id = $3 and status in ('staged', 'posted')`,
				tenantID, woID, sc.ClientScanID).Scan(&existingID, &existingNo)
			if err == nil {
				res.Status = "idempotent_replay"
				res.ID = &existingID
				res.SerialNo = existingNo
				results = append(results, res)
				continue
			}
		}
		batchKey := serialNo
		if seen[batchKey] {
			res.Status = "batch_duplicate"
			res.Message = "Duplicate serial in batch."
			results = append(results, res)
			continue
		}
		seen[batchKey] = true

		var dup bool
		_ = tx.QueryRow(ctx, `
			select exists(
			  select 1 from public.inv_serial_units
			  where tenant_id = $1 and serial_no = $2 and status <> 'void'
			)`, tenantID, serialNo).Scan(&dup)
		if dup {
			res.Status = "duplicate"
			res.Message = "Serial number already exists."
			results = append(results, res)
			continue
		}

		var clientScanArg any
		if sc.ClientScanID != "" {
			clientScanArg = sc.ClientScanID
		}
		var rowID int64
		err := tx.QueryRow(ctx, `
			insert into public.mfg_wo_output_serials (tenant_id, work_order_id, serial_no, client_scan_id, status)
			values ($1, $2, $3, $4, 'posted')
			returning id`, tenantID, woID, serialNo, clientScanArg).Scan(&rowID)
		if err != nil {
			res.Status = "duplicate"
			res.Message = "Failed to record serial."
			results = append(results, res)
			continue
		}
		// Stock moves now: the finished serial is in stock as soon as it is recorded.
		if err := receiveWoOutputSerialStock(ctx, tx, tenantID, woID, wo.LocationID, wo.FinishedItemID, serialNo, userID, wo.WorkOrderNo); err != nil {
			return nil, err
		}
		res.Status = "accepted"
		res.ID = &rowID
		results = append(results, res)
	}
	return results, nil
}

// processWoOutputLotScans records output lots and puts each sellable one into stock at once.
// recordOnly lists cut items (waste class) that are recorded without receiving stock.
func processWoOutputLotScans(ctx context.Context, tx pgx.Tx, tenantID int64, wo WorkOrder, userID int64, itemCode string, shelfDays *int, recordOnly map[int64]bool, scans []woOutputLotScan) ([]woOutputLotScanResult, error) {
	woID := wo.ID
	seen := map[string]bool{}
	results := make([]woOutputLotScanResult, 0, len(scans))
	seq := 0
	for _, sc := range scans {
		res := woOutputLotScanResult{ClientScanID: sc.ClientScanID, LotNo: sc.LotNo, Qty: sc.Qty}
		if sc.ClientScanID != "" {
			var existingID int64
			var existingNo string
			var existingQty float64
			err := tx.QueryRow(ctx, `
				select id, lot_no, qty::float8 from public.mfg_wo_output_lots
				where tenant_id = $1 and work_order_id = $2 and client_scan_id = $3 and status in ('staged', 'posted')`,
				tenantID, woID, sc.ClientScanID).Scan(&existingID, &existingNo, &existingQty)
			if err == nil {
				res.Status = "idempotent_replay"
				res.ID = &existingID
				res.LotNo = existingNo
				res.Qty = existingQty
				results = append(results, res)
				continue
			}
		}
		qty := sc.Qty
		if sc.CatchWeight != nil && *sc.CatchWeight > 0 {
			qty = *sc.CatchWeight
		}
		if qty <= 0 {
			res.Status = "empty"
			res.Message = "Quantity must be greater than zero."
			results = append(results, res)
			continue
		}
		res.Qty = qty
		codeForLot := itemCode
		var shelfForScan = shelfDays
		// Assembly: the finished item, always lot-tracked here. Cutting: the cut SKU, which may not track lots.
		stockItemID := wo.FinishedItemID
		stockTrackLot := true
		movementType := "wo_trace_receipt"
		receiveStock := true
		if sc.ComponentItemID != nil && *sc.ComponentItemID > 0 {
			stockItemID = *sc.ComponentItemID
			movementType = "wo_disassembly_receipt"
			receiveStock = !recordOnly[stockItemID]
			_ = tx.QueryRow(ctx, `select coalesce(item_code, '') from public.inv_items where id = $1`, *sc.ComponentItemID).Scan(&codeForLot)
			st, errSt := inventory.LoadItemTrackingSettings(ctx, tx, tenantID, *sc.ComponentItemID)
			if errSt == nil {
				stockTrackLot = st.TrackLot
				if st.DefaultShelfLifeDays != nil {
					shelfForScan = st.DefaultShelfLifeDays
				}
			}
		}
		lotNo := normalizeWoLotNo(sc.LotNo)
		if lotNo == "" {
			seq++
			lotNo = autoWoLotNo(codeForLot, seq)
		}
		res.LotNo = lotNo
		if seen[lotNo] {
			res.Status = "batch_duplicate"
			res.Message = "Duplicate lot in batch."
			results = append(results, res)
			continue
		}
		seen[lotNo] = true

		var expiry *time.Time
		if sc.ExpiryDate != nil && strings.TrimSpace(*sc.ExpiryDate) != "" {
			d, err := parseDate(*sc.ExpiryDate)
			if err != nil {
				res.Status = "invalid"
				res.Message = "Invalid expiry date."
				results = append(results, res)
				continue
			}
			expiry = &d
		} else {
			expiry = defaultWoExpiry(shelfForScan)
		}

		var clientScanArg any
		if sc.ClientScanID != "" {
			clientScanArg = sc.ClientScanID
		}
		var componentArg any
		if sc.ComponentItemID != nil && *sc.ComponentItemID > 0 {
			componentArg = *sc.ComponentItemID
		}
		var rowID int64
		err := tx.QueryRow(ctx, `
			insert into public.mfg_wo_output_lots (tenant_id, work_order_id, lot_no, qty, expiry_date, catch_weight, client_scan_id, status, component_item_id)
			values ($1, $2, $3, $4, $5, $6, $7, 'staged', $8)
			returning id`, tenantID, woID, lotNo, qty, expiry, sc.CatchWeight, clientScanArg, componentArg).Scan(&rowID)
		if err != nil {
			// Fallback without component_item_id only when migration 279 is not applied.
			if componentArg != nil && !isUndefinedColumnErr(err, "component_item_id") {
				res.Status = "invalid"
				res.Message = "Failed to record lot."
				results = append(results, res)
				continue
			}
			err2 := tx.QueryRow(ctx, `
				insert into public.mfg_wo_output_lots (tenant_id, work_order_id, lot_no, qty, expiry_date, catch_weight, client_scan_id, status)
				values ($1, $2, $3, $4, $5, $6, $7, 'staged')
				returning id`, tenantID, woID, lotNo, qty, expiry, sc.CatchWeight, clientScanArg).Scan(&rowID)
			if err2 != nil {
				res.Status = "duplicate"
				res.Message = "Failed to record lot."
				results = append(results, res)
				continue
			}
		}
		// Stock moves now for sellable outputs. Waste-class cuts stay recorded only.
		if receiveStock {
			if err := receiveWoOutputLotStock(ctx, tx, tenantID, woID, wo.LocationID, stockItemID, lotNo, qty, expiry, stockTrackLot, movementType, userID, wo.WorkOrderNo); err != nil {
				return nil, err
			}
			if _, err := tx.Exec(ctx, `update public.mfg_wo_output_lots set status = 'posted' where id = $1`, rowID); err != nil {
				return nil, err
			}
		}
		res.Status = "accepted"
		res.ID = &rowID
		results = append(results, res)
	}
	return results, nil
}

type woRecordedOutputLot struct {
	ID              int64   `json:"id"`
	ComponentItemID *int64  `json:"component_item_id,omitempty"`
	ComponentCode   string  `json:"component_code,omitempty"`
	ComponentName   string  `json:"component_name,omitempty"`
	LotNo           string  `json:"lot_no"`
	Qty             float64 `json:"qty"`
	ExpiryDate      *string `json:"expiry_date,omitempty"`
	Status          string  `json:"status"`
	InStock         bool    `json:"in_stock"`
	CreatedAt       string  `json:"created_at"`
}

type issuedTraceRow struct {
	ItemCode string  `json:"item_code,omitempty"`
	Number   string  `json:"number"`
	Qty      float64 `json:"qty,omitempty"`
}

// listWorkOrderIssuedTrace returns serials and lots already stored on a job, including completed jobs.
func listWorkOrderIssuedTrace(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		woID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var exists int
		if err := pool.QueryRow(r.Context(), `select 1 from public.mfg_work_orders where id=$1 and tenant_id=$2`, woID, tu.TenantID).Scan(&exists); err != nil {
			response.Err(w, http.StatusNotFound, "Work order not found.", "ERR_NOT_FOUND")
			return
		}
		issueSerials, err := loadIssuedNumbers(r.Context(), pool, `
			select coalesce(i.item_code, ''), su.serial_no, 1::float8
			from public.mfg_wo_issue_serials wis
			join public.inv_serial_units su on su.id = wis.serial_unit_id
			left join public.inv_items i on i.id = wis.component_item_id
			where wis.tenant_id = $1 and wis.work_order_id = $2
			order by wis.id`, tu.TenantID, woID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load issued serials.", "ERR_INTERNAL")
			return
		}
		issueLots, err := loadIssuedNumbers(r.Context(), pool, `
			select coalesce(i.item_code, ''), lb.lot_no, wil.qty::float8
			from public.mfg_wo_issue_lots wil
			join public.inv_lot_batches lb on lb.id = wil.lot_batch_id
			left join public.inv_items i on i.id = wil.component_item_id
			where wil.tenant_id = $1 and wil.work_order_id = $2
			order by wil.id`, tu.TenantID, woID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load issued lots.", "ERR_INTERNAL")
			return
		}
		outputSerials, err := loadIssuedNumbers(r.Context(), pool, `
			select '', serial_no, 1::float8
			from public.mfg_wo_output_serials
			where tenant_id = $1 and work_order_id = $2 and status in ('staged', 'posted')
			order by id`, tu.TenantID, woID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load finished serials.", "ERR_INTERNAL")
			return
		}
		outputLots, err := loadIssuedNumbers(r.Context(), pool, `
			select '', lot_no, coalesce(nullif(catch_weight, 0), qty)::float8
			from public.mfg_wo_output_lots
			where tenant_id = $1 and work_order_id = $2 and status in ('staged', 'posted')
			order by id`, tu.TenantID, woID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load finished lots.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{
			"issue_serials":  issueSerials,
			"issue_lots":     issueLots,
			"output_serials": outputSerials,
			"output_lots":    outputLots,
		}, "OK")
	}
}

func loadIssuedNumbers(ctx context.Context, pool *pgxpool.Pool, query string, tenantID, woID int64) ([]issuedTraceRow, error) {
	rows, err := pool.Query(ctx, query, tenantID, woID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []issuedTraceRow{}
	for rows.Next() {
		var row issuedTraceRow
		if err := rows.Scan(&row.ItemCode, &row.Number, &row.Qty); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

// listWorkOrderOutputLots returns the parts or finished lots recorded on a job (not voided).
func listWorkOrderOutputLots(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		woID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		rows, err := pool.Query(r.Context(), `
			select ol.id, ol.component_item_id, coalesce(i.item_code, ''), coalesce(i.item_name, ''),
			  ol.lot_no, coalesce(nullif(ol.catch_weight, 0), ol.qty)::float8, ol.expiry_date::text, ol.status, ol.created_at::text
			from public.mfg_wo_output_lots ol
			join public.mfg_work_orders wo on wo.id = ol.work_order_id
			left join public.inv_items i on i.id = ol.component_item_id
			where ol.tenant_id = $1 and ol.work_order_id = $2 and wo.tenant_id = $1
			  and ol.status in ('staged', 'posted')
			order by ol.id desc`, tu.TenantID, woID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list recorded parts.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []woRecordedOutputLot{}
		for rows.Next() {
			var row woRecordedOutputLot
			if err := rows.Scan(&row.ID, &row.ComponentItemID, &row.ComponentCode, &row.ComponentName, &row.LotNo, &row.Qty, &row.ExpiryDate, &row.Status, &row.CreatedAt); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to list recorded parts.", "ERR_INTERNAL")
				return
			}
			row.InStock = row.Status == "posted"
			out = append(out, row)
		}
		if err := rows.Err(); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list recorded parts.", "ERR_INTERNAL")
			return
		}
		response.OK(w, out, "OK")
	}
}

// removeWorkOrderOutputLot removes a recorded part or finished lot while the job is still open.
// A row that already went into stock leaves stock again.
func removeWorkOrderOutputLot(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		woID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		lotRowID, err := strconv.ParseInt(chi.URLParam(r, "lotId"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"lotId": "Invalid lot id."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to remove the part.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		wo, err := loadOpenWorkOrderForUnstage(r.Context(), tx, tu.TenantID, woID)
		if err != nil {
			respondReleasedWOLoadError(w, err, "Only open jobs can remove a recorded part. This job is already finished.")
			return
		}
		var componentItemID *int64
		var lotNo, status string
		var qty float64
		err = tx.QueryRow(r.Context(), `
			select component_item_id, lot_no, coalesce(nullif(catch_weight, 0), qty)::float8, status
			from public.mfg_wo_output_lots
			where id = $1 and work_order_id = $2 and tenant_id = $3
			for update`, lotRowID, woID, tu.TenantID).Scan(&componentItemID, &lotNo, &qty, &status)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Recorded part not found on this job.", "ERR_NOT_FOUND")
			return
		}
		if status == "void" {
			response.Validation(w, map[string]string{"status": "This part was already removed."})
			return
		}
		if status == "posted" {
			itemID := wo.FinishedItemID
			if componentItemID != nil && *componentItemID > 0 {
				itemID = *componentItemID
			}
			settings, err := inventory.LoadItemTrackingSettings(r.Context(), tx, tu.TenantID, itemID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load item settings.", "ERR_INTERNAL")
				return
			}
			if err := voidWoOutputLotStock(r.Context(), tx, tu.TenantID, woID, wo.LocationID, itemID, lotNo, qty, settings.TrackLot, tu.AppUserID, wo.WorkOrderNo); err != nil {
				response.ValidationSmart(w, map[string]string{"stock": err.Error()})
				return
			}
		}
		if _, err := tx.Exec(r.Context(), `delete from public.mfg_wo_output_lots where id = $1`, lotRowID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to remove the part.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to remove the part.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "manufacturing.wo_output_lot_remove", "mfg_work_order", &woID, nil, map[string]any{"output_lot_id": lotRowID, "lot_no": lotNo, "qty": qty, "was_in_stock": status == "posted"})
		msg := "Part removed."
		if status == "posted" {
			msg = "Part removed and taken back out of stock."
		}
		response.OK(w, map[string]any{"id": lotRowID, "lot_no": lotNo, "qty": qty}, msg)
	}
}

// removeWorkOrderOutputSerial removes a recorded finished serial while the job is still open.
func removeWorkOrderOutputSerial(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		woID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		rowID, err := strconv.ParseInt(chi.URLParam(r, "serialId"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"serialId": "Invalid serial id."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to remove the serial.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		wo, err := loadOpenWorkOrderForUnstage(r.Context(), tx, tu.TenantID, woID)
		if err != nil {
			respondReleasedWOLoadError(w, err, "Only open jobs can remove a recorded serial. This job is already finished.")
			return
		}
		var serialNo, status string
		err = tx.QueryRow(r.Context(), `
			select serial_no, status from public.mfg_wo_output_serials
			where id = $1 and work_order_id = $2 and tenant_id = $3
			for update`, rowID, woID, tu.TenantID).Scan(&serialNo, &status)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Recorded serial not found on this job.", "ERR_NOT_FOUND")
			return
		}
		if status == "void" {
			response.Validation(w, map[string]string{"status": "This serial was already removed."})
			return
		}
		if status == "posted" {
			if err := voidWoOutputSerialStock(r.Context(), tx, tu.TenantID, woID, wo.LocationID, wo.FinishedItemID, serialNo, tu.AppUserID, wo.WorkOrderNo); err != nil {
				response.ValidationSmart(w, map[string]string{"stock": err.Error()})
				return
			}
		}
		if _, err := tx.Exec(r.Context(), `delete from public.mfg_wo_output_serials where id = $1`, rowID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to remove the serial.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to remove the serial.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "manufacturing.wo_output_serial_remove", "mfg_work_order", &woID, nil, map[string]any{"output_serial_id": rowID, "serial_no": serialNo, "was_in_stock": status == "posted"})
		msg := "Serial removed."
		if status == "posted" {
			msg = "Serial removed and taken back out of stock."
		}
		response.OK(w, map[string]any{"id": rowID, "serial_no": serialNo}, msg)
	}
}

func loadWorkOrderScanContext(ctx context.Context, pool *pgxpool.Pool, tenantID, woID int64) (woScanContextPayload, error) {
	wo, err := loadWorkOrder(ctx, pool, tenantID, woID)
	if err != nil {
		return woScanContextPayload{}, err
	}
	bom, err := loadBom(ctx, pool, tenantID, wo.BomID)
	if err != nil {
		return woScanContextPayload{}, err
	}
	fgSettings, err := inventory.LoadItemTrackingSettings(ctx, pool, tenantID, wo.FinishedItemID)
	if err != nil {
		return woScanContextPayload{}, err
	}

	out := woScanContextPayload{
		WorkOrderID:      wo.ID,
		WorkOrderNo:      wo.WorkOrderNo,
		Status:           wo.Status,
		LocationID:       wo.LocationID,
		LocationName:     wo.LocationName,
		FinishedItemID:   wo.FinishedItemID,
		FinishedItemCode: wo.FinishedItemCode,
		FinishedItemName: wo.FinishedItemName,
		QtyToProduce:     wo.QtyToProduce,
		TrackSerial:      fgSettings.TrackSerial,
		TrackLot:         fgSettings.TrackLot,
		Components:       []woScanContextComponent{},
	}

	disassembly := normalizeBomType(bom.BomType) == "disassembly"
	lines := bom.Lines
	if disassembly {
		// Whole/input qty to consume equals job qty (finished item is the carcass/whole).
		stock := wo.QtyToProduce
		settings, _ := inventory.LoadItemTrackingSettings(ctx, pool, tenantID, wo.FinishedItemID)
		var issuedSerials int
		var issuedLotQty float64
		_ = pool.QueryRow(ctx, `select count(*) from public.mfg_wo_issue_serials where work_order_id = $1 and component_item_id = $2`, woID, wo.FinishedItemID).Scan(&issuedSerials)
		_ = pool.QueryRow(ctx, `select coalesce(sum(qty), 0)::float8 from public.mfg_wo_issue_lots where work_order_id = $1 and component_item_id = $2`, woID, wo.FinishedItemID).Scan(&issuedLotQty)
		out.Components = append(out.Components, woScanContextComponent{
			ComponentItemID: wo.FinishedItemID,
			ComponentCode:   wo.FinishedItemCode,
			ComponentName:   wo.FinishedItemName,
			StockToIssue:    stock,
			TrackSerial:     settings.TrackSerial,
			TrackLot:        settings.TrackLot,
			IssuedSerials:   issuedSerials,
			IssuedLotQty:    issuedLotQty,
		})
	} else {
		for _, ln := range lines {
			stock, _, err := StockIssueForLine(ctx, pool, tenantID, ln, wo.QtyToProduce, bom.OutputQty, bom.YieldPct)
			if err != nil {
				return woScanContextPayload{}, err
			}
			settings, _ := inventory.LoadItemTrackingSettings(ctx, pool, tenantID, ln.ComponentItemID)
			var issuedSerials int
			var issuedLotQty float64
			_ = pool.QueryRow(ctx, `select count(*) from public.mfg_wo_issue_serials where work_order_id = $1 and component_item_id = $2`, woID, ln.ComponentItemID).Scan(&issuedSerials)
			_ = pool.QueryRow(ctx, `select coalesce(sum(qty), 0)::float8 from public.mfg_wo_issue_lots where work_order_id = $1 and component_item_id = $2`, woID, ln.ComponentItemID).Scan(&issuedLotQty)
			out.Components = append(out.Components, woScanContextComponent{
				ComponentItemID: ln.ComponentItemID,
				ComponentCode:   ln.ComponentCode,
				ComponentName:   ln.ComponentName,
				StockToIssue:    stock,
				TrackSerial:     settings.TrackSerial,
				TrackLot:        settings.TrackLot,
				IssuedSerials:   issuedSerials,
				IssuedLotQty:    issuedLotQty,
			})
		}
	}

	// Recorded outputs are in stock already (posted); older rows may still be staged.
	_ = pool.QueryRow(ctx, `select count(*) from public.mfg_wo_output_serials where work_order_id = $1 and status in ('staged', 'posted')`, woID).Scan(&out.OutputSerials)
	_ = pool.QueryRow(ctx, `select coalesce(sum(coalesce(nullif(catch_weight, 0), qty)), 0)::float8 from public.mfg_wo_output_lots where work_order_id = $1 and status in ('staged', 'posted')`, woID).Scan(&out.OutputLotQty)
	return out, nil
}

func consumeWoIssueTrace(ctx context.Context, tx pgx.Tx, tenantID, woID, locationID, itemID int64, needQty float64, userID int64) error {
	settings, err := inventory.LoadItemTrackingSettings(ctx, tx, tenantID, itemID)
	if err != nil {
		return err
	}
	if !settings.TrackSerial && !settings.TrackLot {
		return fmt.Errorf("item %d is not trace-tracked", itemID)
	}
	var workOrderNo string
	_ = tx.QueryRow(ctx, `select work_order_no from public.mfg_work_orders where id = $1`, woID).Scan(&workOrderNo)

	if settings.TrackSerial {
		needCount := int(math.Round(needQty))
		if math.Abs(float64(needCount)-needQty) > 0.0001 {
			return fmt.Errorf("serial-tracked issue qty must be a whole number")
		}
		rows, err := tx.Query(ctx, `
			select wis.id, wis.serial_unit_id, wis.stock_posted
			from public.mfg_wo_issue_serials wis
			where wis.work_order_id = $1 and wis.component_item_id = $2
			order by wis.id`, woID, itemID)
		if err != nil {
			return err
		}
		type stagedIssueSerial struct {
			rowID  int64
			unitID int64
			posted bool
		}
		var staged []stagedIssueSerial
		for rows.Next() {
			var s stagedIssueSerial
			if err := rows.Scan(&s.rowID, &s.unitID, &s.posted); err != nil {
				rows.Close()
				return err
			}
			staged = append(staged, s)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		if len(staged) < needCount {
			return fmt.Errorf("staged serial count %d is less than required %d", len(staged), needCount)
		}
		// Allow over-staging: consume earliest staged serials only.
		use := staged[:needCount]
		extra := staged[needCount:]
		for _, s := range use {
			var serialNo string
			err := tx.QueryRow(ctx, `
				select serial_no from public.inv_serial_units
				where id = $1 and tenant_id = $2 and item_id = $3 and location_id = $4
				  and status in ('in_stock', 'reserved')
				for update`, s.unitID, tenantID, itemID, locationID).Scan(&serialNo)
			if err != nil {
				return fmt.Errorf("serial %d not available", s.unitID)
			}
			_, err = tx.Exec(ctx, `
				update public.inv_serial_units
				set status = 'scrapped', updated_at = now()
				where id = $1`, s.unitID)
			if err != nil {
				return err
			}
			loc := locationID
			if err := inventory.InsertSerialEvent(ctx, tx, tenantID, s.unitID, "adjusted", &loc, nil, "mfg_work_order", woID, &userID); err != nil {
				return err
			}
			// Stock already dropped when the serial was taken.
			if s.posted {
				continue
			}
			if err := inventory.ApplyStockDelta(ctx, tx, tenantID, itemID, locationID, -1, userID, "mfg_work_order", woID, "wo_trace_issue"); err != nil {
				return err
			}
		}
		// Serials taken but not needed go back to the free pool.
		for _, s := range extra {
			if s.posted {
				if err := returnIssueSerialStock(ctx, tx, tenantID, woID, locationID, itemID, s.unitID, userID, workOrderNo); err != nil {
					return err
				}
			}
			if _, err := tx.Exec(ctx, `delete from public.mfg_wo_issue_serials where id = $1`, s.rowID); err != nil {
				return err
			}
		}
		return nil
	}

	var stagedQty float64
	err = tx.QueryRow(ctx, `
		select coalesce(sum(qty), 0)::float8
		from public.mfg_wo_issue_lots
		where work_order_id = $1 and component_item_id = $2`, woID, itemID).Scan(&stagedQty)
	if err != nil {
		return err
	}
	if stagedQty+0.0001 < needQty {
		return fmt.Errorf("staged lot qty %.4f is less than required %.4f", stagedQty, needQty)
	}
	rows, err := tx.Query(ctx, `
		select id, lot_batch_id, qty::float8, stock_posted
		from public.mfg_wo_issue_lots
		where work_order_id = $1 and component_item_id = $2
		order by id`, woID, itemID)
	if err != nil {
		return err
	}
	type stagedIssueLot struct {
		rowID  int64
		lotID  int64
		qty    float64
		posted bool
	}
	var stagedLots []stagedIssueLot
	for rows.Next() {
		var ln stagedIssueLot
		if err := rows.Scan(&ln.rowID, &ln.lotID, &ln.qty, &ln.posted); err != nil {
			rows.Close()
			return err
		}
		stagedLots = append(stagedLots, ln)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	remaining := needQty
	for _, ln := range stagedLots {
		take := 0.0
		if remaining > 0.0001 {
			take = ln.qty
			if take > remaining {
				take = remaining
			}
		}
		excess := ln.qty - take
		if ln.posted {
			// Stock already dropped when the lot was taken. Only the unused part goes back.
			if excess > 0.0001 {
				if err := returnIssueLotStock(ctx, tx, tenantID, woID, locationID, itemID, ln.lotID, excess, userID, workOrderNo); err != nil {
					return err
				}
				if take <= 0.0001 {
					if _, err := tx.Exec(ctx, `delete from public.mfg_wo_issue_lots where id = $1`, ln.rowID); err != nil {
						return err
					}
				} else if _, err := tx.Exec(ctx, `update public.mfg_wo_issue_lots set qty = $1 where id = $2`, take, ln.rowID); err != nil {
					return err
				}
			}
			remaining -= take
			continue
		}
		if take <= 0.0001 {
			continue
		}
		tag, err := tx.Exec(ctx, `
			update public.inv_lot_batches
			set qty_on_hand = qty_on_hand - $1, updated_at = now()
			where id = $2 and tenant_id = $3 and location_id = $4 and qty_on_hand >= $1`,
			take, ln.lotID, tenantID, locationID)
		if err != nil || tag.RowsAffected() == 0 {
			return fmt.Errorf("failed to consume lot batch %d", ln.lotID)
		}
		if err := inventory.InsertLotEvent(ctx, tx, inventory.LotEventInput{
			TenantID:        tenantID,
			LotBatchID:      ln.lotID,
			EventType:       "consumed",
			FromLocationID:  &locationID,
			Qty:             take,
			RefType:         "mfg_work_order",
			RefID:           &woID,
			CreatedByUserID: &userID,
		}); err != nil {
			return err
		}
		if err := inventory.ApplyStockDelta(ctx, tx, tenantID, itemID, locationID, -take, userID, "mfg_work_order", woID, "wo_trace_issue"); err != nil {
			return err
		}
		remaining -= take
	}
	if remaining > 0.0001 {
		return fmt.Errorf("staged lot qty could not cover required %.4f", needQty)
	}
	return nil
}

func postWoOutputTrace(ctx context.Context, tx pgx.Tx, tenantID, woID, locationID, itemID int64, outputQty float64, userID int64, itemCode string, shelfDays *int) error {
	settings, err := inventory.LoadItemTrackingSettings(ctx, tx, tenantID, itemID)
	if err != nil {
		return err
	}
	if !settings.TrackSerial && !settings.TrackLot {
		return fmt.Errorf("item %d is not trace-tracked", itemID)
	}
	var workOrderNo string
	_ = tx.QueryRow(ctx, `select work_order_no from public.mfg_work_orders where id = $1`, woID).Scan(&workOrderNo)

	if settings.TrackSerial {
		needCount := int(math.Round(outputQty))
		if math.Abs(float64(needCount)-outputQty) > 0.0001 {
			return fmt.Errorf("serial-tracked output qty must be a whole number")
		}
		// Rows recorded on the Receive station are already in stock (posted). Rows from before that
		// change are still staged and post here. Posted rows are used first.
		rows, err := tx.Query(ctx, `
			select id, serial_no, status from public.mfg_wo_output_serials
			where work_order_id = $1 and status in ('staged', 'posted')
			order by (status = 'posted') desc, id`, woID)
		if err != nil {
			return err
		}
		type recordedSerial struct {
			id       int64
			serialNo string
			posted   bool
		}
		var recorded []recordedSerial
		for rows.Next() {
			var s recordedSerial
			var status string
			if err := rows.Scan(&s.id, &s.serialNo, &status); err != nil {
				rows.Close()
				return err
			}
			s.posted = status == "posted"
			recorded = append(recorded, s)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		if len(recorded) < needCount {
			return fmt.Errorf("staged output serial count %d is less than required %d", len(recorded), needCount)
		}
		extra := recorded[needCount:]
		use := recorded[:needCount]
		for _, s := range use {
			if s.posted {
				continue
			}
			if err := receiveWoOutputSerialStock(ctx, tx, tenantID, woID, locationID, itemID, s.serialNo, userID, workOrderNo); err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, `update public.mfg_wo_output_serials set status = 'posted' where id = $1`, s.id); err != nil {
				return err
			}
		}
		// Recorded but not produced: take them back out of stock instead of leaving ghosts.
		for _, s := range extra {
			if s.posted {
				if err := voidWoOutputSerialStock(ctx, tx, tenantID, woID, locationID, itemID, s.serialNo, userID, workOrderNo); err != nil {
					return err
				}
			}
			if _, err := tx.Exec(ctx, `update public.mfg_wo_output_serials set status = 'void' where id = $1`, s.id); err != nil {
				return err
			}
		}
		return nil
	}

	var recordedQty float64
	err = tx.QueryRow(ctx, `
		select coalesce(sum(coalesce(nullif(catch_weight, 0), qty)), 0)::float8
		from public.mfg_wo_output_lots
		where work_order_id = $1 and status in ('staged', 'posted')`, woID).Scan(&recordedQty)
	if err != nil {
		return fmt.Errorf("failed to read staged output lots: %w", err)
	}
	if recordedQty+0.0001 < outputQty {
		return fmt.Errorf("staged output lot qty %.4f is less than required %.4f", recordedQty, outputQty)
	}
	rows, err := tx.Query(ctx, `
		select id, lot_no, coalesce(nullif(catch_weight, 0), qty)::float8, expiry_date, status
		from public.mfg_wo_output_lots
		where work_order_id = $1 and status in ('staged', 'posted')
		order by (status = 'posted') desc, id`, woID)
	if err != nil {
		return fmt.Errorf("failed to list staged output lots: %w", err)
	}
	type recordedOutputLot struct {
		id      int64
		lotNo   string
		lineQty float64
		expiry  *time.Time
		posted  bool
	}
	var recordedLots []recordedOutputLot
	for rows.Next() {
		var ln recordedOutputLot
		var status string
		if err := rows.Scan(&ln.id, &ln.lotNo, &ln.lineQty, &ln.expiry, &status); err != nil {
			rows.Close()
			return fmt.Errorf("failed to scan staged output lot: %w", err)
		}
		ln.posted = status == "posted"
		recordedLots = append(recordedLots, ln)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return fmt.Errorf("failed reading staged output lots: %w", err)
	}
	remaining := outputQty
	for _, ln := range recordedLots {
		if remaining <= 0.0001 {
			// Nothing more was produced: a posted row leaves stock again, a staged row is only voided.
			if ln.posted {
				if err := voidWoOutputLotStock(ctx, tx, tenantID, woID, locationID, itemID, ln.lotNo, ln.lineQty, true, userID, workOrderNo); err != nil {
					return err
				}
			}
			if _, err := tx.Exec(ctx, `update public.mfg_wo_output_lots set status = 'void' where id = $1`, ln.id); err != nil {
				return fmt.Errorf("failed to void extra staged lot: %w", err)
			}
			continue
		}
		take := ln.lineQty
		if take > remaining {
			take = remaining
		}
		if ln.posted {
			// Already in stock when it was recorded. Only the part above Actual produced goes back out.
			if excess := ln.lineQty - take; excess > 0.0001 {
				if err := voidWoOutputLotStock(ctx, tx, tenantID, woID, locationID, itemID, ln.lotNo, excess, true, userID, workOrderNo); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `update public.mfg_wo_output_lots set qty = $1, catch_weight = null where id = $2`, take, ln.id); err != nil {
					return err
				}
			}
			remaining -= take
			continue
		}
		if err := receiveWoOutputLotStock(ctx, tx, tenantID, woID, locationID, itemID, ln.lotNo, take, ln.expiry, true, "wo_trace_receipt", userID, workOrderNo); err != nil {
			return fmt.Errorf("failed to post finished lot %s: %w", ln.lotNo, err)
		}
		_, err = tx.Exec(ctx, `update public.mfg_wo_output_lots set status = 'posted' where id = $1`, ln.id)
		if err != nil {
			return fmt.Errorf("failed to mark finished lot posted: %w", err)
		}
		remaining -= take
	}
	if remaining > 0.0001 {
		return fmt.Errorf("staged output lot qty could not cover required %.4f", outputQty)
	}
	return nil
}

func warrantyEndFromMonths(start time.Time, months int) *time.Time {
	if months <= 0 {
		return nil
	}
	end := start.AddDate(0, months, 0)
	t := time.Date(end.Year(), end.Month(), end.Day(), 0, 0, 0, 0, time.UTC)
	return &t
}
