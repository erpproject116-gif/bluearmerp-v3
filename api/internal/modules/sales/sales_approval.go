package sales

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/approval"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const permissionSalesApprove = "sales.approve"

func registerSalesApprovalRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("sales", auth.AccessWrite)).Post("/{id}/submit-for-approval", submitSaleForApproval(pool))
	r.Post("/{id}/approve", approveSale(pool))
	r.Post("/{id}/reject", rejectSale(pool))
}

func submitSaleForApproval(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := parseSaleID(r)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body struct {
			Remarks *string `json:"remarks"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)

		current, err := loadSaleApprovalState(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Sales not found.", "ERR_NOT_FOUND")
			return
		}
		if current != "unconfirmed" {
			if current == "e_approval" {
				response.Validation(w, map[string]string{"progress_status": "Sale is already pending approval."})
				return
			}
			response.Validation(w, map[string]string{"progress_status": "Only unconfirmed sales can be submitted for approval."})
			return
		}

		policy, err := processpolicy.Load(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load process policies.", "ERR_INTERNAL")
			return
		}
		if v := processpolicy.ValidateAttachmentRequired(r.Context(), pool, policy, processpolicy.DocSales, "e_approval", id); v != nil {
			response.Validation(w, v)
			return
		}

		if err := applySaleApprovalTransition(r.Context(), pool, tu, id, "submit", current, "e_approval", body.Remarks, false); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to submit for approval.", "ERR_INTERNAL")
			return
		}
		_ = approval.DrainOutbox(r.Context(), pool)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales.submit_for_approval", "sa_sales", &id, nil, body)

		sale, err := loadSale(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load sales.", "ERR_INTERNAL")
			return
		}
		response.OK(w, sale, "Submitted for approval.")
	}
}

func approveSale(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if !tu.HasPermission(permissionSalesApprove, auth.AccessWrite) {
			response.Err(w, http.StatusForbidden, "You do not have permission to approve sales.", "ERR_FORBIDDEN")
			return
		}
		id, err := parseSaleID(r)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body struct {
			Remarks *string `json:"remarks"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)

		current, err := loadSaleApprovalState(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Sales not found.", "ERR_NOT_FOUND")
			return
		}
		if current != "e_approval" {
			response.Validation(w, map[string]string{"progress_status": "Sale must be in E-Approval status."})
			return
		}

		if err := applySaleApprovalTransition(r.Context(), pool, tu, id, "approve", current, "completed", body.Remarks, true); err != nil {
			response.Validation(w, map[string]string{"status": err.Error()})
			return
		}
		_ = accrueCommissionForSalePool(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales.approve", "sa_sales", &id, nil, body)

		sale, err := loadSale(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load sales.", "ERR_INTERNAL")
			return
		}
		response.OK(w, sale, "Sale approved.")
	}
}

func rejectSale(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if !tu.HasPermission(permissionSalesApprove, auth.AccessWrite) {
			response.Err(w, http.StatusForbidden, "You do not have permission to reject sales.", "ERR_FORBIDDEN")
			return
		}
		id, err := parseSaleID(r)
		if err != nil {
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

		current, err := loadSaleApprovalState(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Sales not found.", "ERR_NOT_FOUND")
			return
		}
		if current != "e_approval" {
			response.Validation(w, map[string]string{"progress_status": "Sale must be in E-Approval status."})
			return
		}

		if err := applySaleApprovalTransition(r.Context(), pool, tu, id, "reject", current, "unconfirmed", body.Remarks, false); err != nil {
			response.Validation(w, map[string]string{"status": err.Error()})
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales.reject", "sa_sales", &id, nil, body)

		sale, err := loadSale(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load sales.", "ERR_INTERNAL")
			return
		}
		response.OK(w, sale, "Sale rejected.")
	}
}

func loadSaleApprovalState(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (string, error) {
	var status string
	err := pool.QueryRow(ctx, `
		select progress_status from public.sa_sales
		where id = $1 and tenant_id = $2 and deleted_at is null`, id, tenantID).Scan(&status)
	return status, err
}

func applySaleApprovalTransition(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, id int64, action, fromStatus, toStatus string, remarks *string, approved bool) error {
	actorName := strings.TrimSpace(tu.FullName)
	if actorName == "" {
		actorName = "User"
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	entityType := "sa_sales"
	switch action {
	case "submit":
		if err := approval.Submit(ctx, tx, tu, entityType, id, remarks); err != nil {
			return err
		}
	case "approve":
		if err := approval.Decide(ctx, tx, tu, entityType, id, true, remarks); err != nil {
			return err
		}
	case "reject":
		if err := approval.Decide(ctx, tx, tu, entityType, id, false, remarks); err != nil {
			return err
		}
	default:
		return fmt.Errorf("unknown action")
	}

	tag, err := tx.Exec(ctx, `
		update public.sa_sales
		set progress_status = $1, updated_at = now()
		where id = $2 and tenant_id = $3 and deleted_at is null`,
		toStatus, id, tu.TenantID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("sales not found")
	}

	if action == "submit" {
		var label string
		_ = tx.QueryRow(ctx, `
			select coalesce(nullif(trim(sales_no), ''), '')
			from public.sa_sales where id = $1 and tenant_id = $2`, id, tu.TenantID).Scan(&label)
		if label == "" {
			label = fmt.Sprintf("Sales #%d", id)
		}
		if err := approval.EnqueuePendingApprovalTx(ctx, tx, tu.TenantID, entityType, id, label, actorName); err != nil {
			return err
		}
	}
	_ = approved

	return tx.Commit(ctx)
}

func parseSaleID(r *http.Request) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
}
