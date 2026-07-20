package salesorder

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/branding"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/comms"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/pdf"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func soToPDF(payload salesOrderPrintPayload) pdf.GenericDocumentInput {
	so := payload.SalesOrder
	ccy := so.CurrencyCode
	var lineData []struct {
		LineNo   int
		ItemCode string
		ItemName string
		Qty      float64
		UnitAmt  float64
		LineAmt  float64
	}
	for _, ln := range so.Lines {
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
		DocTitle:          "Sales Order",
		DocSubtitle:       so.SalesOrderNo,
		Tenant:            pdf.ToParty(payload.Tenant.CompanyName, payload.Tenant.Address, payload.Tenant.Phone, payload.Tenant.Mobile, payload.Tenant.Email),
		CounterpartyTitle: "Customer",
		Counterparty:      pdf.ToParty(payload.Partner.CompanyName, payload.Partner.Address, payload.Partner.Phone, payload.Partner.Mobile, payload.Partner.Email),
		DetailFields: []pdf.PartyField{
			{Label: "Date-no", Value: so.DateNoDisplay},
			{Label: "Order date", Value: so.OrderDate},
			{Label: "Status", Value: so.ProgressStatus},
			{Label: "PIC", Value: so.PicName},
		},
		LineHeaders:   headers,
		LineRows:      rows,
		LineColWidths: []float64{10, 80, 20, 30, 30},
		Totals: []pdf.TotalRow{
			{Label: "Subtotal", Value: pdf.FormatMoney(so.Subtotal, ccy)},
			{Label: "Tax", Value: pdf.FormatMoney(so.TaxTotal, ccy)},
			{Label: "Grand Total", Value: pdf.FormatMoney(so.GrandTotal, ccy), Bold: true},
		},
		Notes: pdf.StrVal(so.Notes),
	}
}

func loadSalesOrderPrintPayload(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (salesOrderPrintPayload, error) {
	so, err := loadSalesOrder(ctx, pool, tenantID, id)
	if err != nil {
		return salesOrderPrintPayload{}, err
	}
	var tenant printParty
	err = pool.QueryRow(ctx, `
		select company_name, address, phone, email
		from public.tenants where id = $1`, tenantID).
		Scan(&tenant.CompanyName, &tenant.Address, &tenant.Phone, &tenant.Email)
	if err != nil {
		return salesOrderPrintPayload{}, err
	}
	var partner printParty
	err = pool.QueryRow(ctx, `
		select company_name, address, phone, mobile, email
		from public.inv_partners
		where id = $1 and tenant_id = $2 and deleted_at is null`,
		so.PartnerID, tenantID).
		Scan(&partner.CompanyName, &partner.Address, &partner.Phone, &partner.Mobile, &partner.Email)
	if err != nil {
		return salesOrderPrintPayload{}, err
	}
	return salesOrderPrintPayload{Tenant: tenant, Partner: partner, SalesOrder: so}, nil
}

func getSalesOrderPDF(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		payload, err := loadSalesOrderPrintPayload(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Sales order not found.", "ERR_NOT_FOUND")
			return
		}
		in := soToPDF(payload)
		in.Chrome = branding.LoadPDFChrome(r.Context(), pool, tu.TenantID)
		data, err := pdf.RenderGenericDocumentPDF(in)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to render PDF.", "ERR_INTERNAL")
			return
		}
		comms.WritePDF(w, fmt.Sprintf("sales-order-%s.pdf", payload.SalesOrder.SalesOrderNo), data)
	}
}

func postSalesOrderSendEmail(pool *pgxpool.Pool) http.HandlerFunc {
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
		payload, err := loadSalesOrderPrintPayload(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Sales order not found.", "ERR_NOT_FOUND")
			return
		}
		in := soToPDF(payload)
		in.Chrome = branding.LoadPDFChrome(r.Context(), pool, tu.TenantID)
		pdfBytes, err := pdf.RenderGenericDocumentPDF(in)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to render PDF.", "ERR_INTERNAL")
			return
		}
		so := payload.SalesOrder
		itemName := ""
		for _, ln := range so.Lines {
			if n := strings.TrimSpace(ln.ItemName); n != "" {
				itemName = n
				break
			}
		}
		comms.HandleDocumentSendEmail(w, r, pool, body, comms.DocumentSendParams{
			DocType:        "sales_order",
			DocID:          id,
			AttachmentName: fmt.Sprintf("sales-order-%s.pdf", so.SalesOrderNo),
			PDFBytes:       pdfBytes,
			TemplateVars: comms.TemplateVars{
				"reference_no":  so.SalesOrderNo,
				"customer_name": payload.Partner.CompanyName,
				"company_name":  payload.Tenant.CompanyName,
				"grand_total":   fmt.Sprintf("%.2f", so.GrandTotal),
				"doc_type":      "Sales Order",
				"item_name":     itemName,
				"doc_date":      so.OrderDate,
			},
		})
	}
}
