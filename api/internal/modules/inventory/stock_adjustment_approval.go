package inventory

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

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
	entityStockAdjustmentRequest     = "inv_stock_adjustment_request"
	permissionStockAdjustmentApprove = "inventory.stock_adjustment_approve"
)

type stockAdjustmentRequestRow struct {
	ID              int64    `json:"id"`
	ItemID          int64    `json:"item_id"`
	ItemCode        string   `json:"item_code"`
	ItemName        string   `json:"item_name"`
	LocationID      int64    `json:"location_id"`
	LocationName    string   `json:"location_name"`
	QtyDelta        float64  `json:"qty_delta"`
	Reason          string   `json:"reason"`
	Status          string   `json:"status"`
	CreatedByUserID *int64   `json:"created_by_user_id,omitempty"`
	CreatedAt       string   `json:"created_at"`
	UpdatedAt       string   `json:"updated_at"`
	Actions         []any    `json:"actions,omitempty"`
}

type stockAdjActionRow struct {
	ID         int64   `json:"id"`
	Action     string  `json:"action"`
	ActorName  string  `json:"actor_name"`
	Remarks    *string `json:"remarks,omitempty"`
	FromStatus *string `json:"from_status,omitempty"`
	ToStatus   *string `json:"to_status,omitempty"`
	CreatedAt  string  `json:"created_at"`
}

func registerStockAdjustmentApprovalRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Post("/stock-adjustments/draft", saveStockAdjustmentDraft(pool))
	r.Get("/stock-adjustment-requests", listStockAdjustmentRequests(pool))
	r.Get("/stock-adjustment-requests/{id}", getStockAdjustmentRequest(pool))
	r.Post("/stock-adjustment-requests/{id}/submit", submitStockAdjustmentRequest(pool))
	r.Post("/stock-adjustment-requests/{id}/approve", approveStockAdjustmentRequest(pool))
	r.Post("/stock-adjustment-requests/{id}/reject", rejectStockAdjustmentRequest(pool))
	r.Post("/stock-adjustment-requests/{id}/comments", commentStockAdjustmentRequest(pool))
}

func parseStockAdjRequestID(r *http.Request) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
}

func validateStockAdjustmentBody(body stockAdjustmentBody) map[string]string {
	errs := map[string]string{}
	if body.ItemID <= 0 {
		errs["item_id"] = "Item is required."
	}
	if body.LocationID <= 0 {
		errs["location_id"] = "Location is required."
	}
	if body.QtyDelta == 0 {
		errs["qty_delta"] = "Quantity change cannot be zero."
	}
	if strings.TrimSpace(body.Reason) == "" {
		errs["reason"] = "Reason is required."
	}
	return errs
}

func ensureItemLocation(ctx context.Context, pool *pgxpool.Pool, tenantID, itemID, locationID int64) map[string]string {
	var itemExists bool
	_ = pool.QueryRow(ctx,
		`select exists(select 1 from public.inv_items where id = $1 and tenant_id = $2 and deleted_at is null)`,
		itemID, tenantID).Scan(&itemExists)
	if !itemExists {
		return map[string]string{"item_id": "Item not found."}
	}
	var locExists bool
	_ = pool.QueryRow(ctx,
		`select exists(select 1 from public.inv_locations where id = $1 and tenant_id = $2 and deleted_at is null)`,
		locationID, tenantID).Scan(&locExists)
	if !locExists {
		return map[string]string{"location_id": "Location not found."}
	}
	return nil
}

