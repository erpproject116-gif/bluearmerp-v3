package finance

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
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const permissionSupplierInvoiceApprove = "finance.supplier_invoices_approve"

func registerSupplierInvoiceApprovalRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.supplier_invoices", auth.AccessWrite)).Post("/supplier-invoices/{id}/submit-for-approval", submitSupplierInvoiceForApproval(pool))
	r.Post("/supplier-invoices/{id}/approve", approveSupplierInvoice(pool))
	r.Post("/supplier-invoices/{id}/reject", rejectSupplierInvoice(pool))
}

func submitSupplierInvoiceForApproval(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := parseSupplierInvoiceID(r)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body struct {
			Remarks *string `json:"remarks"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)

		current, err := loadSupplierInvoiceApprovalState(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Purchase not found.", "ERR_NOT_FOUND")
			return
		}
		if current != "unconfirmed" {
			if current == "e_approval" {
				response.Validation(w, map[string]string{"progress_status": "Purchase is already pending approval."})
				return
			}
			response.Validation(w, map[string]string{"progress_status": "Only unconfirmed purchases can be submitted for approval."})
			return
		}

		if err := applySupplierInvoiceApprovalTransition(r.Context(), pool, tu, id, "submit", current, "e_approval", body.Remarks, false); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to submit for approval.", "ERR_INTERNAL")
			return
		}
		_ = approval.DrainOutbox(r.Context(), pool)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.supplier_invoice.submit_for_approval", "fin_supplier_invoice", &id, nil, body)

		inv, err := loadSupplierInvoice(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load purchase.", "ERR_INTERNAL")
			return
		}
		response.OK(w, inv, "Submitted for approval.")
	}
}

func approveSupplierInvoice(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if !tu.HasPermission(permissionSupplierInvoiceApprove, auth.AccessWrite) {
			response.Err(w, http.StatusForbidden, "You do not have permission to approve purchases.", "ERR_FORBIDDEN")
			return
		}
		id, err := parseSupplierInvoiceID(r)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body struct {
			Remarks *string `json:"remarks"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)

		current, err := loadSupplierInvoiceApprovalState(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Purchase not found.", "ERR_NOT_FOUND")
			return
		}
		if current != "e_approval" {
			response.Validation(w, map[string]string{"progress_status": "Purchase must be in E-Approval status."})
			return
		}

		if err := applySupplierInvoiceApprovalTransition(r.Context(), pool, tu, id, "approve", current, "completed", body.Remarks, true); err != nil {
			response.Validation(w, map[string]string{"status": err.Error()})
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.supplier_invoice.approve", "fin_supplier_invoice", &id, nil, body)

		inv, err := loadSupplierInvoice(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load purchase.", "ERR_INTERNAL")
			return
		}
		response.OK(w, inv, "Purchase approved.")
	}
}

func rejectSupplierInvoice(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if !tu.HasPermission(permissionSupplierInvoiceApprove, auth.AccessWrite) {
			response.Err(w, http.StatusForbidden, "You do not have permission to reject purchases.", "ERR_FORBIDDEN")
			return
		}
		id, err := parseSupplierInvoiceID(r)
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

		current, err := loadSupplierInvoiceApprovalState(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Purchase not found.", "ERR_NOT_FOUND")
			return
		}
		if current != "e_approval" {
			response.Validation(w, map[string]string{"progress_status": "Purchase must be in E-Approval status."})
			return
		}

		if err := applySupplierInvoiceApprovalTransition(r.Context(), pool, tu, id, "reject", current, "unconfirmed", body.Remarks, false); err != nil {
			response.Validation(w, map[string]string{"status": err.Error()})
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.supplier_invoice.reject", "fin_supplier_invoice", &id, nil, body)

		inv, err := loadSupplierInvoice(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load purchase.", "ERR_INTERNAL")
			return
		}
		response.OK(w, inv, "Purchase rejected.")
	}
}

func loadSupplierInvoiceApprovalState(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (string, error) {
	var status string
	err := pool.QueryRow(ctx, `
		select progress_status from public.fin_supplier_invoices
		where id = $1 and tenant_id = $2 and deleted_at is null`, id, tenantID).Scan(&status)
	return status, err
}

func applySupplierInvoiceApprovalTransition(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, id int64, action, fromStatus, toStatus string, remarks *string, approved bool) error {
	actorName := strings.TrimSpace(tu.FullName)
	if actorName == "" {
		actorName = "User"
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	entityType := "fin_supplier_invoice"
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
		update public.fin_supplier_invoices
		set progress_status = $1, updated_at = now()
		where id = $2 and tenant_id = $3 and deleted_at is null`,
		toStatus, id, tu.TenantID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("purchase not found")
	}

	if action == "submit" {
		var label string
		_ = tx.QueryRow(ctx, `
			select coalesce(nullif(trim(invoice_no), ''), '')
			from public.fin_supplier_invoices where id = $1 and tenant_id = $2`, id, tu.TenantID).Scan(&label)
		if label == "" {
			label = fmt.Sprintf("Purchase #%d", id)
		}
		if err := approval.EnqueuePendingApprovalTx(ctx, tx, tu.TenantID, entityType, id, label, actorName); err != nil {
			return err
		}
	}
	_ = approved

	return tx.Commit(ctx)
}

func parseSupplierInvoiceID(r *http.Request) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
}
