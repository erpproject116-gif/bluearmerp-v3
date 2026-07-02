package finance

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type bir2307Party struct {
	CompanyName string  `json:"company_name"`
	Tin         *string `json:"tin,omitempty"`
	Address     *string `json:"address,omitempty"`
	Phone       *string `json:"phone,omitempty"`
	Email       *string `json:"email,omitempty"`
}

type bir2307WithholdingRow struct {
	Code        string  `json:"code"`
	Description string  `json:"description"`
	RatePct     float64 `json:"rate_pct"`
	BaseAmount  float64 `json:"base_amount"`
	TaxAmount   float64 `json:"tax_amount"`
}

type bir2307PrintPayload struct {
	CertificateNo string                  `json:"certificate_no"`
	PaymentDate   string                  `json:"payment_date"`
	PaymentNo     string                  `json:"payment_no"`
	DateNoDisplay string                  `json:"date_no_display"`
	Payor         bir2307Party            `json:"payor"`
	Payee         bir2307Party            `json:"payee"`
	Lines         []bir2307WithholdingRow `json:"lines"`
	TotalBase     float64                 `json:"total_base"`
	TotalTax      float64                 `json:"total_tax"`
}

func registerWithholdingPrintRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.payment_vouchers", auth.AccessRead)).
		Get("/payment-vouchers/{id}/print-2307", getPaymentVoucher2307Print(pool))
}

func getPaymentVoucher2307Print(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}

		pv, err := loadPaymentVoucher(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Payment voucher not found.", "ERR_NOT_FOUND")
			return
		}

		whtLines, err := listWithholdingLines(r.Context(), pool, tu.TenantID, "payment_voucher", id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load withholding lines.", "ERR_INTERNAL")
			return
		}
		if len(whtLines) == 0 {
			response.Validation(w, map[string]string{"withholding": "No withholding tax lines on this payment voucher."})
			return
		}

		var payor bir2307Party
		var payorTin *string
		_ = pool.QueryRow(r.Context(), `
			select t.company_name, t.address, t.phone, t.email,
			  coalesce(nullif(trim(t.tin), ''), nullif(trim(tb.settings->'receipt'->>'tax_id'), ''))
			from public.tenants t
			left join public.tenant_branding tb on tb.tenant_id = t.id
			where t.id = $1`, tu.TenantID).
			Scan(&payor.CompanyName, &payor.Address, &payor.Phone, &payor.Email, &payorTin)
		payor.Tin = payorTin

		var payee bir2307Party
		_ = pool.QueryRow(r.Context(), `
			select company_name, tin, address, phone, email
			from public.inv_partners
			where id = $1 and tenant_id = $2 and deleted_at is null`,
			pv.PartnerID, tu.TenantID).
			Scan(&payee.CompanyName, &payee.Tin, &payee.Address, &payee.Phone, &payee.Email)

		var rows []bir2307WithholdingRow
		var totalBase, totalTax float64
		for _, ln := range whtLines {
			row := bir2307WithholdingRow{
				Code:        ln.Code,
				Description: ln.Description,
				RatePct:     ln.RatePct,
				BaseAmount:  ln.BaseAmount,
				TaxAmount:   ln.TaxAmount,
			}
			rows = append(rows, row)
			totalBase += row.BaseAmount
			totalTax += row.TaxAmount
		}

		certNo := pv.PaymentNo
		if certNo == "" {
			certNo = pv.DateNoDisplay
		}

		response.OK(w, bir2307PrintPayload{
			CertificateNo: certNo,
			PaymentDate:   pv.PaymentDate,
			PaymentNo:     pv.PaymentNo,
			DateNoDisplay: pv.DateNoDisplay,
			Payor:         payor,
			Payee:         payee,
			Lines:         rows,
			TotalBase:     totalBase,
			TotalTax:      totalTax,
		}, "OK")
	}
}
