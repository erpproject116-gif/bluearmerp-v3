package quotation

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

type quotationPrintPayload struct {
	Tenant    printParty `json:"tenant"`
	Partner   printParty `json:"partner"`
	Quotation Quotation  `json:"quotation"`
}

func getQuotationPrint(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}

		q, err := loadQuotation(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Quotation not found.", "ERR_NOT_FOUND")
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
		err = pool.QueryRow(r.Context(), `
			select company_name, address, phone, mobile, email
			from public.inv_partners
			where id = $1 and tenant_id = $2 and deleted_at is null`,
			q.PartnerID, tu.TenantID).
			Scan(&partner.CompanyName, &partner.Address, &partner.Phone, &partner.Mobile, &partner.Email)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load customer.", "ERR_INTERNAL")
			return
		}

		response.OK(w, quotationPrintPayload{
			Tenant:    tenant,
			Partner:   partner,
			Quotation: q,
		}, "OK")
	}
}

func patchQuotationProgressStatus(pool *pgxpool.Pool) http.HandlerFunc {
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
		if body.ProgressStatus != "" && body.ProgressStatus != "unconfirmed" &&
			body.ProgressStatus != "in_progress" && body.ProgressStatus != "completed" {
			response.Validation(w, map[string]string{"progress_status": "Must be unconfirmed, in_progress, or completed."})
			return
		}
		status := defaultProgress(body.ProgressStatus)

		tag, err := pool.Exec(r.Context(), `
			update public.quo_quotations
			set progress_status = $1, updated_at = now()
			where id = $2 and tenant_id = $3 and deleted_at is null`,
			status, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Quotation not found.", "ERR_NOT_FOUND")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "quotation.progress_status", "quo_quotation", &id, nil, body)
		q, err := loadQuotation(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load quotation.", "ERR_INTERNAL")
			return
		}
		response.OK(w, q, "Updated.")
	}
}
