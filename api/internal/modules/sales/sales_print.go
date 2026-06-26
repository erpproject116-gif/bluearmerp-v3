package sales

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

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

type salesPrintPayload struct {
	Tenant  printParty `json:"tenant"`
	Partner printParty `json:"partner"`
	Sales   Sale       `json:"sales"`
}

func getSalesPrint(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}

		sale, err := loadSale(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Sales not found.", "ERR_NOT_FOUND")
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
			sale.PartnerID, tu.TenantID).
			Scan(&partner.CompanyName, &partner.Address, &partner.Phone, &partner.Mobile, &partner.Email)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load customer.", "ERR_INTERNAL")
			return
		}

		response.OK(w, salesPrintPayload{
			Tenant:  tenant,
			Partner: partner,
			Sales:   sale,
		}, "OK")
	}
}

func getSalesPrintBatch(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		raw := strings.TrimSpace(r.URL.Query().Get("ids"))
		if raw == "" {
			response.Validation(w, map[string]string{"ids": "At least one sales id is required."})
			return
		}
		parts := strings.Split(raw, ",")
		var ids []int64
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if p == "" {
				continue
			}
			id, err := strconv.ParseInt(p, 10, 64)
			if err != nil || id <= 0 {
				response.Validation(w, map[string]string{"ids": "Invalid sales id in list."})
				return
			}
			ids = append(ids, id)
		}
		if len(ids) == 0 {
			response.Validation(w, map[string]string{"ids": "At least one sales id is required."})
			return
		}
		if len(ids) > 100 {
			response.Validation(w, map[string]string{"ids": "Maximum 100 sales ids per batch."})
			return
		}

		var tenant printParty
		if err := pool.QueryRow(r.Context(), `
			select company_name, address, phone, email
			from public.tenants where id = $1`, tu.TenantID).
			Scan(&tenant.CompanyName, &tenant.Address, &tenant.Phone, &tenant.Email); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load tenant.", "ERR_INTERNAL")
			return
		}

		out := make([]salesPrintPayload, 0, len(ids))
		for _, id := range ids {
			sale, err := loadSale(r.Context(), pool, tu.TenantID, id)
			if err != nil {
				continue
			}
			var partner printParty
			if err := pool.QueryRow(r.Context(), `
				select company_name, address, phone, mobile, email
				from public.inv_partners
				where id = $1 and tenant_id = $2 and deleted_at is null`,
				sale.PartnerID, tu.TenantID).
				Scan(&partner.CompanyName, &partner.Address, &partner.Phone, &partner.Mobile, &partner.Email); err != nil {
				continue
			}
			out = append(out, salesPrintPayload{Tenant: tenant, Partner: partner, Sales: sale})
		}
		response.OK(w, out, "OK")
	}
}

func patchSalesProgressStatus(pool *pgxpool.Pool) http.HandlerFunc {
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
		if body.ProgressStatus != "" && body.ProgressStatus != "unconfirmed" && body.ProgressStatus != "completed" {
			response.Validation(w, map[string]string{"progress_status": "Must be unconfirmed or completed."})
			return
		}
		status := defaultProgress(body.ProgressStatus)

		tag, err := pool.Exec(r.Context(), `
			update public.sa_sales
			set progress_status = $1, updated_at = now()
			where id = $2 and tenant_id = $3 and deleted_at is null`,
			status, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Sales not found.", "ERR_NOT_FOUND")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales.progress_status", "sa_sales", &id, nil, body)
		sale, err := loadSale(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load sales.", "ERR_INTERNAL")
			return
		}
		response.OK(w, sale, "Updated.")
	}
}

func patchSalesInvoicingStatus(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body struct {
			InvoicingStatus bool `json:"invoicing_status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}

		tag, err := pool.Exec(r.Context(), `
			update public.sa_sales
			set invoicing_status = $1, updated_at = now()
			where id = $2 and tenant_id = $3 and deleted_at is null`,
			body.InvoicingStatus, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Sales not found.", "ERR_NOT_FOUND")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales.invoicing_status", "sa_sales", &id, nil, body)
		sale, err := loadSale(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load sales.", "ERR_INTERNAL")
			return
		}
		response.OK(w, sale, "Updated.")
	}
}
