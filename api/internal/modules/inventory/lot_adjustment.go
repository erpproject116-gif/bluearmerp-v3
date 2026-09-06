package inventory

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type lotAdjustmentCandidateRow struct {
	ID           int64   `json:"id"`
	LotNo        string  `json:"lot_no"`
	ItemID       int64   `json:"item_id"`
	ItemCode     string  `json:"item_code"`
	ItemName     string  `json:"item_name"`
	LocationID   int64   `json:"location_id"`
	LocationName string  `json:"location_name"`
	QtyOnHand    float64 `json:"qty_on_hand"`
	ExpiryDate   *string `json:"expiry_date,omitempty"`
}

type lotAdjustmentLine struct {
	LotBatchID int64   `json:"lot_batch_id"`
	QtyDelta   float64 `json:"qty_delta"`
}

type lotAdjustmentBody struct {
	Reason string              `json:"reason"`
	Lines  []lotAdjustmentLine `json:"lines"`
}

type lotRegisterBody struct {
	ItemID     int64   `json:"item_id"`
	LotNo      string  `json:"lot_no"`
	LocationID int64   `json:"location_id"`
	Qty        float64 `json:"qty"`
	ExpiryDate *string `json:"expiry_date"`
}

func listLotAdjustmentCandidates(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"lot_no":      "lb.lot_no",
		"item_code":   "i.item_code",
		"qty_on_hand": "lb.qty_on_hand",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "lot_no", allowed)
		offset := httputil.Offset(p)

		where := "lb.tenant_id = $1 and i.track_lot = true"
		args := []any{tu.TenantID}
		argN := 2

		if p.Q != "" {
			where += fmt.Sprintf(" and (lb.lot_no ilike $%d or i.item_code ilike $%d or i.item_name ilike $%d)", argN, argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}
		if id, ok := optionalInt64Query(r, "item_id"); ok {
			where += fmt.Sprintf(" and lb.item_id = $%d", argN)
			args = append(args, *id)
			argN++
		}
		if id, ok := optionalInt64Query(r, "location_id"); ok {
			where += fmt.Sprintf(" and lb.location_id = $%d", argN)
			args = append(args, *id)
			argN++
		}

		sortCol := allowed[p.Sort]
		if sortCol == "" {
			sortCol = "lb.lot_no"
		}
		limitN := argN
		offsetN := argN + 1
		args = append(args, p.PageSize, offset)

		q := fmt.Sprintf(`
			select lb.id, lb.lot_no, lb.item_id, i.item_code, i.item_name,
			  lb.location_id, l.location_name, lb.qty_on_hand::float8, lb.expiry_date,
			  count(*) over()
			from public.inv_lot_batches lb
			join public.inv_items i on i.id = lb.item_id
			join public.inv_locations l on l.id = lb.location_id
			where %s
			order by %s %s
			limit $%d offset $%d`, where, sortCol, orderSQL(p.Order), limitN, offsetN)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list lot batches.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []lotAdjustmentCandidateRow
		var total int64
		for rows.Next() {
			var row lotAdjustmentCandidateRow
			var expiry *string
			if err := rows.Scan(&row.ID, &row.LotNo, &row.ItemID, &row.ItemCode, &row.ItemName,
				&row.LocationID, &row.LocationName, &row.QtyOnHand, &expiry, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read lot batches.", "ERR_INTERNAL")
				return
			}
			row.ExpiryDate = expiry
			out = append(out, row)
		}
		if out == nil {
			out = []lotAdjustmentCandidateRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func applyLotAdjustments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body lotAdjustmentBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		reason := strings.TrimSpace(body.Reason)
		if reason == "" {
			response.Validation(w, map[string]string{"reason": "Reason is required."})
			return
		}
		if len(body.Lines) == 0 {
			response.Validation(w, map[string]string{"lines": "At least one adjustment line is required."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to adjust lots.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		adjusted := 0
		userID := tu.AppUserID

		for _, line := range body.Lines {
			if line.QtyDelta == 0 {
				continue
			}
			if line.LotBatchID <= 0 {
				response.Validation(w, map[string]string{"lines": "Invalid lot batch id."})
				return
			}

			var itemID, locationID int64
			var lotNo string
			var currentQty float64
			var trackQty bool
			err := tx.QueryRow(r.Context(), `
				select lb.item_id, lb.location_id, lb.lot_no, lb.qty_on_hand::float8,
				  coalesce(i.track_inventory_qty, false)
				from public.inv_lot_batches lb
				join public.inv_items i on i.id = lb.item_id
				where lb.id = $1 and lb.tenant_id = $2 and i.track_lot = true
				for update`, line.LotBatchID, tu.TenantID).Scan(
				&itemID, &locationID, &lotNo, &currentQty, &trackQty)
			if err != nil {
				response.Validation(w, map[string]string{"lines": fmt.Sprintf("Lot batch %d not found.", line.LotBatchID)})
				return
			}

			newQty := currentQty + line.QtyDelta
			if newQty < -0.0001 {
				response.Validation(w, map[string]string{"lines": fmt.Sprintf("Lot %s would go negative (%.4f on hand).", lotNo, currentQty)})
				return
			}

			tag, err := tx.Exec(r.Context(), `
				update public.inv_lot_batches
				set qty_on_hand = qty_on_hand + $1, updated_at = now()
				where id = $2 and tenant_id = $3 and qty_on_hand + $1 >= 0`,
				line.QtyDelta, line.LotBatchID, tu.TenantID)
			if err != nil || tag.RowsAffected() == 0 {
				response.Validation(w, map[string]string{"lines": fmt.Sprintf("Insufficient qty for lot %s.", lotNo)})
				return
			}

			lotBatchID := line.LotBatchID
			event := LotEventInput{
				TenantID:        tu.TenantID,
				LotBatchID:      lotBatchID,
				EventType:       LotEventTypeForQtyDelta(line.QtyDelta, "adjusted"),
				Qty:             line.QtyDelta,
				RefType:         "lot_adjustment",
				RefID:           &lotBatchID,
				Notes:           reason,
				CreatedByUserID: &userID,
			}
			if line.QtyDelta > 0 {
				event.ToLocationID = &locationID
			} else {
				event.FromLocationID = &locationID
			}
			if err := InsertLotEvent(r.Context(), tx, event); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to record lot event.", "ERR_INTERNAL")
				return
			}

			if trackQty {
				if line.QtyDelta < 0 {
					tag, err = tx.Exec(r.Context(), `
						update public.inv_item_location_balances
						set qty_on_hand = qty_on_hand + $1, updated_at = now()
						where tenant_id = $2 and item_id = $3 and location_id = $4
						  and qty_on_hand + $1 >= 0`,
						line.QtyDelta, tu.TenantID, itemID, locationID)
					if err != nil || tag.RowsAffected() == 0 {
						response.Validation(w, map[string]string{"lines": "Insufficient stock at location for adjustment."})
						return
					}
				} else {
					_, err = tx.Exec(r.Context(), `
						insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand)
						values ($1, $2, $3, $4)
						on conflict (tenant_id, item_id, location_id)
						do update set qty_on_hand = inv_item_location_balances.qty_on_hand + $4, updated_at = now()`,
						tu.TenantID, itemID, locationID, line.QtyDelta)
					if err != nil {
						response.Err(w, http.StatusInternalServerError, "Failed to update balance.", "ERR_INTERNAL")
						return
					}
				}

				_, err = tx.Exec(r.Context(), `
					insert into public.inv_stock_movements
					  (tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, reason, created_by_user_id)
					values ($1, $2, $3, $4, 'adjustment', 'lot_adjustment', $5, $6, $7)`,
					tu.TenantID, itemID, locationID, line.QtyDelta, line.LotBatchID, reason, userID)
				if err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to record movement.", "ERR_INTERNAL")
					return
				}
			}

			adjusted++
		}

		if adjusted == 0 {
			response.Validation(w, map[string]string{"lines": "No non-zero quantity changes to apply."})
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to adjust lots.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.lot.adjustment", "inv_lot_batch", nil, nil, map[string]any{
			"adjusted_count": adjusted,
			"reason":         reason,
		})
		for _, line := range body.Lines {
			if line.QtyDelta == 0 || line.LotBatchID <= 0 {
				continue
			}
			lotID := line.LotBatchID
			_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.lot.adjustment", "inv_lot_batch", &lotID, nil, line)
		}
		response.OK(w, map[string]any{"adjusted_count": adjusted}, "Lots adjusted.")
	}
}

