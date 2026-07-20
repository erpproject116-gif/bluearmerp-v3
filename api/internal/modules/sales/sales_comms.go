package sales

import (
	"context"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/branding"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/comms"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/pdf"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func saleToPDF(payload salesPrintPayload) pdf.GenericDocumentInput {
	sale := payload.Sales
	ccy := sale.CurrencyCode
	var lineData []struct {
		LineNo   int
		ItemCode string
		ItemName string
		Qty      float64
		UnitAmt  float64
		LineAmt  float64
	}
	for _, ln := range sale.Lines {
		lineData = append(lineData, struct {
			LineNo   int
			ItemCode string
			ItemName string
			Qty      float64
			UnitAmt  float64
			LineAmt  float64
		}{ln.LineNo, ln.ItemCode, ln.ItemName, ln.Qty, ln.UnitVatInc, ln.LineTotal})
	}
	headers, rows := pdf.StandardLineTable(ccy, lineData)
	return pdf.GenericDocumentInput{
		DocTitle:          "Sales Invoice",
		DocSubtitle:       sale.SalesNo,
		Tenant:            pdf.ToParty(payload.Tenant.CompanyName, payload.Tenant.Address, payload.Tenant.Phone, payload.Tenant.Mobile, payload.Tenant.Email),
		CounterpartyTitle: "Customer",
		Counterparty:      pdf.ToParty(payload.Partner.CompanyName, payload.Partner.Address, payload.Partner.Phone, payload.Partner.Mobile, payload.Partner.Email),
		DetailFields: []pdf.PartyField{
			{Label: "Date-no", Value: sale.DateNoDisplay},
			{Label: "Invoice date", Value: sale.OrderDate},
			{Label: "Status", Value: sale.ProgressStatus},
			{Label: "PIC", Value: sale.PicName},
		},
		LineHeaders:   headers,
		LineRows:      rows,
		LineColWidths: []float64{10, 80, 20, 30, 30},
		Totals: []pdf.TotalRow{
			{Label: "Subtotal", Value: pdf.FormatMoney(sale.Subtotal, ccy)},
			{Label: "Tax", Value: pdf.FormatMoney(sale.TaxTotal, ccy)},
			{Label: "Grand Total", Value: pdf.FormatMoney(sale.GrandTotal, ccy), Bold: true},
		},
		Notes: pdf.StrVal(sale.Notes),
	}
}

func loadSalesPrintPayload(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (salesPrintPayload, error) {
	sale, err := loadSale(ctx, pool, tenantID, id)
	if err != nil {
		return salesPrintPayload{}, err
	}
	var tenant printParty
	err = pool.QueryRow(ctx, `
		select company_name, address, phone, email
		from public.tenants where id = $1`, tenantID).
		Scan(&tenant.CompanyName, &tenant.Address, &tenant.Phone, &tenant.Email)
	if err != nil {
		return salesPrintPayload{}, err
	}
	var partner printParty
	err = pool.QueryRow(ctx, `
		select company_name, address, phone, mobile, email
		from public.inv_partners
		where id = $1 and tenant_id = $2 and deleted_at is null`,
		sale.PartnerID, tenantID).
		Scan(&partner.CompanyName, &partner.Address, &partner.Phone, &partner.Mobile, &partner.Email)
	if err != nil {
		return salesPrintPayload{}, err
	}
	return salesPrintPayload{Tenant: tenant, Partner: partner, Sales: sale}, nil
}

func getSalesPDF(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		payload, err := loadSalesPrintPayload(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Sales not found.", "ERR_NOT_FOUND")
			return
		}
		in := saleToPDF(payload)
		in.Chrome = branding.LoadPDFChrome(r.Context(), pool, tu.TenantID)
		data, err := pdf.RenderGenericDocumentPDF(in)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to render PDF.", "ERR_INTERNAL")
			return
		}
		comms.WritePDF(w, fmt.Sprintf("sales-%s.pdf", payload.Sales.SalesNo), data)
	}
}

func postSalesSendEmail(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		body, err := comms.DecodeSendEmailBody(r)
		if err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		payload, err := loadSalesPrintPayload(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Sales not found.", "ERR_NOT_FOUND")
			return
		}
		in := saleToPDF(payload)
		in.Chrome = branding.LoadPDFChrome(r.Context(), pool, tu.TenantID)
		pdfBytes, err := pdf.RenderGenericDocumentPDF(in)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to render PDF.", "ERR_INTERNAL")
			return
		}
		sale := payload.Sales
		comms.HandleDocumentSendEmail(w, r, pool, body, comms.DocumentSendParams{
			DocType:        "sales",
			DocID:          id,
			AttachmentName: fmt.Sprintf("sales-%s.pdf", sale.SalesNo),
			PDFBytes:       pdfBytes,
			TemplateVars: comms.TemplateVars{
				"reference_no":  sale.SalesNo,
				"customer_name": payload.Partner.CompanyName,
				"company_name":  payload.Tenant.CompanyName,
				"grand_total":   fmt.Sprintf("%.2f", sale.GrandTotal),
				"doc_type":      "Sales Invoice",
			},
		})
	}
}
