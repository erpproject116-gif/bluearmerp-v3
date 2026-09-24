package manufacturing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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

type workOrderReverseBody struct {
	Reason string `json:"reason"`
}

func CanReverseWorkOrder(status string, alreadyReversed bool) (bool, string) {
	if status != WOStatusCompleted {
		return false, "Only completed work orders can be reversed."
	}
	if alreadyReversed {
		return false, "Work order has already been reversed."
	}
	return true, ""
}

func reverseWorkOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		workOrderID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body workOrderReverseBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		body.Reason = strings.TrimSpace(body.Reason)
		if body.Reason == "" {
			response.Validation(w, map[string]string{"reason": "A reversal reason is required."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to reverse work order.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var status, workOrderNo string
		err = tx.QueryRow(r.Context(), `
			select status, work_order_no
			from public.mfg_work_orders
			where id=$1 and tenant_id=$2
			for update`, workOrderID, tu.TenantID).Scan(&status, &workOrderNo)
		if errors.Is(err, pgx.ErrNoRows) {
			response.Err(w, http.StatusNotFound, "Work order not found.", "ERR_NOT_FOUND")
			return
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load work order.", "ERR_INTERNAL")
			return
		}
		var alreadyReversed bool
		if err := tx.QueryRow(r.Context(), `
			select exists(
			  select 1 from public.mfg_work_order_reversals
			  where tenant_id=$1 and work_order_id=$2
			)`, tu.TenantID, workOrderID).Scan(&alreadyReversed); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to check reversal.", "ERR_INTERNAL")
			return
		}
		if ok, reason := CanReverseWorkOrder(status, alreadyReversed); !ok {
			response.Validation(w, map[string]string{"status": reason})
			return
		}

		var reversalID int64
		if err := tx.QueryRow(r.Context(), `
			insert into public.mfg_work_order_reversals
			  (tenant_id, work_order_id, reason, created_by_user_id)
			values ($1,$2,$3,$4)
			returning id`,
			tu.TenantID, workOrderID, body.Reason, tu.AppUserID).Scan(&reversalID); err != nil {
			response.Err(w, http.StatusConflict, "Work order reversal already exists.", "ERR_CONFLICT")
			return
		}

		if err := reverseWorkOrderTrace(r.Context(), tx, tu.TenantID, workOrderID, reversalID, tu.AppUserID); err != nil {
			response.ValidationSmart(w, map[string]string{"stock": err.Error()})
			return
		}
		if err := reverseWorkOrderStock(r.Context(), tx, tu.TenantID, workOrderID, reversalID, tu.AppUserID); err != nil {
			response.ValidationSmart(w, map[string]string{"stock": err.Error()})
			return
		}
		journalID, err := postManufacturingReversalJournal(
			r.Context(), tx, tu.TenantID, tu.AppUserID, workOrderID, reversalID,
			time.Now().UTC().Truncate(24*time.Hour), workOrderNo,
		)
		if err != nil {
			response.Validation(w, map[string]string{"journal": err.Error()})
			return
		}
		if journalID > 0 {
			if _, err := tx.Exec(r.Context(),
				`update public.mfg_work_order_reversals set journal_entry_id=$1 where id=$2`,
				journalID, reversalID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to link reversal journal.", "ERR_INTERNAL")
				return
			}
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to reverse work order.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID,
			"manufacturing.work_order_reverse", "mfg_work_order", &workOrderID, nil, body)
		response.OK(w, map[string]any{
			"id":               reversalID,
			"work_order_id":    workOrderID,
			"journal_entry_id": journalID,
			"reason":           body.Reason,
		}, "Work order reversed. The completed work order was retained.")
	}
}

