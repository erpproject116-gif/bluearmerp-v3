package finance

import (
	"context"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type creditNotePrintPayload struct {
	Tenant     printParty    `json:"tenant"`
	Partner    printParty    `json:"partner"`
	CreditNote creditNoteRow `json:"credit_note"`
}

func getCreditNotePrint(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		row, err := loadCreditNote(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Credit note not found.", "ERR_NOT_FOUND")
			return
		}
		tenant, partner, err := loadPrintParties(r.Context(), pool, tu.TenantID, row.PartnerID, row.CustomerName)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load print data.", "ERR_INTERNAL")
			return
		}
		response.OK(w, creditNotePrintPayload{Tenant: tenant, Partner: partner, CreditNote: row}, "OK")
	}
}

type vendorCreditPrintPayload struct {
	Tenant       printParty      `json:"tenant"`
	Partner      printParty      `json:"partner"`
	VendorCredit vendorCreditRow `json:"vendor_credit"`
}

func getVendorCreditPrint(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		row, err := loadVendorCredit(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Vendor credit not found.", "ERR_NOT_FOUND")
			return
		}
		tenant, partner, err := loadPrintParties(r.Context(), pool, tu.TenantID, row.PartnerID, row.VendorName)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load print data.", "ERR_INTERNAL")
			return
		}
		response.OK(w, vendorCreditPrintPayload{Tenant: tenant, Partner: partner, VendorCredit: row}, "OK")
	}
}

type printParty struct {
	CompanyName string  `json:"company_name"`
	Address     *string `json:"address,omitempty"`
	Phone       *string `json:"phone,omitempty"`
	Mobile      *string `json:"mobile,omitempty"`
	Email       *string `json:"email,omitempty"`
}

func loadPrintParties(ctx context.Context, pool *pgxpool.Pool, tenantID int64, partnerID *int64, fallbackName string) (printParty, printParty, error) {
	var tenant printParty
	if err := pool.QueryRow(ctx, `
		select company_name, address, phone, email
		from public.tenants where id = $1`, tenantID).
		Scan(&tenant.CompanyName, &tenant.Address, &tenant.Phone, &tenant.Email); err != nil {
		return printParty{}, printParty{}, err
	}
	partner := printParty{CompanyName: fallbackName}
	if partnerID != nil && *partnerID > 0 {
		_ = pool.QueryRow(ctx, `
			select company_name, address, phone, mobile, email
			from public.inv_partners
			where id = $1 and tenant_id = $2 and deleted_at is null`,
			*partnerID, tenantID).
			Scan(&partner.CompanyName, &partner.Address, &partner.Phone, &partner.Mobile, &partner.Email)
	}
	return tenant, partner, nil
}
