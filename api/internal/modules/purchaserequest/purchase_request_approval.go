package purchaserequest

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/approval"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const permissionPRApprove = "purchase_request.approve"

type PRApprovalRecord struct {
	ID        int64   `json:"id"`
	Action    string  `json:"action"`
	ActorName string  `json:"actor_name,omitempty"`
	Remarks   *string `json:"remarks,omitempty"`
	FromStatus *string `json:"from_status,omitempty"`
	ToStatus  string  `json:"to_status"`
	CreatedAt string  `json:"created_at"`
}

func registerPurchaseRequestApprovalRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("purchase_request", auth.AccessWrite)).Post("/purchase-requests/{id}/submit-for-approval", submitPurchaseRequestForApproval(pool))
	r.Post("/purchase-requests/{id}/approve", approvePurchaseRequest(pool))
	r.Post("/purchase-requests/{id}/reject", rejectPurchaseRequest(pool))
	r.Get("/purchase-requests/{id}/approvals", listPurchaseRequestApprovals(pool))
}

func submitPurchaseRequestForApproval(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := parsePurchaseRequestID(r)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body struct {
			Remarks *string `json:"remarks"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)

		current, err := loadPRApprovalState(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Purchase request not found.", "ERR_NOT_FOUND")
			return
		}
		if current.ProgressStatus != "unconfirmed" {
			if current.ProgressStatus == "e_approval" {
				response.Validation(w, map[string]string{"progress_status": "Purchase request is already pending approval."})
				return
			}
			response.Validation(w, map[string]string{"progress_status": "Only unconfirmed requests can be submitted for approval."})
			return
		}

		policy, err := processpolicy.Load(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load process policies.", "ERR_INTERNAL")
			return
		}
		var grandTotal float64
		var projectID *int64
		var requestDate time.Time
		if err := pool.QueryRow(r.Context(), `
			select grand_total::float8, project_id, request_date
			from public.pr_purchase_requests
			where id = $1 and tenant_id = $2 and deleted_at is null`, id, tu.TenantID).Scan(&grandTotal, &projectID, &requestDate); err != nil {
			response.Err(w, http.StatusNotFound, "Purchase request not found.", "ERR_NOT_FOUND")
			return
		}
		budgetCheck, _ := processpolicy.CheckPurchaseBudget(r.Context(), pool, policy, tu.TenantID, projectID, requestDate, grandTotal)
		if v := processpolicy.ValidateBudgetControl(policy, budgetCheck); v != nil {
			response.Validation(w, v)
			return
		}

		fromStatus := current.ProgressStatus
		if err := applyPRApprovalTransition(r.Context(), pool, tu, id, "submit", fromStatus, "e_approval", body.Remarks, false); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to submit for approval.", "ERR_INTERNAL")
			return
		}
		_ = approval.DrainOutbox(r.Context(), pool)

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "purchase_request.submit_for_approval", "pr_purchase_request", &id, nil, body)
		pr, _ := loadPurchaseRequest(r.Context(), pool, tu.TenantID, id)
		response.OK(w, pr, "Submitted for approval.")
	}
}

func approvePurchaseRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if !tu.HasPermission(permissionPRApprove, auth.AccessWrite) {
			response.Err(w, http.StatusForbidden, "You do not have permission to approve purchase requests.", "ERR_FORBIDDEN")
			return
		}
		id, err := parsePurchaseRequestID(r)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body struct {
			Remarks *string `json:"remarks"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)

		current, err := loadPRApprovalState(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Purchase request not found.", "ERR_NOT_FOUND")
			return
		}
		if current.ProgressStatus != "e_approval" {
			response.Validation(w, map[string]string{"progress_status": "Purchase request must be in E-Approval status."})
			return
		}

		fromStatus := current.ProgressStatus
		if err := applyPRApprovalTransition(r.Context(), pool, tu, id, "approve", fromStatus, "confirmed", body.Remarks, true); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to approve purchase request.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "purchase_request.approve", "pr_purchase_request", &id, nil, body)
		pr, _ := loadPurchaseRequest(r.Context(), pool, tu.TenantID, id)
		response.OK(w, pr, "Purchase request approved.")
	}
}

func rejectPurchaseRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if !tu.HasPermission(permissionPRApprove, auth.AccessWrite) {
			response.Err(w, http.StatusForbidden, "You do not have permission to reject purchase requests.", "ERR_FORBIDDEN")
			return
		}
		id, err := parsePurchaseRequestID(r)
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

		current, err := loadPRApprovalState(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Purchase request not found.", "ERR_NOT_FOUND")
			return
		}
		if current.ProgressStatus != "e_approval" {
			response.Validation(w, map[string]string{"progress_status": "Purchase request must be in E-Approval status."})
			return
		}

		fromStatus := current.ProgressStatus
		if err := applyPRApprovalTransition(r.Context(), pool, tu, id, "reject", fromStatus, "unconfirmed", body.Remarks, false); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to reject purchase request.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "purchase_request.reject", "pr_purchase_request", &id, nil, body)
		pr, _ := loadPurchaseRequest(r.Context(), pool, tu.TenantID, id)
		response.OK(w, pr, "Purchase request rejected.")
	}
}

func listPurchaseRequestApprovals(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := parsePurchaseRequestID(r)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		rows, err := pool.Query(r.Context(), `
			select a.id, a.action, coalesce(a.actor_name, ''), a.remarks, a.from_status, a.to_status, a.created_at
			from public.pr_approvals a
			join public.pr_purchase_requests pr on pr.id = a.purchase_request_id
			where a.purchase_request_id = $1 and pr.tenant_id = $2
			order by a.created_at desc`, id, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load approval history.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []PRApprovalRecord
		for rows.Next() {
			var rec PRApprovalRecord
			var createdAt time.Time
			if err := rows.Scan(&rec.ID, &rec.Action, &rec.ActorName, &rec.Remarks, &rec.FromStatus, &rec.ToStatus, &createdAt); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load approval history.", "ERR_INTERNAL")
				return
			}
			rec.CreatedAt = createdAt.Format(time.RFC3339)
			out = append(out, rec)
		}
		if out == nil {
			out = []PRApprovalRecord{}
		}
		response.OK(w, out, "OK")
	}
}

type prApprovalState struct {
	ProgressStatus string
}

func loadPRApprovalState(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (prApprovalState, error) {
	var s prApprovalState
	err := pool.QueryRow(ctx, `
		select progress_status from public.pr_purchase_requests
		where id = $1 and tenant_id = $2 and deleted_at is null`, id, tenantID).Scan(&s.ProgressStatus)
	return s, err
}

func applyPRApprovalTransition(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, id int64, action, fromStatus, toStatus string, remarks *string, setApproved bool) error {
	actorName := strings.TrimSpace(tu.FullName)
	if actorName == "" {
		actorName = "User"
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if setApproved {
		_, err = tx.Exec(ctx, `
			update public.pr_purchase_requests
			set progress_status = $1, approved_at = now(), approved_by_user_id = $2, updated_at = now()
			where id = $3 and tenant_id = $4 and deleted_at is null`,
			toStatus, tu.AppUserID, id, tu.TenantID)
	} else {
		_, err = tx.Exec(ctx, `
			update public.pr_purchase_requests
			set progress_status = $1, approved_at = null, approved_by_user_id = null, updated_at = now()
			where id = $2 and tenant_id = $3 and deleted_at is null`,
			toStatus, id, tu.TenantID)
	}
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		insert into public.pr_approvals (
		  purchase_request_id, action, actor_user_id, actor_name, remarks, from_status, to_status
		) values ($1, $2, $3, $4, $5, $6, $7)`,
		id, action, tu.AppUserID, actorName, remarks, fromStatus, toStatus)
	if err != nil {
		return err
	}
	if action == "submit" {
		var ref string
		_ = tx.QueryRow(ctx, `
			select coalesce(nullif(trim(reference), ''), purchase_request_no, '')
			from public.pr_purchase_requests
			where id = $1 and tenant_id = $2`, id, tu.TenantID).Scan(&ref)
		label := ref
		if label == "" {
			label = fmt.Sprintf("Purchase Request #%d", id)
		}
		if err := approval.EnqueuePendingApprovalTx(ctx, tx, tu.TenantID, "purchase_request", id, label, actorName); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func parsePurchaseRequestID(r *http.Request) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
}

func manualConfirmBlocked(ctx context.Context, pool *pgxpool.Pool, tenantID int64, targetStatus string) (bool, error) {
	if targetStatus != "confirmed" {
		return false, nil
	}
	policy, err := processpolicy.Load(ctx, pool, tenantID)
	if err != nil {
		return false, err
	}
	return policy.PurchaseRequirePRApproval, nil
}