func registerLotBatch(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body lotRegisterBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		lotNo := strings.TrimSpace(body.LotNo)
		if lotNo == "" {
			response.Validation(w, map[string]string{"lot_no": "Lot number is required."})
			return
		}
		if body.ItemID <= 0 {
			response.Validation(w, map[string]string{"item_id": "Item is required."})
			return
		}
		if body.LocationID <= 0 {
			response.Validation(w, map[string]string{"location_id": "Location is required."})
			return
		}
		if body.Qty <= 0 {
			response.Validation(w, map[string]string{"qty": "Quantity must be greater than zero."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to register lot.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var trackLot, trackQty bool
		err = tx.QueryRow(r.Context(), `
			select track_lot, coalesce(track_inventory_qty, false)
			from public.inv_items where id = $1 and tenant_id = $2 and deleted_at is null`,
			body.ItemID, tu.TenantID).Scan(&trackLot, &trackQty)
		if err != nil || !trackLot {
			response.Validation(w, map[string]string{"item_id": "Item must have lot tracking enabled."})
			return
		}

		var lotID int64
		err = tx.QueryRow(r.Context(), `
			insert into public.inv_lot_batches (tenant_id, item_id, lot_no, location_id, qty_on_hand, expiry_date)
			values ($1, $2, $3, $4, $5, $6::date)
			on conflict (tenant_id, item_id, lot_no, location_id)
			do update set
			  qty_on_hand = inv_lot_batches.qty_on_hand + excluded.qty_on_hand,
			  expiry_date = coalesce(excluded.expiry_date, inv_lot_batches.expiry_date),
			  updated_at = now()
			returning id`,
			tu.TenantID, body.ItemID, lotNo, body.LocationID, body.Qty, body.ExpiryDate).Scan(&lotID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to register lot.", "ERR_INTERNAL")
			return
		}

		if err := InsertLotEvent(r.Context(), tx, LotEventInput{
			TenantID:        tu.TenantID,
			LotBatchID:      lotID,
			EventType:       "received",
			ToLocationID:    &body.LocationID,
			Qty:             body.Qty,
			RefType:         "lot_register",
			RefID:           &lotID,
			Notes:           "Manual lot registration",
			CreatedByUserID: &tu.AppUserID,
		}); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to record lot event.", "ERR_INTERNAL")
			return
		}

		if trackQty {
			_, err = tx.Exec(r.Context(), `
				insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand)
				values ($1, $2, $3, $4)
				on conflict (tenant_id, item_id, location_id)
				do update set qty_on_hand = inv_item_location_balances.qty_on_hand + $4, updated_at = now()`,
				tu.TenantID, body.ItemID, body.LocationID, body.Qty)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to update balance.", "ERR_INTERNAL")
				return
			}
			_, err = tx.Exec(r.Context(), `
				insert into public.inv_stock_movements
				  (tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, reason, created_by_user_id)
				values ($1, $2, $3, $4, 'receipt', 'lot_register', $5, $6, $7)`,
				tu.TenantID, body.ItemID, body.LocationID, body.Qty, lotID, "Manual lot registration", tu.AppUserID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to record movement.", "ERR_INTERNAL")
				return
			}
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to register lot.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.lot.register", "inv_lot_batch", &lotID, nil, body)
		response.OK(w, map[string]any{"id": lotID, "lot_no": lotNo}, "Lot registered.")
	}
}
