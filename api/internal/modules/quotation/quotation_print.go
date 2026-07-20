package quotation

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/branding"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/comms"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/pdf"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type printParty struct {
	CompanyName string  `json:"company_name"`
	Address     *string `json:"address,omitempty"`
	Phone       *string `json:"phone,omitempty"`
	Mobile      *string `json:"mobile,omitempty"`
	Email       *string `json:"email,omitempty"`
}

type quotationPrintPayload struct {
	Tenant    printParty `json:"tenant"`
	Partner   printParty `json:"partner"`
	Quotation Quotation  `json:"quotation"`
}

func loadQuotationPrintPayload(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (quotationPrintPayload, pdf.QuotationPrintInput, error) {
	q, err := loadQuotation(ctx, pool, tenantID, id)
	if err != nil {
		return quotationPrintPayload{}, pdf.QuotationPrintInput{}, err
	}

	var tenant printParty
	err = pool.QueryRow(ctx, `
		select company_name, address, phone, email
		from public.tenants where id = $1`, tenantID).
		Scan(&tenant.CompanyName, &tenant.Address, &tenant.Phone, &tenant.Email)
	if err != nil {
		return quotationPrintPayload{}, pdf.QuotationPrintInput{}, err
	}

	var partner printParty
	err = pool.QueryRow(ctx, `
		select company_name, address, phone, mobile, email
		from public.inv_partners
		where id = $1 and tenant_id = $2 and deleted_at is null`,
		q.PartnerID, tenantID).
		Scan(&partner.CompanyName, &partner.Address, &partner.Phone, &partner.Mobile, &partner.Email)
	if err != nil {
		return quotationPrintPayload{}, pdf.QuotationPrintInput{}, err
	}

	payload := quotationPrintPayload{Tenant: tenant, Partner: partner, Quotation: q}
	return payload, toPDFPrintInput(payload), nil
}

func toPDFPrintInput(p quotationPrintPayload) pdf.QuotationPrintInput {
	q := p.Quotation
	var lines []pdf.QuotationLine
	for _, ln := range q.Lines {
		desc := ""
		if ln.Description != nil {
			desc = *ln.Description
		}
		lines = append(lines, pdf.QuotationLine{
			LineNo:      ln.LineNo,
			ItemCode:    ln.ItemCode,
			ItemName:    ln.ItemName,
			Description: desc,
			Qty:         ln.Qty,
			UnitVatInc:  ln.UnitVatInc,
			LineTotal:   ln.LineTotal,
		})
	}
	validUntil := ""
	if q.ValidUntil != nil {
		validUntil = *q.ValidUntil
	}
	paymentTerms := ""
	if q.PaymentTerms != nil {
		paymentTerms = *q.PaymentTerms
	}
	notes := ""
	if q.Notes != nil {
		notes = *q.Notes
	}
	return pdf.QuotationPrintInput{
		Tenant: pdf.Party{
			CompanyName: p.Tenant.CompanyName,
			Address:     strPtr(p.Tenant.Address),
			Phone:       strPtr(p.Tenant.Phone),
			Email:       strPtr(p.Tenant.Email),
		},
		Partner: pdf.Party{
			CompanyName: p.Partner.CompanyName,
			Address:     strPtr(p.Partner.Address),
			Phone:       strPtr(p.Partner.Phone),
			Mobile:      strPtr(p.Partner.Mobile),
			Email:       strPtr(p.Partner.Email),
		},
		Quotation: pdf.QuotationDoc{
			ReferenceNo:    q.ReferenceNo,
			DateNoDisplay:  q.DateNoDisplay,
			OrderDate:      q.OrderDate,
			TaxTypeName:    q.TaxTypeName,
			CurrencyCode:   q.CurrencyCode,
			LocationName:   q.LocationName,
			PicName:        q.PicName,
			ProgressStatus: q.ProgressStatus,
			ValidUntil:     validUntil,
			PaymentTerms:   paymentTerms,
			Notes:          notes,
			Subtotal:       q.Subtotal,
			TaxTotal:       q.TaxTotal,
			GrandTotal:     q.GrandTotal,
			Lines:          lines,
		},
	}
}

func strPtr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func getQuotationPrint(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}

		payload, _, err := loadQuotationPrintPayload(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Quotation not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, payload, "OK")
	}
}

