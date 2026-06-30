package purchaserequest

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type printParty struct {
	CompanyName string  `json:"company_name"`
	Address     *string `json:"address,omitempty"`
	Phone       *string `json:"phone,omitempty"`
	Mobile      *string `json:"mobile,omitempty"`
	Email       *string `json:"email,omitempty"`
}

type purchaseRequestPrintPayload struct {
	Tenant          printParty      `json:"tenant"`
	Partner         printParty      `json:"partner"`
	PurchaseRequest PurchaseRequest `json:"purchase_request"`
}

func getPurchaseRequestPrint(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}

		pr, err := loadPurchaseRequest(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Purchase request not found.", "ERR_NOT_FOUND")
			return
		}

		var tenant printParty
		err = pool.QueryRow(r.Context(), `
			select company_name, address, phone, email
			from public.tenants where id = $1`, tu.TenantID).
			Scan(&tenant.CompanyName, &tenant.Address, &tenant.Phone, &tenant.Email)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load tenant.", "ERR_INTERNAL")
			return
		}

		var partner printParty
		if pr.PartnerID != nil {
			err = pool.QueryRow(r.Context(), `
				select company_name, address, phone, mobile, email
				from public.inv_partners
				where id = $1 and tenant_id = $2 and deleted_at is null`,
				*pr.PartnerID, tu.TenantID).
				Scan(&partner.CompanyName, &partner.Address, &partner.Phone, &partner.Mobile, &partner.Email)
			if err != nil {
				partner.CompanyName = pr.PartnerName
			}
		} else {
			partner.CompanyName = pr.PartnerName
		}

		response.OK(w, purchaseRequestPrintPayload{
			Tenant:          tenant,
			Partner:         partner,
			PurchaseRequest: pr,
		}, "OK")
	}
}

func patchPurchaseRequestProgressStatus(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body struct {
			ProgressStatus string `json:"progress_status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.ProgressStatus != "" && !isValidProgressStatus(body.ProgressStatus) {
			response.Validation(w, map[string]string{"progress_status": "Invalid progress status."})
			return
		}
		status := defaultProgress(body.ProgressStatus)
		blocked, err := manualConfirmBlocked(r.Context(), pool, tu.TenantID, status)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load process policies.", "ERR_INTERNAL")
			return
		}
		if blocked {
			response.Validation(w, map[string]string{"progress_status": "Use Approve when purchase request approval is required."})
			return
		}

		tag, err := pool.Exec(r.Context(), `
			update public.pr_purchase_requests
			set progress_status = $1, updated_at = now()
			where id = $2 and tenant_id = $3 and deleted_at is null`,
			status, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Purchase request not found.", "ERR_NOT_FOUND")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "purchase_request.progress_status", "pr_purchase_request", &id, nil, body)
		pr, err := loadPurchaseRequest(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load purchase request.", "ERR_INTERNAL")
			return
		}
		response.OK(w, pr, "Updated.")
	}
}

func patchPurchaseRequestSendStatus(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body struct {
			SendStatus string `json:"send_status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.SendStatus != "unsent" && body.SendStatus != "sent" {
			response.Validation(w, map[string]string{"send_status": "Must be unsent or sent."})
			return
		}

		tag, err := pool.Exec(r.Context(), `
			update public.pr_purchase_requests
			set send_status = $1, updated_at = now()
			where id = $2 and tenant_id = $3 and deleted_at is null`,
			body.SendStatus, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Purchase request not found.", "ERR_NOT_FOUND")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "purchase_request.send_status", "pr_purchase_request", &id, nil, body)
		pr, err := loadPurchaseRequest(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load purchase request.", "ERR_INTERNAL")
			return
		}
		response.OK(w, pr, "Updated.")
	}
}