func reverseWorkOrderStock(ctx context.Context, tx pgx.Tx, tenantID, workOrderID, reversalID, userID int64) error {
	rows, err := tx.Query(ctx, `
		select item_id, location_id, sum(qty_delta)::float8
		from public.inv_stock_movements
		where tenant_id=$1 and ref_type='mfg_work_order' and ref_id=$2
		group by item_id, location_id
		order by item_id, location_id`, tenantID, workOrderID)
	if err != nil {
		return err
	}
	defer rows.Close()
	type movement struct {
		itemID, locationID int64
		qty                float64
	}
	var movements []movement
	for rows.Next() {
		var line movement
		if err := rows.Scan(&line.itemID, &line.locationID, &line.qty); err != nil {
			return err
		}
		movements = append(movements, line)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for _, line := range movements {
		if err := inventory.ApplyStockDelta(ctx, tx, tenantID, line.itemID, line.locationID, -line.qty,
			userID, "mfg_work_order_reversal", reversalID, "wo_reversal",
			fmt.Sprintf("Reversal of work order %d", workOrderID)); err != nil {
			return fmt.Errorf("cannot reverse item %d: %w", line.itemID, err)
		}
	}
	return nil
}

func reverseWorkOrderTrace(ctx context.Context, tx pgx.Tx, tenantID, workOrderID, reversalID, userID int64) error {
	if err := reverseWorkOrderSerials(ctx, tx, tenantID, workOrderID, reversalID, userID); err != nil {
		return err
	}
	// Net each lot: a lot taken then partly put back only reverses the part that stayed consumed;
	// a produced lot that was later voided only reverses what is still in stock.
	rows, err := tx.Query(ctx, `
		select lot_batch_id, event_type, qty, location_id
		from (
		  select le.lot_batch_id,
		    case when le.event_type in ('consumed','returned') then 'consumed' else 'produced' end as event_type,
		    sum(case when le.event_type in ('consumed','produced') then le.qty else -le.qty end)::float8 as qty,
		    lb.location_id
		  from public.inv_lot_events le
		  join public.inv_lot_batches lb on lb.id=le.lot_batch_id and lb.tenant_id=le.tenant_id
		  where le.tenant_id=$1 and le.ref_type='mfg_work_order' and le.ref_id=$2
		    and le.event_type in ('consumed','returned','produced','voided')
		  group by le.lot_batch_id,
		    case when le.event_type in ('consumed','returned') then 'consumed' else 'produced' end,
		    lb.location_id
		) net
		where qty > 0.0001
		order by lot_batch_id`, tenantID, workOrderID)
	if err != nil {
		return err
	}
	defer rows.Close()
	type lotMove struct {
		lotID, locationID int64
		eventType         string
		qty               float64
	}
	var moves []lotMove
	for rows.Next() {
		var move lotMove
		if err := rows.Scan(&move.lotID, &move.eventType, &move.qty, &move.locationID); err != nil {
			return err
		}
		moves = append(moves, move)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for _, move := range moves {
		delta, inverseType := move.qty, "returned"
		var from, to *int64
		to = &move.locationID
		if move.eventType == "produced" {
			delta, inverseType = -move.qty, "voided"
			from, to = &move.locationID, nil
		}
		tag, err := tx.Exec(ctx, `
			update public.inv_lot_batches
			set qty_on_hand=qty_on_hand+$1, updated_at=now()
			where id=$2 and tenant_id=$3 and qty_on_hand+$1 >= -0.0001`,
			delta, move.lotID, tenantID)
		if err != nil || tag.RowsAffected() == 0 {
			return fmt.Errorf("lot %d no longer has enough stock to reverse", move.lotID)
		}
		if err := inventory.InsertLotEvent(ctx, tx, inventory.LotEventInput{
			TenantID: tenantID, LotBatchID: move.lotID, EventType: inverseType,
			FromLocationID: from, ToLocationID: to, Qty: move.qty,
			RefType: "mfg_work_order_reversal", RefID: &reversalID,
			Notes: "Manufacturing reversal", CreatedByUserID: &userID,
		}); err != nil {
			return err
		}
	}
	return nil
}

func reverseWorkOrderSerials(ctx context.Context, tx pgx.Tx, tenantID, workOrderID, reversalID, userID int64) error {
	// A finished serial that was recorded and then removed on the same job is already void; skip it.
	rows, err := tx.Query(ctx, `
		select se.serial_unit_id, se.event_type, coalesce(se.from_location_id, se.to_location_id)
		from public.inv_serial_events se
		where se.tenant_id=$1 and se.ref_type='mfg_work_order' and se.ref_id=$2
		  and se.event_type in ('received','adjusted')
		  and not exists (
		    select 1 from public.inv_serial_events v
		    where v.serial_unit_id = se.serial_unit_id
		      and v.ref_type = 'mfg_work_order' and v.ref_id = $2
		      and v.event_type = 'voided'
		  )
		order by se.id`, tenantID, workOrderID)
	if err != nil {
		return err
	}
	defer rows.Close()
	type serialMove struct {
		unitID, locationID int64
		eventType          string
	}
	var moves []serialMove
	for rows.Next() {
		var move serialMove
		if err := rows.Scan(&move.unitID, &move.eventType, &move.locationID); err != nil {
			return err
		}
		moves = append(moves, move)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for _, move := range moves {
		if move.eventType == "received" {
			tag, err := tx.Exec(ctx, `
				update public.inv_serial_units
				set status='void', location_id=null, updated_at=now()
				where id=$1 and tenant_id=$2 and status='in_stock' and location_id=$3`,
				move.unitID, tenantID, move.locationID)
			if err != nil || tag.RowsAffected() == 0 {
				return fmt.Errorf("finished serial %d is no longer available to reverse", move.unitID)
			}
			loc := move.locationID
			if err := inventory.InsertSerialEvent(ctx, tx, tenantID, move.unitID, "voided",
				&loc, nil, "mfg_work_order_reversal", reversalID, &userID); err != nil {
				return err
			}
			continue
		}
		tag, err := tx.Exec(ctx, `
			update public.inv_serial_units
			set status='in_stock', location_id=$3, updated_at=now()
			where id=$1 and tenant_id=$2 and status='scrapped'`,
			move.unitID, tenantID, move.locationID)
		if err != nil || tag.RowsAffected() == 0 {
			return fmt.Errorf("component serial %d cannot be restored", move.unitID)
		}
		loc := move.locationID
		if err := inventory.InsertSerialEvent(ctx, tx, tenantID, move.unitID, "returned",
			nil, &loc, "mfg_work_order_reversal", reversalID, &userID); err != nil {
			return err
		}
	}
	return nil
}