func getQuotationPDF(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}

		_, pdfIn, err := loadQuotationPrintPayload(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Quotation not found.", "ERR_NOT_FOUND")
			return
		}
		pdfIn.Chrome = branding.LoadPDFChrome(r.Context(), pool, tu.TenantID)
		data, err := pdf.RenderQuotationPDF(pdfIn)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to render PDF.", "ERR_INTERNAL")
			return
		}
		filename := fmt.Sprintf("quotation-%s.pdf", pdfIn.Quotation.ReferenceNo)
		w.Header().Set("Content-Type", "application/pdf")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename=%q`, filename))
		w.Write(data)
	}
}

type sendQuotationEmailBody struct {
	ToAddrs  []string `json:"to_addrs"`
	CcAddrs  []string `json:"cc_addrs"`
	Subject  string   `json:"subject"`
	BodyText string   `json:"body_text"`
}

func postQuotationSendEmail(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body sendQuotationEmailBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		to := body.ToAddrs
		if len(to) == 0 {
			response.Validation(w, map[string]string{"to_addrs": "At least one recipient is required."})
			return
		}

		payload, pdfIn, err := loadQuotationPrintPayload(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Quotation not found.", "ERR_NOT_FOUND")
			return
		}

		pdfIn.Chrome = branding.LoadPDFChrome(r.Context(), pool, tu.TenantID)
		pdfBytes, err := pdf.RenderQuotationPDF(pdfIn)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to render PDF.", "ERR_INTERNAL")
			return
		}

		userID := tu.AppUserID
		sent, err := comms.SendDocumentEmail(r.Context(), pool, comms.SendDocumentEmailParams{
			TenantID:       tu.TenantID,
			SentByUserID:   &userID,
			DocType:        "quotation",
			DocID:          id,
			ToAddrs:        to,
			CcAddrs:        body.CcAddrs,
			Subject:        body.Subject,
			BodyText:       body.BodyText,
			AttachmentName: fmt.Sprintf("quotation-%s.pdf", pdfIn.Quotation.ReferenceNo),
			AttachmentData: pdfBytes,
			AttachmentType: "application/pdf",
			TemplateVars: comms.TemplateVars{
				"reference_no":  payload.Quotation.ReferenceNo,
				"customer_name": payload.Partner.CompanyName,
				"company_name":  payload.Tenant.CompanyName,
				"grand_total":   fmt.Sprintf("%.2f", payload.Quotation.GrandTotal),
				"doc_type":      "Quotation",
			},
		})
		if err != nil {
			response.Err(w, http.StatusInternalServerError, err.Error(), "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "quotation.send_email", "quo_quotation", &id, nil, map[string]any{
			"sent_message_id": sent.ID,
			"to_addrs":        sent.ToAddrs,
		})
		response.OK(w, sent, "Email queued.")
	}
}

func patchQuotationProgressStatus(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body struct {
			ProgressStatus string `json:"progress_status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.ProgressStatus != "" && body.ProgressStatus != "unconfirmed" &&
			body.ProgressStatus != "in_progress" && body.ProgressStatus != "completed" {
			response.Validation(w, map[string]string{"progress_status": "Must be unconfirmed, in_progress, or completed."})
			return
		}
		status := defaultProgress(body.ProgressStatus)

		policy, err := processpolicy.Load(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load process policies.", "ERR_INTERNAL")
			return
		}
		if v := processpolicy.ValidateAttachmentRequired(r.Context(), pool, policy, processpolicy.DocQuotation, status, id); v != nil {
			response.Validation(w, v)
			return
		}

		tag, err := pool.Exec(r.Context(), `
			update public.quo_quotations
			set progress_status = $1, updated_at = now()
			where id = $2 and tenant_id = $3 and deleted_at is null`,
			status, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Quotation not found.", "ERR_NOT_FOUND")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "quotation.progress_status", "quo_quotation", &id, nil, body)
		q, err := loadQuotation(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load quotation.", "ERR_INTERNAL")
			return
		}
		response.OK(w, q, "Updated.")
	}
}
