package finance

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type siPrintParty struct {
	CompanyName string  `json:"company_name"`
	Address     *string `json:"address,omitempty"`
	Phone       *string `json:"phone,omitempty"`
	Mobile      *string `json:"mobile,omitempty"`
	Email       *string `json:"email,omitempty"`
}

type supplierInvoicePrintPayload struct {
	Tenant          siPrintParty    `json:"tenant"`
	Partner         siPrintParty    `json:"partner"`
	SupplierInvoice SupplierInvoice `json:"supplier_invoice"`
}

func getSupplierInvoicePrint(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		inv, err := loadSupplierInvoice(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Purchase not found.", "ERR_NOT_FOUND")
			return
		}
		var tenant siPrintParty
		err = pool.QueryRow(r.Context(), `
			select company_name, address, phone, email
			from public.tenants where id = $1`, tu.TenantID).
			Scan(&tenant.CompanyName, &tenant.Address, &tenant.Phone, &tenant.Email)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load tenant.", "ERR_INTERNAL")
			return
		}
		var partner siPrintParty
		err = pool.QueryRow(r.Context(), `
			select company_name, address, phone, mobile, email
			from public.inv_partners
			where id = $1 and tenant_id = $2 and deleted_at is null`,
			inv.PartnerID, tu.TenantID).
			Scan(&partner.CompanyName, &partner.Address, &partner.Phone, &partner.Mobile, &partner.Email)
		if err != nil {
			partner.CompanyName = inv.VendorName
		}
		response.OK(w, supplierInvoicePrintPayload{Tenant: tenant, Partner: partner, SupplierInvoice: inv}, "OK")
	}
}
