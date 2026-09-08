package usermgmt

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func canTransferCompanyOwnership(tu auth.TenantUser) bool {
	return tu.IsPlatformSuperadmin || tu.IsTenantOwner || auth.IsPlatformConsoleEmail(tu.Email)
}

func operatorOwnerLockMessage(companyCode, newOwnerEmail string) string {
	if !auth.IsOperatorCompanyCode(companyCode) {
		return ""
	}
	if auth.IsOperatorStoreOwnerEmail(newOwnerEmail) {
		return ""
	}
	return "BLUEARM must stay owned by bluearmph@gmail.com. Transfer ownership on a customer company, not the operator tenant."
}

func transferOwnership(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if !canTransferCompanyOwnership(tu) {
			response.Err(w, http.StatusForbidden, "Only the current company owner or a platform superadmin can transfer ownership.", "ERR_FORBIDDEN")
			return
		}
		newOwnerID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || newOwnerID <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid user id."})
			return
		}
		var body struct {
			Acknowledge bool `json:"acknowledge"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if !body.Acknowledge {
			response.Validation(w, map[string]string{"acknowledge": "Confirm that you are transferring company ownership."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to transfer ownership.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var companyCode, companyName string
		var currentOwnerID *int64
		err = tx.QueryRow(r.Context(), `
			select company_code, coalesce(company_name, ''), owner_user_id
			from public.tenants
			where id = $1
			for update`, tu.TenantID).Scan(&companyCode, &companyName, &currentOwnerID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load company.", "ERR_INTERNAL")
			return
		}

		var email, fullName, status string
		err = tx.QueryRow(r.Context(), `
			select email, coalesce(full_name, ''), status
			from public.users
			where id = $1 and tenant_id = $2
			for update`, newOwnerID, tu.TenantID).Scan(&email, &fullName, &status)
		if err == pgx.ErrNoRows {
			response.Err(w, http.StatusNotFound, "That user is not in this company.", "ERR_NOT_FOUND")
			return
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load user.", "ERR_INTERNAL")
			return
		}
		if status != "active" {
			response.Err(w, http.StatusBadRequest, "Ownership can only move to an active user. Restore or invite them first.", "ERR_BAD_REQUEST")
			return
		}
		if currentOwnerID != nil && *currentOwnerID == newOwnerID {
			response.Err(w, http.StatusBadRequest, email+" is already the company owner.", "ERR_BAD_REQUEST")
			return
		}
		if msg := operatorOwnerLockMessage(companyCode, email); msg != "" {
			response.Err(w, http.StatusBadRequest, msg, "ERR_BAD_REQUEST")
			return
		}

		if _, err := tx.Exec(r.Context(), `
			update public.users
			set tenant_role = 'store_admin', updated_at = now(), auth_revision = auth_revision + 1
			where id = $1 and tenant_id = $2`, newOwnerID, tu.TenantID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to promote the new owner.", "ERR_INTERNAL")
			return
		}
		if _, err := tx.Exec(r.Context(), `
			update public.tenants
			set owner_user_id = $2, updated_at = now()
			where id = $1`, tu.TenantID, newOwnerID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to transfer ownership.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to transfer ownership.", "ERR_INTERNAL")
			return
		}

		prevID := int64(0)
		if currentOwnerID != nil {
			prevID = *currentOwnerID
			_ = auth.InvalidateUserByAppUserID(r.Context(), pool, prevID)
		}
		_ = auth.InvalidateUserByAppUserID(r.Context(), pool, newOwnerID)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "user.transfer_ownership", "user", &newOwnerID, nil, map[string]any{
			"previous_owner_user_id": prevID,
			"new_owner_user_id":      newOwnerID,
			"new_owner_email":        email,
			"company_code":           companyCode,
		})

		label := strings.TrimSpace(fullName)
		if label == "" {
			label = email
		}
		response.OK(w, map[string]any{
			"company_code":      companyCode,
			"company_name":      companyName,
			"owner_user_id":     newOwnerID,
			"owner_email":       email,
			"previous_owner_id": prevID,
		}, label+" is now the owner of "+companyCode+". The previous owner stays as a user and can be deleted after this.")
	}
}
