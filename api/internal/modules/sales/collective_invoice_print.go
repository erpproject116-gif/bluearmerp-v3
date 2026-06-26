package sales

import (
	"context"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type collectiveSlipLine struct {
	LineNo      int     `json:"line_no"`
	ItemCode    string  `json:"item_code"`
	ItemName    string  `json:"item_name"`
	Description *string `json:"description,omitempty"`
	Qty         float64 `json:"qty"`
	SerialLotNo *string `json:"serial_lot_no,omitempty"`
	UnitVatInc  float64 `json:"unit_vat_inc"`
	LineTotal   float64 `json:"line_total"`
}

type collectiveSlipSale struct {
	SalesID       int64                `json:"sales_id"`
	DateNoDisplay string               `json:"date_no_display"`
	SalesNo       string               `json:"sales_no"`
	SiDrNo        *string              `json:"si_dr_no,omitempty"`
	PicName       string               `json:"pic_name"`
	Lines         []collectiveSlipLine `json:"lines"`
}

type collectiveSlipPayload struct {
	Tenant  printParty         `json:"tenant"`
	Partner printParty         `json:"partner"`
	Invoice CollectiveInvoice  `json:"invoice"`
	Sales   []collectiveSlipSale `json:"sales"`
	Totals  struct {
		Qty       float64 `json:"qty"`
		Subtotal  float64 `json:"subtotal"`
		TaxTotal  float64 `json:"tax_total"`
		GrandTotal float64 `json:"grand_total"`
	} `json:"totals"`
}

type collectiveInvoicePrintPayload struct {
	Tenant  printParty        `json:"tenant"`
	Partner printParty        `json:"partner"`
	Invoice CollectiveInvoice `json:"invoice"`
	Mode    string            `json:"mode"`
	AR      *struct {
		BeginningAR float64 `json:"beginning_ar"`
		Purchases   float64 `json:"purchases"`
		EndingAR    float64 `json:"ending_ar"`
		DueDate     *string `json:"due_date,omitempty"`
		PicName     string  `json:"pic_name,omitempty"`
	} `json:"ar,omitempty"`
}

func loadPrintParties(ctx context.Context, pool *pgxpool.Pool, tenantID, partnerID int64) (printParty, printParty, error) {
	var tenant, partner printParty
	err := pool.QueryRow(ctx, `
		select company_name, address, phone, email from public.tenants where id = $1`, tenantID).
		Scan(&tenant.CompanyName, &tenant.Address, &tenant.Phone, &tenant.Email)
	if err != nil {
		return tenant, partner, err
	}
	err = pool.QueryRow(ctx, `
		select company_name, address, phone, mobile, email
		from public.inv_partners where id = $1 and tenant_id = $2 and deleted_at is null`,
		partnerID, tenantID).
		Scan(&partner.CompanyName, &partner.Address, &partner.Phone, &partner.Mobile, &partner.Email)
	return tenant, partner, err
}

func getCollectiveInvoicePrintSlip(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		inv, err := loadCollectiveInvoice(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
			return
		}
		tenant, partner, err := loadPrintParties(r.Context(), pool, tu.TenantID, inv.PartnerID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load parties.", "ERR_INTERNAL")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select s.id, s.order_date, s.date_seq, s.sales_no, s.si_dr_no, s.pic_name, cis.sort_order
			from public.sa_collective_invoice_sales cis
			join public.sa_sales s on s.id = cis.sales_id
			where cis.collective_invoice_id = $1 and s.tenant_id = $2
			order by cis.sort_order`, id, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load sales.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var sales []collectiveSlipSale
		var totalQty float64
		for rows.Next() {
			var cs collectiveSlipSale
			var orderDate interface{}
			var dateSeq int
			var sortOrder int
			if err := rows.Scan(&cs.SalesID, &orderDate, &dateSeq, &cs.SalesNo, &cs.SiDrNo, &cs.PicName, &sortOrder); err != nil {
				continue
			}
			if t, ok := orderDate.(interface{ Format(string) string }); ok {
				_ = t
			}
			lines, _ := loadSaleLines(r.Context(), pool, cs.SalesID)
			lineNo := 0
			for _, ln := range lines {
				lineNo++
				cs.Lines = append(cs.Lines, collectiveSlipLine{
					LineNo:      lineNo,
					ItemCode:    ln.ItemCode,
					ItemName:    ln.ItemName,
					Description: ln.Description,
					Qty:         ln.Qty,
					SerialLotNo: ln.SerialLotNo,
					UnitVatInc:  ln.UnitVatInc,
					LineTotal:   ln.LineTotal,
				})
				totalQty += ln.Qty
			}
			sale, _ := loadSale(r.Context(), pool, tu.TenantID, cs.SalesID)
			cs.DateNoDisplay = sale.DateNoDisplay
			sales = append(sales, cs)
		}
		payload := collectiveSlipPayload{
			Tenant:  tenant,
			Partner: partner,
			Invoice: inv,
			Sales:   sales,
		}
		payload.Totals.Qty = totalQty
		payload.Totals.Subtotal = inv.Subtotal
		payload.Totals.TaxTotal = inv.TaxTotal
		payload.Totals.GrandTotal = inv.GrandTotal
		response.OK(w, payload, "OK")
	}
}

func getCollectiveInvoicePrintInvoice(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		mode := strings.TrimSpace(r.URL.Query().Get("mode"))
		if mode == "" {
			mode = "voucher"
		}
		if mode != "voucher" && mode != "ar_statement" {
			response.Validation(w, map[string]string{"mode": "Use voucher or ar_statement."})
			return
		}
		inv, err := loadCollectiveInvoice(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
			return
		}
		tenant, partner, err := loadPrintParties(r.Context(), pool, tu.TenantID, inv.PartnerID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load parties.", "ERR_INTERNAL")
			return
		}
		payload := collectiveInvoicePrintPayload{
			Tenant:  tenant,
			Partner: partner,
			Invoice: inv,
			Mode:    mode,
		}
		if mode == "ar_statement" {
			var totalSales, totalReceived float64
			_ = pool.QueryRow(r.Context(), `
				select coalesce(sum(s.grand_total), 0)::float8,
				  coalesce(sum(recv.received), 0)::float8
				from public.sa_sales s
				left join lateral (
				  select coalesce(sum(a.applied_amount), 0)::float8 as received
				  from public.fin_receipt_applications a
				  join public.fin_official_receipts r on r.id = a.official_receipt_id
				  where a.sales_id = s.id and r.deleted_at is null
				) recv on true
				where s.tenant_id = $1 and s.partner_id = $2 and s.deleted_at is null`,
				tu.TenantID, inv.PartnerID).Scan(&totalSales, &totalReceived)
			ending := totalSales - totalReceived
			purchases := inv.GrandTotal
			beginning := ending - purchases
			if beginning < 0 {
				beginning = 0
			}
			var picName string
			_ = pool.QueryRow(r.Context(), `
				select coalesce(s.pic_name, '') from public.sa_collective_invoice_sales cis
				join public.sa_sales s on s.id = cis.sales_id
				where cis.collective_invoice_id = $1 order by cis.sort_order limit 1`, id).Scan(&picName)
			payload.AR = &struct {
				BeginningAR float64 `json:"beginning_ar"`
				Purchases   float64 `json:"purchases"`
				EndingAR    float64 `json:"ending_ar"`
				DueDate     *string `json:"due_date,omitempty"`
				PicName     string  `json:"pic_name,omitempty"`
			}{
				BeginningAR: beginning,
				Purchases:   purchases,
				EndingAR:    ending,
				DueDate:     inv.DueDate,
				PicName:     picName,
			}
		}
		response.OK(w, payload, "OK")
	}
}
