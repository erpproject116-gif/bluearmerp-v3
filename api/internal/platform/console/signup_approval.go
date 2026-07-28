package console

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customerregistry"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func (s *service) approveCustomer(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		response.Validation(w, map[string]string{"id": "Invalid customer id."})
		return
	}
	var tenantID *int64
	var email string
	err = s.pool.QueryRow(r.Context(), `
		select tenant_id, email from public.platform_customers where id = $1`, id).Scan(&tenantID, &email)
	if err != nil {
		if err == pgx.ErrNoRows {
			response.Err(w, http.StatusNotFound, "Customer not found.", "ERR_NOT_FOUND")
			return
		}
		response.Err(w, http.StatusInternalServerError, "Failed to load customer.", "ERR_INTERNAL")
		return
	}
	if tenantID == nil || *tenantID <= 0 {
		response.Err(w, http.StatusBadRequest, "Customer has no workspace to approve.", "ERR_BAD_REQUEST")
		return
	}
	var status, code string
	err = s.pool.QueryRow(r.Context(), `
		select status, company_code from public.tenants where id = $1`, *tenantID).Scan(&status, &code)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to load workspace.", "ERR_INTERNAL")
		return
	}
	if status == "active" {
		response.OK(w, map[string]any{"tenant_id": *tenantID, "company_code": code, "already_active": true}, "Workspace already active.")
		return
	}
	if status != "pending_approval" {
		response.Err(w, http.StatusBadRequest, "Workspace is not pending approval (status="+status+").", "ERR_BAD_REQUEST")
		return
	}
	tag, err := s.pool.Exec(r.Context(), `
		update public.tenants set status = 'active', updated_at = now() where id = $1 and status = 'pending_approval'`, *tenantID)
	if err != nil || tag.RowsAffected() == 0 {
		response.Err(w, http.StatusInternalServerError, "Failed to approve workspace.", "ERR_INTERNAL")
		return
	}
	_, _ = customerregistry.UpdateCustomerUrgency(r.Context(), s.pool, id, time.Now())
	customerregistry.AppendCRMLeadNote(r.Context(), s.pool, id, "[approval] Product owner approved self-serve workspace.")
	tu, _ := auth.FromContext(r.Context())
	logPlatformAudit(r.Context(), s.pool, tu, platformAuditEntry{
		ActionCode: "platform.customer.approve", EventKind: "change",
		HTTPMethod: "POST", RoutePath: r.URL.Path,
		PlatformCustomerID: &id, TenantID: tenantID,
		TargetType: "tenants", TargetID: tenantID,
		Summary: "Approved pending workspace " + code,
	})
	response.OK(w, map[string]any{"tenant_id": *tenantID, "company_code": code, "approved": true}, "Workspace approved.")
}

func (s *service) rejectCustomer(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		response.Validation(w, map[string]string{"id": "Invalid customer id."})
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	reason := strings.TrimSpace(body.Reason)
	if reason == "" {
		reason = "Rejected by product owner."
	}

	var tenantID *int64
	err = s.pool.QueryRow(r.Context(), `
		select tenant_id from public.platform_customers where id = $1`, id).Scan(&tenantID)
	if err != nil {
		if err == pgx.ErrNoRows {
			response.Err(w, http.StatusNotFound, "Customer not found.", "ERR_NOT_FOUND")
			return
		}
		response.Err(w, http.StatusInternalServerError, "Failed to load customer.", "ERR_INTERNAL")
		return
	}
	if tenantID == nil || *tenantID <= 0 {
		response.Err(w, http.StatusBadRequest, "Customer has no workspace to reject.", "ERR_BAD_REQUEST")
		return
	}
	var status, code string
	err = s.pool.QueryRow(r.Context(), `
		select status, company_code from public.tenants where id = $1`, *tenantID).Scan(&status, &code)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to load workspace.", "ERR_INTERNAL")
		return
	}
	if status != "pending_approval" {
		response.Err(w, http.StatusBadRequest, "Only pending_approval workspaces can be rejected (status="+status+").", "ERR_BAD_REQUEST")
		return
	}
	_, err = s.pool.Exec(r.Context(), `
		update public.tenants set status = 'cancelled', updated_at = now() where id = $1`, *tenantID)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to reject workspace.", "ERR_INTERNAL")
		return
	}
	customerregistry.AppendCRMLeadNote(r.Context(), s.pool, id, "[approval] Rejected: "+reason)
	tu, _ := auth.FromContext(r.Context())
	logPlatformAudit(r.Context(), s.pool, tu, platformAuditEntry{
		ActionCode: "platform.customer.reject", EventKind: "change",
		HTTPMethod: "POST", RoutePath: r.URL.Path,
		PlatformCustomerID: &id, TenantID: tenantID,
		TargetType: "tenants", TargetID: tenantID,
		Summary: "Rejected workspace " + code,
	})
	response.OK(w, map[string]any{"tenant_id": *tenantID, "company_code": code, "rejected": true}, "Workspace rejected.")
}
