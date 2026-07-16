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

type serialAdjustmentCandidateRow struct {
	ID           int64   `json:"id"`
	SerialNo     string  `json:"serial_no"`
	ItemID       int64   `json:"item_id"`
	ItemCode     string  `json:"item_code"`
	ItemName     string  `json:"item_name"`
	LocationID   *int64  `json:"location_id,omitempty"`
	LocationName string  `json:"location_name,omitempty"`
	QtyOnHand    float64 `json:"qty_on_hand"`
	Status       string  `json:"status"`
}

type serialAdjustmentLine struct {
	SerialUnitID int64   `json:"serial_unit_id"`
	QtyDelta     float64 `json:"qty_delta"`
}

type serialAdjustmentBody struct {
	Reason string                 `json:"reason"`
	Lines  []serialAdjustmentLine `json:"lines"`
}

func serialQtyOnHandSubquery() string {
	return fmt.Sprintf(`greatest(0, coalesce((
		select sum(%s)::float8
		from public.inv_serial_events e
		where e.serial_unit_id = su.id
	), 0))`, serialEventQtyDelta)
}

func listSerialAdjustmentCandidates(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"serial_no":   "su.serial_no",
		"item_code":   "i.item_code",
		"qty_on_hand": "qty_on_hand",
		"status":      "su.status",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "serial_no", allowed)
		offset := httputil.Offset(p)

		f := parseSerialReportFilters(r)
		qtyExpr := serialQtyOnHandSubquery()

		where := "su.tenant_id = $1 and i.track_serial = true"
		args := []any{tu.TenantID}
		argN := 2
		where, args, argN = appendSerialUnitFilters(where, args, argN, f, "su")
		where = appendInventoryQtyFilter(where, qtyExpr, f.InventoryQty)

		includeUnassigned := strings.TrimSpace(r.URL.Query().Get("include_unassigned")) == "1" ||
			strings.EqualFold(r.URL.Query().Get("include_unassigned"), "true")
		if !includeUnassigned {
			where += fmt.Sprintf(" and %s.location_id is not null", "su")
		}

		sortCol := allowed[p.Sort]
		if sortCol == "" {
			sortCol = "su.serial_no"
		}
		if sortCol == "qty_on_hand" {
			sortCol = qtyExpr
		}

		limitN := argN
		offsetN := argN + 1
		args = append(args, p.PageSize, offset)
		q := fmt.Sprintf(`
			select su.id, su.serial_no, su.item_id, i.item_code, i.item_name,
			  su.location_id, coalesce(l.location_name, ''),
			  %s as qty_on_hand, su.status,
			  count(*) over()
			from public.inv_serial_units su
			join public.inv_items i on i.id = su.item_id
			left join public.inv_locations l on l.id = su.location_id
			where %s
			order by %s %s
			limit $%d offset $%d`, qtyExpr, where, sortCol, orderSQL(p.Order), limitN, offsetN)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list serial units.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []serialAdjustmentCandidateRow
		var total int64
		for rows.Next() {
			var row serialAdjustmentCandidateRow
			if err := rows.Scan(&row.ID, &row.SerialNo, &row.ItemID, &row.ItemCode, &row.ItemName,
				&row.LocationID, &row.LocationName, &row.QtyOnHand, &row.Status, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read serial units.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []serialAdjustmentCandidateRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func applySerialAdjustments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body serialAdjustmentBody
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
			response.Err(w, http.StatusInternalServerError, "Failed to adjust serials.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		adjusted := 0
		qtyExpr := serialQtyOnHandSubquery()
		userID := tu.AppUserID

		for _, line := range body.Lines {
			if line.QtyDelta == 0 {
				continue
			}
			if line.SerialUnitID <= 0 {
				response.Validation(w, map[string]string{"lines": "Invalid serial unit id."})
				return
			}

			var itemID int64
			var locationID *int64
			var status string
			var trackQty bool
			var currentQty float64
			err := tx.QueryRow(r.Context(), fmt.Sprintf(`
				select su.item_id, su.location_id, su.status,
				  coalesce(i.track_inventory_qty, false),
				  %s
				from public.inv_serial_units su
				join public.inv_items i on i.id = su.item_id
				where su.id = $1 and su.tenant_id = $2
				for update`, qtyExpr), line.SerialUnitID, tu.TenantID).Scan(
				&itemID, &locationID, &status, &trackQty, &currentQty)
			if err != nil {
				response.Validation(w, map[string]string{"lines": fmt.Sprintf("Serial unit %d not found.", line.SerialUnitID)})
				return
			}

			newQty := currentQty + line.QtyDelta
			if newQty < -0.0001 || newQty > 1.0001 {
				response.Validation(w, map[string]string{"lines": fmt.Sprintf("Adjustment for %d would set invalid quantity (%.4f on hand).", line.SerialUnitID, currentQty)})
				return
			}

			if line.QtyDelta > 0 {
				if locationID == nil {
					response.Validation(w, map[string]string{"lines": fmt.Sprintf("Serial unit %d has no location; assign a location before increasing qty.", line.SerialUnitID)})
					return
				}
				_, err = tx.Exec(r.Context(), `
					insert into public.inv_serial_events (
					  tenant_id, serial_unit_id, event_type, to_location_id,
					  ref_type, notes, created_by_user_id
					) values ($1, $2, 'received', $3, 'serial_adjustment', $4, $5)`,
					tu.TenantID, line.SerialUnitID, *locationID, reason, userID)
				if err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to record event.", "ERR_INTERNAL")
					return
				}
				if status == "void" || status == "scrapped" {
					_, err = tx.Exec(r.Context(), `
						update public.inv_serial_units set status = 'in_stock', updated_at = now()
						where id = $1`, line.SerialUnitID)
					if err != nil {
						response.Err(w, http.StatusInternalServerError, "Failed to update serial status.", "ERR_INTERNAL")
						return
					}
				}
			} else {
				_, err = tx.Exec(r.Context(), `
					insert into public.inv_serial_events (
					  tenant_id, serial_unit_id, event_type, from_location_id,
					  ref_type, notes, created_by_user_id
					) values ($1, $2, 'voided', $3, 'serial_adjustment', $4, $5)`,
					tu.TenantID, line.SerialUnitID, locationID, reason, userID)
				if err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to record event.", "ERR_INTERNAL")
					return
				}
				_, err = tx.Exec(r.Context(), `
					update public.inv_serial_units set status = 'void', updated_at = now()
					where id = $1`, line.SerialUnitID)
				if err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to update serial status.", "ERR_INTERNAL")
					return
				}
			}

			if trackQty && locationID != nil {
				if line.QtyDelta < 0 {
					tag, err := tx.Exec(r.Context(), `
						update public.inv_item_location_balances
						set qty_on_hand = qty_on_hand + $1, updated_at = now()
						where tenant_id = $2 and item_id = $3 and location_id = $4
						  and qty_on_hand + $1 >= 0`,
						line.QtyDelta, tu.TenantID, itemID, *locationID)
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
						tu.TenantID, itemID, *locationID, line.QtyDelta)
					if err != nil {
						response.Err(w, http.StatusInternalServerError, "Failed to update balance.", "ERR_INTERNAL")
						return
					}
				}

				var movementID int64
				err = tx.QueryRow(r.Context(), `
					insert into public.inv_stock_movements
					  (tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, reason, created_by_user_id)
					values ($1, $2, $3, $4, 'adjustment', 'serial_adjustment', $5, $6, $7)
					returning id`,
					tu.TenantID, itemID, *locationID, line.QtyDelta, line.SerialUnitID, reason, userID).Scan(&movementID)
				if err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to record movement.", "ERR_INTERNAL")
					return
				}
				_, _ = tx.Exec(r.Context(), `update public.inv_stock_movements set ref_id = $1 where id = $1`, movementID)
			}

			adjusted++
		}

		if adjusted == 0 {
			response.Validation(w, map[string]string{"lines": "No non-zero quantity changes to apply."})
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to adjust serials.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.serial.adjustment", "inv_serial_unit", nil, nil, map[string]any{
			"adjusted_count": adjusted,
			"reason":         reason,
		})
		for _, line := range body.Lines {
			if line.QtyDelta == 0 || line.SerialUnitID <= 0 {
				continue
			}
			unitID := line.SerialUnitID
			_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.serial.adjustment", "inv_serial_unit", &unitID, nil, line)
		}
		response.OK(w, map[string]any{"adjusted_count": adjusted}, "Serials adjusted.")
	}
}
