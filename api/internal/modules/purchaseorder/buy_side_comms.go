package purchaseorder

import (
	"context"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/comms"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/pdf"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func poToPDF(payload purchaseOrderPrintPayload) pdf.GenericDocumentInput {
	po := payload.PurchaseOrder
	ccy := po.CurrencyCode
	var lineData []struct {
		LineNo   int
		ItemCode string
		ItemName string
		Qty      float64
		UnitAmt  float64
		LineAmt  float64
	}
	for _, ln := range po.Lines {
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
		DocTitle:          "Purchase Order",
		DocSubtitle:       po.PurchaseOrderNo,
		Tenant:            pdf.ToParty(payload.Tenant.CompanyName, payload.Tenant.Address, payload.Tenant.Phone, nil, payload.Tenant.Email),
		CounterpartyTitle: "Vendor",
		Counterparty:      pdf.ToParty(payload.Partner.CompanyName, payload.Partner.Address, payload.Partner.Phone, payload.Partner.Mobile, payload.Partner.Email),
		DetailFields: []pdf.PartyField{
			{Label: "Date-no", Value: po.DateNoDisplay},
			{Label: "Order date", Value: po.OrderDate},
			{Label: "Status", Value: po.Status},
			{Label: "PIC", Value: po.PicName},
		},
		LineHeaders:   headers,
		LineRows:      rows,
		LineColWidths: []float64{10, 80, 20, 30, 30},
		Totals: []pdf.TotalRow{
			{Label: "Subtotal", Value: pdf.FormatMoney(po.Subtotal, ccy)},
			{Label: "Tax", Value: pdf.FormatMoney(po.TaxTotal, ccy)},
			{Label: "Grand Total", Value: pdf.FormatMoney(po.GrandTotal, ccy), Bold: true},
		},
		Notes: pdf.StrVal(po.Notes),
	}
}

func rfqToPDF(payload rfqPrintPayload) pdf.GenericDocumentInput {
	rfq := payload.RFQ
	var rows [][]string
	for _, ln := range rfq.Lines {
		rows = append(rows, []string{
			fmt.Sprintf("%d", ln.LineNo),
			ln.ItemCode + " — " + ln.ItemName,
			pdf.FmtQty(ln.Qty),
			pdf.StrVal(ln.Notes),
		})
	}
	return pdf.GenericDocumentInput{
		DocTitle:    "Request for Quotation",
		DocSubtitle: rfq.RfqNo,
		Tenant:      pdf.ToParty(payload.Tenant.CompanyName, payload.Tenant.Address, payload.Tenant.Phone, nil, payload.Tenant.Email),
		DetailFields: []pdf.PartyField{
			{Label: "RFQ date", Value: rfq.RfqDate},
			{Label: "Status", Value: rfq.Status},
		},
		LineHeaders:   []string{"#", "Item", "Qty", "Notes"},
		LineRows:      rows,
		LineColWidths: []float64{10, 90, 25, 45},
		Notes:         pdf.StrVal(rfq.Notes),
	}
}

func sqToPDF(payload supplierQuotationPrintPayload) pdf.GenericDocumentInput {
	sq := payload.SupplierQuotation
	var lineData []struct {
		LineNo   int
		ItemCode string
		ItemName string
		Qty      float64
		UnitAmt  float64
		LineAmt  float64
	}
	for _, ln := range sq.Lines {
		lineData = append(lineData, struct {
			LineNo   int
			ItemCode string
			ItemName string
			Qty      float64
			UnitAmt  float64
			LineAmt  float64
		}{ln.LineNo, ln.ItemCode, ln.ItemName, ln.Qty, ln.UnitPrice, ln.LineTotal})
	}
	headers, rows := pdf.StandardLineTable("", lineData)
	return pdf.GenericDocumentInput{
		DocTitle:          "Supplier Quotation",
		DocSubtitle:       sq.QuoteNo,
		Tenant:            pdf.ToParty(payload.Tenant.CompanyName, payload.Tenant.Address, payload.Tenant.Phone, nil, payload.Tenant.Email),
		CounterpartyTitle: "Vendor",
		Counterparty:      pdf.ToParty(payload.Partner.CompanyName, payload.Partner.Address, payload.Partner.Phone, payload.Partner.Mobile, payload.Partner.Email),
		DetailFields: []pdf.PartyField{
			{Label: "Quote date", Value: sq.QuoteDate},
			{Label: "Valid until", Value: pdf.StrVal(sq.ValidUntil)},
			{Label: "Status", Value: sq.Status},
		},
		LineHeaders:   headers,
		LineRows:      rows,
		LineColWidths: []float64{10, 80, 20, 30, 30},
		Totals: []pdf.TotalRow{
			{Label: "Grand Total", Value: pdf.FormatMoney(sq.GrandTotal, ""), Bold: true},
		},
		Notes: pdf.StrVal(sq.Notes),
	}
}

func getPurchaseOrderPDF(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		payload, err := loadPurchaseOrderPrintPayload(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Purchase order not found.", "ERR_NOT_FOUND")
			return
		}
		data, err := pdf.RenderGenericDocumentPDF(poToPDF(payload))
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to render PDF.", "ERR_INTERNAL")
			return
		}
		comms.WritePDF(w, fmt.Sprintf("purchase-order-%s.pdf", payload.PurchaseOrder.PurchaseOrderNo), data)
	}
}

