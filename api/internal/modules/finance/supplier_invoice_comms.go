package finance

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

func siToPDF(payload supplierInvoicePrintPayload) pdf.GenericDocumentInput {
	inv := payload.SupplierInvoice
	ccy := inv.CurrencyCode
	var lineData []struct {
		LineNo   int
		ItemCode string
		ItemName string
		Qty      float64
		UnitAmt  float64
		LineAmt  float64
	}
	for _, ln := range inv.Lines {
		lineData = append(lineData, struct {
			LineNo   int
			ItemCode string
			ItemName string
			Qty      float64
			UnitAmt  float64
			LineAmt  float64
		}{ln.LineNo, ln.ItemCode, ln.ItemName, ln.Qty, ln.UnitNonVat, ln.LineTotal})
	}
	headers, rows := pdf.StandardLineTable(ccy, lineData)
	return pdf.GenericDocumentInput{
		DocTitle:          "Purchase",
		DocSubtitle:       inv.InvoiceNo,
		Tenant:            pdf.ToParty(payload.Tenant.CompanyName, payload.Tenant.Address, payload.Tenant.Phone, nil, payload.Tenant.Email),
		CounterpartyTitle: "Vendor",
		Counterparty:      pdf.ToParty(payload.Partner.CompanyName, payload.Partner.Address, payload.Partner.Phone, payload.Partner.Mobile, payload.Partner.Email),
		DetailFields: []pdf.PartyField{
			{Label: "Date-no", Value: inv.DateNoDisplay},
			{Label: "Invoice date", Value: inv.InvoiceDate},
			{Label: "Status", Value: inv.ProgressStatus},
		},
		LineHeaders:   headers,
		LineRows:      rows,
		LineColWidths: []float64{10, 80, 20, 30, 30},
		Totals: []pdf.TotalRow{
			{Label: "Subtotal", Value: pdf.FormatMoney(inv.Subtotal, ccy)},
			{Label: "Tax", Value: pdf.FormatMoney(inv.TaxTotal, ccy)},
			{Label: "Grand Total", Value: pdf.FormatMoney(inv.GrandTotal, ccy), Bold: true},
		},
		Notes: pdf.StrVal(inv.Notes),
	}
}

func loadSupplierInvoicePrintPayload(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (supplierInvoicePrintPayload, error) {
	inv, err := loadSupplierInvoice(ctx, pool, tenantID, id)
	if err != nil {
		return supplierInvoicePrintPayload{}, err
	}
	var tenant siPrintParty
	err = pool.QueryRow(ctx, `
		select company_name, address, phone, email
		from public.tenants where id = $1`, tenantID).
		Scan(&tenant.CompanyName, &tenant.Address, &tenant.Phone, &tenant.Email)
	if err != nil {
		return supplierInvoicePrintPayload{}, err
	}
	var partner siPrintParty
	err = pool.QueryRow(ctx, `
		select company_name, address, phone, mobile, email
		from public.inv_partners
		where id = $1 and tenant_id = $2 and deleted_at is null`,
		inv.PartnerID, tenantID).
		Scan(&partner.CompanyName, &partner.Address, &partner.Phone, &partner.Mobile, &partner.Email)
	if err != nil {
		partner.CompanyName = inv.VendorName
	}
	return supplierInvoicePrintPayload{Tenant: tenant, Partner: partner, SupplierInvoice: inv}, nil
}

func getSupplierInvoicePDF(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		payload, err := loadSupplierInvoicePrintPayload(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Purchase not found.", "ERR_NOT_FOUND")
			return
		}
		in := siToPDF(payload)
		in.Chrome = branding.LoadPDFChrome(r.Context(), pool, tu.TenantID)
		data, err := pdf.RenderGenericDocumentPDF(in)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to render PDF.", "ERR_INTERNAL")
			return
		}
		comms.WritePDF(w, fmt.Sprintf("purchase-%s.pdf", payload.SupplierInvoice.InvoiceNo), data)
	}
}

func postSupplierInvoiceSendEmail(pool *pgxpool.Pool) http.HandlerFunc {
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
		payload, err := loadSupplierInvoicePrintPayload(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Purchase not found.", "ERR_NOT_FOUND")
			return
		}
		in := siToPDF(payload)
		in.Chrome = branding.LoadPDFChrome(r.Context(), pool, tu.TenantID)
		pdfBytes, err := pdf.RenderGenericDocumentPDF(in)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to render PDF.", "ERR_INTERNAL")
			return
		}
		inv := payload.SupplierInvoice
		comms.HandleDocumentSendEmail(w, r, pool, body, comms.DocumentSendParams{
			DocType:        "supplier_invoice",
			DocID:          id,
			AttachmentName: fmt.Sprintf("purchase-%s.pdf", inv.InvoiceNo),
			PDFBytes:       pdfBytes,
			TemplateVars: comms.TemplateVars{
				"reference_no":  inv.InvoiceNo,
				"customer_name": payload.Partner.CompanyName,
				"company_name":  payload.Tenant.CompanyName,
				"grand_total":   fmt.Sprintf("%.2f", inv.GrandTotal),
				"doc_type":      "Purchase",
			},
		})
	}
}