// postStockAdjustment applies balance + movement inside an open transaction.
func postStockAdjustment(ctx context.Context, tx pgx.Tx, tenantID, userID int64, itemID, locationID int64, qtyDelta float64, reason string) (int64, map[string]string, error) {
	var qtyOnHand float64
	err := tx.QueryRow(ctx, `
		select qty_on_hand::float8
		from public.inv_item_location_balances
		where tenant_id = $1 and item_id = $2 and location_id = $3
		for update`,
		tenantID, itemID, locationID).Scan(&qtyOnHand)
	if err != nil {
		if qtyDelta < 0 {
			return 0, map[string]string{"qty_delta": "No balance record at this location."}, nil
		}
		_, err = tx.Exec(ctx, `
			insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand)
			values ($1, $2, $3, 0)`,
			tenantID, itemID, locationID)
		if err != nil {
			return 0, nil, err
		}
		qtyOnHand = 0
	}

	newQty := qtyOnHand + qtyDelta
	if newQty < -0.0001 {
		return 0, map[string]string{"qty_delta": fmt.Sprintf("Would make quantity negative (%.4f on hand).", qtyOnHand)}, nil
	}

	tag, err := tx.Exec(ctx, `
		update public.inv_item_location_balances
		set qty_on_hand = qty_on_hand + $1, updated_at = now()
		where tenant_id = $2 and item_id = $3 and location_id = $4`,
		qtyDelta, tenantID, itemID, locationID)
	if err != nil || tag.RowsAffected() == 0 {
		return 0, nil, fmt.Errorf("failed to update balance")
	}

	reason = strings.TrimSpace(reason)
	var movementID int64
	err = tx.QueryRow(ctx, `
		insert into public.inv_stock_movements
		  (tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, reason, created_by_user_id)
		values ($1, $2, $3, $4, 'adjustment', 'stock_adjustment', 0, $5, $6)
		returning id`,
		tenantID, itemID, locationID, qtyDelta, reason, userID).Scan(&movementID)
	if err != nil {
		return 0, nil, err
	}
	_, err = tx.Exec(ctx, `update public.inv_stock_movements set ref_id = $1 where id = $1`, movementID)
	if err != nil {
		return 0, nil, err
	}
	return movementID, nil, nil
}

func stockAdjLabel(ctx context.Context, q interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}, tenantID, requestID int64) string {
	var itemCode string
	var qty float64
	err := q.QueryRow(ctx, `
		select i.item_code, r.qty_delta::float8
		from public.inv_stock_adjustment_requests r
		join public.inv_items i on i.id = r.item_id
		where r.id = $1 and r.tenant_id = $2`, requestID, tenantID).Scan(&itemCode, &qty)
	if err != nil {
		return fmt.Sprintf("Stock adjustment #%d", requestID)
	}
	return fmt.Sprintf("Stock adj %s %+g", itemCode, qty)
}

func submitStockAdjForApproval(ctx context.Context, tx pgx.Tx, tu auth.TenantUser, requestID int64, remarks string) error {
	rm := remarks
	if err := approval.Submit(ctx, tx, tu, entityStockAdjustmentRequest, requestID, &rm); err != nil {
		return err
	}
	label := stockAdjLabel(ctx, tx, tu.TenantID, requestID)
	submitter := ""
	_ = tx.QueryRow(ctx, `select coalesce(full_name, email, '') from public.users where id = $1`, tu.AppUserID).Scan(&submitter)
	return approval.EnqueuePendingApprovalTx(ctx, tx, tu.TenantID, entityStockAdjustmentRequest, requestID, label, submitter)
}

func createStockAdjustment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body stockAdjustmentBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateStockAdjustmentBody(body); len(errs) > 0 {
			response.Validation(w, errs)
			return
		}
		if errs := ensureItemLocation(r.Context(), pool, tu.TenantID, body.ItemID, body.LocationID); errs != nil {
			response.Validation(w, errs)
			return
		}

		policy, err := processpolicy.Load(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load process policies.", "ERR_INTERNAL")
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to adjust stock.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		reason := strings.TrimSpace(body.Reason)

		if policy.InventoryRequireStockAdjustmentApproval {
			var requestID int64
			err = tx.QueryRow(r.Context(), `
				insert into public.inv_stock_adjustment_requests
				  (tenant_id, item_id, location_id, qty_delta, reason, status, created_by_user_id)
				values ($1, $2, $3, $4, $5, 'e_approval', $6)
				returning id`,
				tu.TenantID, body.ItemID, body.LocationID, body.QtyDelta, reason, tu.AppUserID).Scan(&requestID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to create adjustment request.", "ERR_INTERNAL")
				return
			}
			if err := submitStockAdjForApproval(r.Context(), tx, tu, requestID, reason); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to submit for approval.", "ERR_INTERNAL")
				return
			}
			if err := tx.Commit(r.Context()); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to submit for approval.", "ERR_INTERNAL")
				return
			}
			_ = approval.DrainOutbox(r.Context(), pool)
			_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.stock_adjustment.submit", entityStockAdjustmentRequest, &requestID, nil, body)
			response.OK(w, map[string]any{
				"pending_approval": true,
				"request_id":       requestID,
			}, "Submitted for approval.")
			return
		}

		movementID, validation, err := postStockAdjustment(r.Context(), tx, tu.TenantID, tu.AppUserID, body.ItemID, body.LocationID, body.QtyDelta, reason)
		if validation != nil {
			response.Validation(w, validation)
			return
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to adjust stock.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to adjust stock.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.stock_adjustment", "inv_stock_movement", &movementID, nil, body)

		var row StockMovement
		var createdAt time.Time
		_ = pool.QueryRow(r.Context(), `
			select sm.id, sm.item_id, i.item_code, i.item_name,
			  sm.location_id, l.location_name, sm.qty_delta::float8,
			  sm.movement_type, sm.ref_type, sm.ref_id, sm.reason,
			  sm.created_by_user_id, sm.created_at
			from public.inv_stock_movements sm
			join public.inv_items i on i.id = sm.item_id
			join public.inv_locations l on l.id = sm.location_id
			where sm.id = $1`, movementID).Scan(
			&row.ID, &row.ItemID, &row.ItemCode, &row.ItemName,
			&row.LocationID, &row.LocationName, &row.QtyDelta,
			&row.MovementType, &row.RefType, &row.RefID, &row.Reason,
			&row.CreatedByUserID, &createdAt)
		row.CreatedAt = createdAt.Format(time.RFC3339)
		response.OK(w, row, "Stock adjusted.")
	}
}

