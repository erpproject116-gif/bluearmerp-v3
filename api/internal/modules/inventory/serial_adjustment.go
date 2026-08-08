package inventory

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/approval"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const (
	entitySerialAdjustmentRequest     = "inv_serial_adjustment_request"
	permissionSerialAdjustmentApprove = "inventory.serial_adjustment_approve"
	serialAdjApprovalMinLines         = 5
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

// serialStatusBlocksPositiveAdjustment reports statuses where increasing qty would corrupt the ledger:
// sold/reserved units already belong to a sales document and must not be re-added to stock via adjustment.
func serialStatusBlocksPositiveAdjustment(status string) bool {
	return status == "sold" || status == "reserved"
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

func nonzeroSerialAdjLines(lines []serialAdjustmentLine) []serialAdjustmentLine {
	out := make([]serialAdjustmentLine, 0, len(lines))
	for _, line := range lines {
		if line.QtyDelta == 0 || line.SerialUnitID <= 0 {
			continue
		}
		out = append(out, line)
	}
	return out
}

func serialAdjRequiresApproval(policyOn bool, lines []serialAdjustmentLine) bool {
	if !policyOn {
		return false
	}
	if len(lines) >= serialAdjApprovalMinLines {
		return true
	}
	for _, line := range lines {
		if line.QtyDelta > 0 {
			return true
		}
	}
	return false
}

// postSerialAdjustmentLines applies qty changes inside an open transaction.
// Returns adjusted count, field validation map (non-nil => caller should Validation), or error.
func postSerialAdjustmentLines(ctx context.Context, tx pgx.Tx, tenantID, userID int64, reason string, lines []serialAdjustmentLine) (int, map[string]string, error) {
	adjusted := 0
	qtyExpr := serialQtyOnHandSubquery()

	for _, line := range lines {
		if line.QtyDelta == 0 {
			continue
		}
		if line.SerialUnitID <= 0 {
			return 0, map[string]string{"lines": "Invalid serial unit id."}, nil
		}

		var itemID int64
		var locationID *int64
		var status string
		var trackQty bool
		var currentQty float64
		err := tx.QueryRow(ctx, fmt.Sprintf(`
			select su.item_id, su.location_id, su.status,
			  coalesce(i.track_inventory_qty, false),
			  %s
			from public.inv_serial_units su
			join public.inv_items i on i.id = su.item_id
			where su.id = $1 and su.tenant_id = $2
			for update`, qtyExpr), line.SerialUnitID, tenantID).Scan(
			&itemID, &locationID, &status, &trackQty, &currentQty)
		if err != nil {
			return 0, map[string]string{"lines": fmt.Sprintf("Serial unit %d not found.", line.SerialUnitID)}, nil
		}

		newQty := currentQty + line.QtyDelta
		if newQty < -0.0001 || newQty > 1.0001 {
			return 0, map[string]string{"lines": fmt.Sprintf("Adjustment for %d would set invalid quantity (%.4f on hand).", line.SerialUnitID, currentQty)}, nil
		}
		if line.QtyDelta > 0 && serialStatusBlocksPositiveAdjustment(status) {
			return 0, map[string]string{"lines": fmt.Sprintf("Serial unit %d is %s; positive adjustments are not allowed.", line.SerialUnitID, status)}, nil
		}

		if line.QtyDelta > 0 {
			if locationID == nil {
				return 0, map[string]string{"lines": fmt.Sprintf("Serial unit %d has no location; assign a location before increasing qty.", line.SerialUnitID)}, nil
			}
			_, err = tx.Exec(ctx, `
				insert into public.inv_serial_events (
				  tenant_id, serial_unit_id, event_type, to_location_id,
				  ref_type, notes, created_by_user_id
				) values ($1, $2, 'received', $3, 'serial_adjustment', $4, $5)`,
				tenantID, line.SerialUnitID, *locationID, reason, userID)
			if err != nil {
				return 0, nil, err
			}
			if status == "void" || status == "scrapped" {
				_, err = tx.Exec(ctx, `
					update public.inv_serial_units set status = 'in_stock', updated_at = now()
					where id = $1`, line.SerialUnitID)
				if err != nil {
					return 0, nil, err
				}
			}
		} else {
			_, err = tx.Exec(ctx, `
				insert into public.inv_serial_events (
				  tenant_id, serial_unit_id, event_type, from_location_id,
				  ref_type, notes, created_by_user_id
				) values ($1, $2, 'voided', $3, 'serial_adjustment', $4, $5)`,
				tenantID, line.SerialUnitID, locationID, reason, userID)
			if err != nil {
				return 0, nil, err
			}
			_, err = tx.Exec(ctx, `
				update public.inv_serial_units set status = 'void', updated_at = now()
				where id = $1`, line.SerialUnitID)
			if err != nil {
				return 0, nil, err
			}
		}

		if trackQty && locationID != nil {
			if line.QtyDelta < 0 {
				tag, err := tx.Exec(ctx, `
					update public.inv_item_location_balances
					set qty_on_hand = qty_on_hand + $1, updated_at = now()
					where tenant_id = $2 and item_id = $3 and location_id = $4
					  and qty_on_hand + $1 >= 0`,
					line.QtyDelta, tenantID, itemID, *locationID)
				if err != nil || tag.RowsAffected() == 0 {
					return 0, map[string]string{"lines": "Insufficient stock at location for adjustment."}, nil
				}
			} else {
				_, err = tx.Exec(ctx, `
					insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand)
					values ($1, $2, $3, $4)
					on conflict (tenant_id, item_id, location_id)
					do update set qty_on_hand = inv_item_location_balances.qty_on_hand + $4, updated_at = now()`,
					tenantID, itemID, *locationID, line.QtyDelta)
				if err != nil {
					return 0, nil, err
				}
			}

			var movementID int64
			err = tx.QueryRow(ctx, `
				insert into public.inv_stock_movements
				  (tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, reason, created_by_user_id)
				values ($1, $2, $3, $4, 'adjustment', 'serial_adjustment', $5, $6, $7)
				returning id`,
				tenantID, itemID, *locationID, line.QtyDelta, line.SerialUnitID, reason, userID).Scan(&movementID)
			if err != nil {
				return 0, nil, err
			}
			_, _ = tx.Exec(ctx, `update public.inv_stock_movements set ref_id = $1 where id = $1`, movementID)
		}

		adjusted++
	}

	if adjusted == 0 {
		return 0, map[string]string{"lines": "No non-zero quantity changes to apply."}, nil
	}
	return adjusted, nil, nil
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
		lines := nonzeroSerialAdjLines(body.Lines)
		if len(lines) == 0 {
			response.Validation(w, map[string]string{"lines": "At least one adjustment line is required."})
			return
		}

		policy, err := processpolicy.Load(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load process policies.", "ERR_INTERNAL")
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to adjust serials.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		if serialAdjRequiresApproval(policy.InventoryRequireSerialAdjustmentApproval, lines) {
			var requestID int64
			err = tx.QueryRow(r.Context(), `
				insert into public.inv_serial_adjustment_requests (tenant_id, reason, status, created_by_user_id)
				values ($1, $2, 'e_approval', $3)
				returning id`, tu.TenantID, reason, tu.AppUserID).Scan(&requestID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to create adjustment request.", "ERR_INTERNAL")
				return
			}
			for _, line := range lines {
				_, err = tx.Exec(r.Context(), `
					insert into public.inv_serial_adjustment_request_lines (request_id, serial_unit_id, qty_delta)
					values ($1, $2, $3)`, requestID, line.SerialUnitID, line.QtyDelta)
				if err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to save adjustment lines.", "ERR_INTERNAL")
					return
				}
			}
			remarks := reason
			if err := approval.Submit(r.Context(), tx, tu, entitySerialAdjustmentRequest, requestID, &remarks); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to submit for approval.", "ERR_INTERNAL")
				return
			}
			if err := tx.Commit(r.Context()); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to submit for approval.", "ERR_INTERNAL")
				return
			}
			_ = approval.DrainOutbox(r.Context(), pool)
			_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.serial.adjustment.submit", entitySerialAdjustmentRequest, &requestID, nil, map[string]any{
				"line_count": len(lines),
				"reason":     reason,
			})
			response.OK(w, map[string]any{
				"pending_approval": true,
				"request_id":       requestID,
				"adjusted_count":   0,
			}, "Submitted for approval.")
			return
		}

		adjusted, validation, err := postSerialAdjustmentLines(r.Context(), tx, tu.TenantID, tu.AppUserID, reason, lines)
		if validation != nil {
			response.Validation(w, validation)
			return
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to adjust serials.", "ERR_INTERNAL")
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
		for _, line := range lines {
			unitID := line.SerialUnitID
			_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.serial.adjustment", "inv_serial_unit", &unitID, nil, line)
		}
		response.OK(w, map[string]any{"adjusted_count": adjusted, "pending_approval": false}, "Serials adjusted.")
	}
}

