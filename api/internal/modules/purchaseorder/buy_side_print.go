package purchaseorder

import (
	"context"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type buyPrintParty struct {
	CompanyName string  `json:"company_name"`
	Address     *string `json:"address,omitempty"`
	Phone       *string `json:"phone,omitempty"`
	Mobile      *string `json:"mobile,omitempty"`
	Email       *string `json:"email,omitempty"`
}

type purchaseOrderPrintPayload struct {
	Tenant        buyPrintParty `json:"tenant"`
	Partner       buyPrintParty `json:"partner"`
	PurchaseOrder PurchaseOrder `json:"purchase_order"`
}

type rfqPrintPayload struct {
	Tenant buyPrintParty `json:"tenant"`
	RFQ    RFQ           `json:"rfq"`
}

type supplierQuotationPrintPayload struct {
	Tenant            buyPrintParty     `json:"tenant"`
	Partner           buyPrintParty     `json:"partner"`
	SupplierQuotation SupplierQuotation `json:"supplier_quotation"`
}

func loadTenantParty(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (buyPrintParty, error) {
	var p buyPrintParty
	err := pool.QueryRow(ctx, `
		select company_name, address, phone, email
		from public.tenants where id = $1`, tenantID).
		Scan(&p.CompanyName, &p.Address, &p.Phone, &p.Email)
	return p, err
}

func loadPartnerParty(ctx context.Context, pool *pgxpool.Pool, tenantID, partnerID int64, fallbackName string) buyPrintParty {
	var p buyPrintParty
	err := pool.QueryRow(ctx, `
		select company_name, address, phone, mobile, email
		from public.inv_partners
		where id = $1 and tenant_id = $2 and deleted_at is null`,
		partnerID, tenantID).
		Scan(&p.CompanyName, &p.Address, &p.Phone, &p.Mobile, &p.Email)
	if err != nil {
		p.CompanyName = fallbackName
	}
	return p
}

func getPurchaseOrderPrint(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		po, err := loadPurchaseOrder(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Purchase order not found.", "ERR_NOT_FOUND")
			return
		}
		tenant, err := loadTenantParty(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load tenant.", "ERR_INTERNAL")
			return
		}
		partner := buyPrintParty{CompanyName: po.PartnerName}
		if po.PartnerID != nil {
			partner = loadPartnerParty(r.Context(), pool, tu.TenantID, *po.PartnerID, po.PartnerName)
		}
		response.OK(w, purchaseOrderPrintPayload{Tenant: tenant, Partner: partner, PurchaseOrder: po}, "OK")
	}
}

func getRFQPrint(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		rfq, err := loadRFQ(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "RFQ not found.", "ERR_NOT_FOUND")
			return
		}
		tenant, err := loadTenantParty(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load tenant.", "ERR_INTERNAL")
			return
		}
		response.OK(w, rfqPrintPayload{Tenant: tenant, RFQ: rfq}, "OK")
	}
}

func getSupplierQuotationPrint(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		sq, err := loadSupplierQuotation(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Supplier quotation not found.", "ERR_NOT_FOUND")
			return
		}
		tenant, err := loadTenantParty(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load tenant.", "ERR_INTERNAL")
			return
		}
		partner := loadPartnerParty(r.Context(), pool, tu.TenantID, sq.PartnerID, "")
		response.OK(w, supplierQuotationPrintPayload{Tenant: tenant, Partner: partner, SupplierQuotation: sq}, "OK")
	}
}
