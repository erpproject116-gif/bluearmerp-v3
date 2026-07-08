package salesorder

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/creditlimit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type printParty struct {
	CompanyName string  `json:"company_name"`
	Address     *string `json:"address,omitempty"`
	Phone       *string `json:"phone,omitempty"`
	Mobile      *string `json:"mobile,omitempty"`
	Email       *string `json:"email,omitempty"`
}

type salesOrderPrintPayload struct {
	Tenant     printParty `json:"tenant"`
	Partner    printParty `json:"partner"`
	SalesOrder SalesOrder `json:"sales_order"`
}

func getSalesOrderPrint(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}

		so, err := loadSalesOrder(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Sales order not found.", "ERR_NOT_FOUND")
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
			so.PartnerID, tu.TenantID).
			Scan(&partner.CompanyName, &partner.Address, &partner.Phone, &partner.Mobile, &partner.Email)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load customer.", "ERR_INTERNAL")
			return
		}

		response.OK(w, salesOrderPrintPayload{
			Tenant:     tenant,
			Partner:    partner,
			SalesOrder: so,
		}, "OK")
	}
}

func patchSalesOrderProgressStatus(pool *pgxpool.Pool) http.HandlerFunc {
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

		policy, err := processpolicy.Load(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load process policies.", "ERR_INTERNAL")
			return
		}
		if v := processpolicy.ValidateAttachmentRequired(r.Context(), pool, policy, processpolicy.DocSalesOrder, status, id); v != nil {
			response.Validation(w, v)
			return
		}

		if status == "in_progress" {
			var partnerID int64
			var grandTotal float64
			var prevStatus string
			err = pool.QueryRow(r.Context(), `
				select partner_id, grand_total::float8, progress_status
				from public.so_sales_orders
				where id = $1 and tenant_id = $2 and deleted_at is null`,
				id, tu.TenantID).Scan(&partnerID, &grandTotal, &prevStatus)
			if err != nil {
				response.Err(w, http.StatusNotFound, "Sales order not found.", "ERR_NOT_FOUND")
				return
			}
			if prevStatus != "in_progress" {
				if clErrs, err := creditlimit.ValidateFromPolicy(r.Context(), pool, tu.TenantID, partnerID, grandTotal); err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to validate credit limit.", "ERR_INTERNAL")
					return
				} else if clErrs != nil {
					response.Validation(w, clErrs)
					return
				}
			}
		}

		tag, err := pool.Exec(r.Context(), `
			update public.so_sales_orders
			set progress_status = $1, updated_at = now()
			where id = $2 and tenant_id = $3 and deleted_at is null`,
			status, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Sales order not found.", "ERR_NOT_FOUND")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales_order.progress_status", "so_sales_order", &id, nil, body)
		so, err := loadSalesOrder(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load sales order.", "ERR_INTERNAL")
			return
		}
		response.OK(w, so, "Updated.")
	}
}