func parseSerialAdjRequestID(r *http.Request) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
}

func approveSerialAdjustmentRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if !tu.HasPermission(permissionSerialAdjustmentApprove, auth.AccessWrite) &&
			!tu.HasPermission("inventory.serial_adjustment", auth.AccessWrite) {
			response.Err(w, http.StatusForbidden, "You do not have permission to approve serial adjustments.", "ERR_FORBIDDEN")
			return
		}
		id, err := parseSerialAdjRequestID(r)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body struct {
			Remarks *string `json:"remarks"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to approve.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var reason, status string
		err = tx.QueryRow(r.Context(), `
			select reason, status from public.inv_serial_adjustment_requests
			where id = $1 and tenant_id = $2 for update`, id, tu.TenantID).Scan(&reason, &status)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Adjustment request not found.", "ERR_NOT_FOUND")
			return
		}
		if status != "e_approval" {
			response.Validation(w, map[string]string{"status": "Request must be pending approval."})
			return
		}

		lineRows, err := tx.Query(r.Context(), `
			select serial_unit_id, qty_delta::float8
			from public.inv_serial_adjustment_request_lines
			where request_id = $1`, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load lines.", "ERR_INTERNAL")
			return
		}
		var lines []serialAdjustmentLine
		for lineRows.Next() {
			var line serialAdjustmentLine
			if err := lineRows.Scan(&line.SerialUnitID, &line.QtyDelta); err != nil {
				lineRows.Close()
				response.Err(w, http.StatusInternalServerError, "Failed to read lines.", "ERR_INTERNAL")
				return
			}
			lines = append(lines, line)
		}
		lineRows.Close()

		adjusted, validation, err := postSerialAdjustmentLines(r.Context(), tx, tu.TenantID, tu.AppUserID, reason, lines)
		if validation != nil {
			response.Validation(w, validation)
			return
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to post adjustments.", "ERR_INTERNAL")
			return
		}

		if err := approval.Decide(r.Context(), tx, tu, entitySerialAdjustmentRequest, id, true, body.Remarks); err != nil {
			response.Validation(w, map[string]string{"status": err.Error()})
			return
		}
		_, err = tx.Exec(r.Context(), `
			update public.inv_serial_adjustment_requests
			set status = 'completed', updated_at = now()
			where id = $1`, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to complete request.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to approve.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.serial.adjustment.approve", entitySerialAdjustmentRequest, &id, nil, map[string]any{
			"adjusted_count": adjusted,
		})
		response.OK(w, map[string]any{"request_id": id, "adjusted_count": adjusted}, "Serial adjustment approved.")
	}
}

func rejectSerialAdjustmentRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if !tu.HasPermission(permissionSerialAdjustmentApprove, auth.AccessWrite) &&
			!tu.HasPermission("inventory.serial_adjustment", auth.AccessWrite) {
			response.Err(w, http.StatusForbidden, "You do not have permission to reject serial adjustments.", "ERR_FORBIDDEN")
			return
		}
		id, err := parseSerialAdjRequestID(r)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body struct {
			Remarks *string `json:"remarks"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.Remarks == nil || strings.TrimSpace(*body.Remarks) == "" {
			response.Validation(w, map[string]string{"remarks": "Rejection remarks are required."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to reject.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var status string
		err = tx.QueryRow(r.Context(), `
			select status from public.inv_serial_adjustment_requests
			where id = $1 and tenant_id = $2 for update`, id, tu.TenantID).Scan(&status)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Adjustment request not found.", "ERR_NOT_FOUND")
			return
		}
		if status != "e_approval" {
			response.Validation(w, map[string]string{"status": "Request must be pending approval."})
			return
		}

		if err := approval.Decide(r.Context(), tx, tu, entitySerialAdjustmentRequest, id, false, body.Remarks); err != nil {
			response.Validation(w, map[string]string{"status": err.Error()})
			return
		}
		_, err = tx.Exec(r.Context(), `
			update public.inv_serial_adjustment_requests
			set status = 'rejected', updated_at = now()
			where id = $1`, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to reject request.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to reject.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.serial.adjustment.reject", entitySerialAdjustmentRequest, &id, nil, body)
		response.OK(w, map[string]any{"request_id": id}, "Serial adjustment rejected.")
	}
}