func saveStockAdjustmentDraft(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body struct {
			stockAdjustmentBody
			ID *int64 `json:"id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateStockAdjustmentBody(body.stockAdjustmentBody); len(errs) > 0 {
			response.Validation(w, errs)
			return
		}
		if errs := ensureItemLocation(r.Context(), pool, tu.TenantID, body.ItemID, body.LocationID); errs != nil {
			response.Validation(w, errs)
			return
		}
		reason := strings.TrimSpace(body.Reason)

		if body.ID != nil && *body.ID > 0 {
			var status string
			var createdBy *int64
			err := pool.QueryRow(r.Context(), `
				select status, created_by_user_id from public.inv_stock_adjustment_requests
				where id = $1 and tenant_id = $2`, *body.ID, tu.TenantID).Scan(&status, &createdBy)
			if err != nil {
				response.Err(w, http.StatusNotFound, "Draft not found.", "ERR_NOT_FOUND")
				return
			}
			if status != "draft" {
				response.Validation(w, map[string]string{"status": "Only drafts can be updated."})
				return
			}
			if createdBy != nil && *createdBy != tu.AppUserID && !tu.HasPermission(permissionStockAdjustmentApprove, auth.AccessWrite) {
				response.Err(w, http.StatusForbidden, "You can only edit your own drafts.", "ERR_FORBIDDEN")
				return
			}
			_, err = pool.Exec(r.Context(), `
				update public.inv_stock_adjustment_requests
				set item_id = $1, location_id = $2, qty_delta = $3, reason = $4, updated_at = now()
				where id = $5 and tenant_id = $6`,
				body.ItemID, body.LocationID, body.QtyDelta, reason, *body.ID, tu.TenantID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to save draft.", "ERR_INTERNAL")
				return
			}
			response.OK(w, map[string]any{"id": *body.ID, "status": "draft"}, "Draft saved.")
			return
		}

		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.inv_stock_adjustment_requests
			  (tenant_id, item_id, location_id, qty_delta, reason, status, created_by_user_id)
			values ($1, $2, $3, $4, $5, 'draft', $6)
			returning id`,
			tu.TenantID, body.ItemID, body.LocationID, body.QtyDelta, reason, tu.AppUserID).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save draft.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": id, "status": "draft"}, "Draft saved.")
	}
}