func postPurchaseOrderSendEmail(pool *pgxpool.Pool) http.HandlerFunc {
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
		payload, err := loadPurchaseOrderPrintPayload(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Purchase order not found.", "ERR_NOT_FOUND")
			return
		}
		pdfBytes, err := pdf.RenderGenericDocumentPDF(poToPDF(payload))
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to render PDF.", "ERR_INTERNAL")
			return
		}
		po := payload.PurchaseOrder
		comms.HandleDocumentSendEmail(w, r, pool, body, comms.DocumentSendParams{
			DocType:        "purchase_order",
			DocID:          id,
			AttachmentName: fmt.Sprintf("purchase-order-%s.pdf", po.PurchaseOrderNo),
			PDFBytes:       pdfBytes,
			TemplateVars: comms.TemplateVars{
				"reference_no":  po.PurchaseOrderNo,
				"customer_name": payload.Partner.CompanyName,
				"company_name":  payload.Tenant.CompanyName,
				"grand_total":   fmt.Sprintf("%.2f", po.GrandTotal),
				"doc_type":      "Purchase Order",
			},
		})
	}
}

func getRFQPDF(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		payload, err := loadRFQPrintPayload(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "RFQ not found.", "ERR_NOT_FOUND")
			return
		}
		data, err := pdf.RenderGenericDocumentPDF(rfqToPDF(payload))
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to render PDF.", "ERR_INTERNAL")
			return
		}
		comms.WritePDF(w, fmt.Sprintf("rfq-%s.pdf", payload.RFQ.RfqNo), data)
	}
}

func postRFQSendEmail(pool *pgxpool.Pool) http.HandlerFunc {
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
		payload, err := loadRFQPrintPayload(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "RFQ not found.", "ERR_NOT_FOUND")
			return
		}
		pdfBytes, err := pdf.RenderGenericDocumentPDF(rfqToPDF(payload))
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to render PDF.", "ERR_INTERNAL")
			return
		}
		rfq := payload.RFQ
		comms.HandleDocumentSendEmail(w, r, pool, body, comms.DocumentSendParams{
			DocType:        "rfq",
			DocID:          id,
			AttachmentName: fmt.Sprintf("rfq-%s.pdf", rfq.RfqNo),
			PDFBytes:       pdfBytes,
			TemplateVars: comms.TemplateVars{
				"reference_no": rfq.RfqNo,
				"company_name": payload.Tenant.CompanyName,
				"doc_type":     "RFQ",
			},
		})
	}
}

func getSupplierQuotationPDF(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		payload, err := loadSupplierQuotationPrintPayload(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Supplier quotation not found.", "ERR_NOT_FOUND")
			return
		}
		data, err := pdf.RenderGenericDocumentPDF(sqToPDF(payload))
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to render PDF.", "ERR_INTERNAL")
			return
		}
		comms.WritePDF(w, fmt.Sprintf("supplier-quotation-%s.pdf", payload.SupplierQuotation.QuoteNo), data)
	}
}

func postSupplierQuotationSendEmail(pool *pgxpool.Pool) http.HandlerFunc {
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
		payload, err := loadSupplierQuotationPrintPayload(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Supplier quotation not found.", "ERR_NOT_FOUND")
			return
		}
		pdfBytes, err := pdf.RenderGenericDocumentPDF(sqToPDF(payload))
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to render PDF.", "ERR_INTERNAL")
			return
		}
		sq := payload.SupplierQuotation
		comms.HandleDocumentSendEmail(w, r, pool, body, comms.DocumentSendParams{
			DocType:        "supplier_quotation",
			DocID:          id,
			AttachmentName: fmt.Sprintf("supplier-quotation-%s.pdf", sq.QuoteNo),
			PDFBytes:       pdfBytes,
			TemplateVars: comms.TemplateVars{
				"reference_no":  sq.QuoteNo,
				"customer_name": payload.Partner.CompanyName,
				"company_name":  payload.Tenant.CompanyName,
				"grand_total":   fmt.Sprintf("%.2f", sq.GrandTotal),
				"doc_type":      "Supplier Quotation",
			},
		})
	}
}

func loadPurchaseOrderPrintPayload(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (purchaseOrderPrintPayload, error) {
	po, err := loadPurchaseOrder(ctx, pool, tenantID, id)
	if err != nil {
		return purchaseOrderPrintPayload{}, err
	}
	tenant, err := loadTenantParty(ctx, pool, tenantID)
	if err != nil {
		return purchaseOrderPrintPayload{}, err
	}
	partner := buyPrintParty{CompanyName: po.PartnerName}
	if po.PartnerID != nil {
		partner = loadPartnerParty(ctx, pool, tenantID, *po.PartnerID, po.PartnerName)
	}
	return purchaseOrderPrintPayload{Tenant: tenant, Partner: partner, PurchaseOrder: po}, nil
}

func loadRFQPrintPayload(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (rfqPrintPayload, error) {
	rfq, err := loadRFQ(ctx, pool, tenantID, id)
	if err != nil {
		return rfqPrintPayload{}, err
	}
	tenant, err := loadTenantParty(ctx, pool, tenantID)
	if err != nil {
		return rfqPrintPayload{}, err
	}
	return rfqPrintPayload{Tenant: tenant, RFQ: rfq}, nil
}

func loadSupplierQuotationPrintPayload(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (supplierQuotationPrintPayload, error) {
	sq, err := loadSupplierQuotation(ctx, pool, tenantID, id)
	if err != nil {
		return supplierQuotationPrintPayload{}, err
	}
	tenant, err := loadTenantParty(ctx, pool, tenantID)
	if err != nil {
		return supplierQuotationPrintPayload{}, err
	}
	partner := loadPartnerParty(ctx, pool, tenantID, sq.PartnerID, "")
	return supplierQuotationPrintPayload{Tenant: tenant, Partner: partner, SupplierQuotation: sq}, nil
}
