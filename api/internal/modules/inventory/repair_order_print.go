package inventory

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

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

type repairOrderPrintPayload struct {
	DocType string     `json:"doc_type"`
	Tenant  printParty `json:"tenant"`
	Partner printParty `json:"partner"`
	Order   RepairOrder `json:"order"`
}

func getRepairOrderPrint(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		docType := r.URL.Query().Get("doc")
		if docType != "receipt" && docType != "warranty" {
			response.Validation(w, map[string]string{"doc": "Must be receipt or warranty."})
			return
		}

		ro, err := loadRepairOrder(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Repair order not found.", "ERR_NOT_FOUND")
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
			ro.PartnerID, tu.TenantID).
			Scan(&partner.CompanyName, &partner.Address, &partner.Phone, &partner.Mobile, &partner.Email)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load customer.", "ERR_INTERNAL")
			return
		}

		response.OK(w, repairOrderPrintPayload{
			DocType: docType,
			Tenant:  tenant,
			Partner: partner,
			Order:   ro,
		}, "OK")
	}
}