func listStockAdjustmentRequests(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"created_at": "r.created_at",
		"status":     "r.status",
		"item_code":  "i.item_code",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "created_at", allowed)
		offset := httputil.Offset(p)
		where := "r.tenant_id = $1"
		args := []any{tu.TenantID}
		argN := 2
		if st := strings.TrimSpace(r.URL.Query().Get("status")); st != "" {
			where += fmt.Sprintf(" and r.status = $%d", argN)
			args = append(args, st)
			argN++
		}
		order := orderSQL(p.Order)
		q := fmt.Sprintf(`
			select r.id, r.item_id, i.item_code, i.item_name,
			  r.location_id, l.location_name, r.qty_delta::float8, r.reason, r.status,
			  r.created_by_user_id, r.created_at, r.updated_at, count(*) over()
			from public.inv_stock_adjustment_requests r
			join public.inv_items i on i.id = r.item_id
			join public.inv_locations l on l.id = r.location_id
			where %s
			order by %s %s
			limit $%d offset $%d`, where, p.Sort, order, argN, argN+1)
		args = append(args, p.PageSize, offset)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list requests.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []stockAdjustmentRequestRow
		var total int64
		for rows.Next() {
			var row stockAdjustmentRequestRow
			var createdAt, updatedAt time.Time
			var totalCount int64
			if err := rows.Scan(&row.ID, &row.ItemID, &row.ItemCode, &row.ItemName,
				&row.LocationID, &row.LocationName, &row.QtyDelta, &row.Reason, &row.Status,
				&row.CreatedByUserID, &createdAt, &updatedAt, &totalCount); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read requests.", "ERR_INTERNAL")
				return
			}
			total = totalCount
			row.CreatedAt = createdAt.Format(time.RFC3339)
			row.UpdatedAt = updatedAt.Format(time.RFC3339)
			out = append(out, row)
		}
		if out == nil {
			out = []stockAdjustmentRequestRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func loadStockAdjActions(ctx context.Context, pool *pgxpool.Pool, tenantID, requestID int64) ([]stockAdjActionRow, error) {
	rows, err := pool.Query(ctx, `
		select aa.id, aa.action, coalesce(u.full_name, u.email, ''), aa.remarks,
		  aa.from_status, aa.to_status, aa.created_at
		from public.approval_actions aa
		join public.approval_requests ar on ar.id = aa.request_id
		left join public.users u on u.id = aa.actor_user_id
		where ar.tenant_id = $1 and ar.entity_type = $2 and ar.entity_id = $3
		order by aa.created_at asc, aa.id asc`,
		tenantID, entityStockAdjustmentRequest, requestID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []stockAdjActionRow
	for rows.Next() {
		var row stockAdjActionRow
		var createdAt time.Time
		if err := rows.Scan(&row.ID, &row.Action, &row.ActorName, &row.Remarks,
			&row.FromStatus, &row.ToStatus, &createdAt); err != nil {
			return nil, err
		}
		row.CreatedAt = createdAt.Format(time.RFC3339)
		out = append(out, row)
	}
	if out == nil {
		out = []stockAdjActionRow{}
	}
	return out, nil
}

func getStockAdjustmentRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := parseStockAdjRequestID(r)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var row stockAdjustmentRequestRow
		var createdAt, updatedAt time.Time
		err = pool.QueryRow(r.Context(), `
			select r.id, r.item_id, i.item_code, i.item_name,
			  r.location_id, l.location_name, r.qty_delta::float8, r.reason, r.status,
			  r.created_by_user_id, r.created_at, r.updated_at
			from public.inv_stock_adjustment_requests r
			join public.inv_items i on i.id = r.item_id
			join public.inv_locations l on l.id = r.location_id
			where r.id = $1 and r.tenant_id = $2`, id, tu.TenantID).Scan(
			&row.ID, &row.ItemID, &row.ItemCode, &row.ItemName,
			&row.LocationID, &row.LocationName, &row.QtyDelta, &row.Reason, &row.Status,
			&row.CreatedByUserID, &createdAt, &updatedAt)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Request not found.", "ERR_NOT_FOUND")
			return
		}
		row.CreatedAt = createdAt.Format(time.RFC3339)
		row.UpdatedAt = updatedAt.Format(time.RFC3339)
		actions, err := loadStockAdjActions(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load timeline.", "ERR_INTERNAL")
			return
		}
		var actionAny []any
		for _, a := range actions {
			actionAny = append(actionAny, a)
		}
		row.Actions = actionAny
		response.OK(w, row, "")
	}
}

func submitStockAdjustmentRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := parseStockAdjRequestID(r)
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
			response.Err(w, http.StatusInternalServerError, "Failed to submit.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var status, reason string
		var createdBy *int64
		err = tx.QueryRow(r.Context(), `
			select status, reason, created_by_user_id from public.inv_stock_adjustment_requests
			where id = $1 and tenant_id = $2 for update`, id, tu.TenantID).Scan(&status, &reason, &createdBy)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Request not found.", "ERR_NOT_FOUND")
			return
		}
		if status != "draft" {
			response.Validation(w, map[string]string{"status": "Only drafts can be submitted."})
			return
		}
		if createdBy != nil && *createdBy != tu.AppUserID {
			response.Err(w, http.StatusForbidden, "You can only submit your own drafts.", "ERR_FORBIDDEN")
			return
		}
		remarks := reason
		if body.Remarks != nil && strings.TrimSpace(*body.Remarks) != "" {
			remarks = strings.TrimSpace(*body.Remarks)
		}
		_, err = tx.Exec(r.Context(), `
			update public.inv_stock_adjustment_requests
			set status = 'e_approval', updated_at = now()
			where id = $1`, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to submit.", "ERR_INTERNAL")
			return
		}
		if err := submitStockAdjForApproval(r.Context(), tx, tu, id, remarks); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to submit for approval.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to submit.", "ERR_INTERNAL")
			return
		}
		_ = approval.DrainOutbox(r.Context(), pool)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.stock_adjustment.submit", entityStockAdjustmentRequest, &id, nil, nil)
		response.OK(w, map[string]any{"request_id": id, "pending_approval": true}, "Submitted for approval.")
	}
}

func approveStockAdjustmentRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if !tu.HasPermission(permissionStockAdjustmentApprove, auth.AccessWrite) &&
			!tu.HasPermission("inventory.stock_movements", auth.AccessWrite) {
			response.Err(w, http.StatusForbidden, "You do not have permission to approve stock adjustments.", "ERR_FORBIDDEN")
			return
		}
		id, err := parseStockAdjRequestID(r)
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

		var itemID, locationID int64
		var qtyDelta float64
		var reason, status string
		err = tx.QueryRow(r.Context(), `
			select item_id, location_id, qty_delta::float8, reason, status
			from public.inv_stock_adjustment_requests
			where id = $1 and tenant_id = $2 for update`, id, tu.TenantID).Scan(
			&itemID, &locationID, &qtyDelta, &reason, &status)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Adjustment request not found.", "ERR_NOT_FOUND")
			return
		}
		if status != "e_approval" {
			response.Validation(w, map[string]string{"status": "Request must be pending approval."})
			return
		}

		movementID, validation, err := postStockAdjustment(r.Context(), tx, tu.TenantID, tu.AppUserID, itemID, locationID, qtyDelta, reason)
		if validation != nil {
			response.Validation(w, validation)
			return
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to post adjustment.", "ERR_INTERNAL")
			return
		}
		if err := approval.Decide(r.Context(), tx, tu, entityStockAdjustmentRequest, id, true, body.Remarks); err != nil {
			response.Validation(w, map[string]string{"status": err.Error()})
			return
		}
		_, err = tx.Exec(r.Context(), `
			update public.inv_stock_adjustment_requests
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
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.stock_adjustment.approve", entityStockAdjustmentRequest, &id, nil, map[string]any{
			"movement_id": movementID,
		})
		response.OK(w, map[string]any{"request_id": id, "movement_id": movementID}, "Stock adjustment approved.")
	}
}

func rejectStockAdjustmentRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if !tu.HasPermission(permissionStockAdjustmentApprove, auth.AccessWrite) &&
			!tu.HasPermission("inventory.stock_movements", auth.AccessWrite) {
			response.Err(w, http.StatusForbidden, "You do not have permission to reject stock adjustments.", "ERR_FORBIDDEN")
			return
		}
		id, err := parseStockAdjRequestID(r)
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
			select status from public.inv_stock_adjustment_requests
			where id = $1 and tenant_id = $2 for update`, id, tu.TenantID).Scan(&status)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Adjustment request not found.", "ERR_NOT_FOUND")
			return
		}
		if status != "e_approval" {
			response.Validation(w, map[string]string{"status": "Request must be pending approval."})
			return
		}
		if err := approval.Decide(r.Context(), tx, tu, entityStockAdjustmentRequest, id, false, body.Remarks); err != nil {
			response.Validation(w, map[string]string{"status": err.Error()})
			return
		}
		_, err = tx.Exec(r.Context(), `
			update public.inv_stock_adjustment_requests
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
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.stock_adjustment.reject", entityStockAdjustmentRequest, &id, nil, body)
		response.OK(w, map[string]any{"request_id": id}, "Stock adjustment rejected.")
	}
}

func commentStockAdjustmentRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := parseStockAdjRequestID(r)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body struct {
			Remarks string `json:"remarks"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		remarks := strings.TrimSpace(body.Remarks)
		if remarks == "" {
			response.Validation(w, map[string]string{"remarks": "Remarks are required."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to comment.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var status string
		err = tx.QueryRow(r.Context(), `
			select status from public.inv_stock_adjustment_requests
			where id = $1 and tenant_id = $2`, id, tu.TenantID).Scan(&status)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Request not found.", "ERR_NOT_FOUND")
			return
		}
		if err := approval.Comment(r.Context(), tx, tu, entityStockAdjustmentRequest, id, remarks); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to add comment.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to comment.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.stock_adjustment.comment", entityStockAdjustmentRequest, &id, nil, map[string]any{
			"status": status,
		})
		response.OK(w, map[string]any{"request_id": id, "status": status}, "Comment added.")
	}
}
