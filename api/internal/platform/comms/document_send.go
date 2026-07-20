package comms

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// MaxEmailAttachmentsBytes is the combined attachment size limit (25 MiB).
const MaxEmailAttachmentsBytes = 25 * 1024 * 1024

// EmailAttachmentIn is a client-supplied file attachment (base64).
type EmailAttachmentIn struct {
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	DataBase64  string `json:"data_base64"`
}

// SendEmailBody is the JSON body for document send-email endpoints.
type SendEmailBody struct {
	ToAddrs          []string            `json:"to_addrs"`
	CcAddrs          []string            `json:"cc_addrs"`
	Subject          string              `json:"subject"`
	BodyText         string              `json:"body_text"`
	BodyHTML         string              `json:"body_html"`
	IncludeSignature *bool               `json:"include_signature"`
	Attachments      []EmailAttachmentIn `json:"attachments"`
}

// DocumentSendParams configures a send-email HTTP handler.
type DocumentSendParams struct {
	DocType        string
	DocID          int64
	AttachmentName string
	PDFBytes       []byte
	TemplateVars   TemplateVars
}

// HandleDocumentSendEmail is the shared POST handler body for document email sends.
func HandleDocumentSendEmail(
	w http.ResponseWriter,
	r *http.Request,
	pool *pgxpool.Pool,
	body SendEmailBody,
	p DocumentSendParams,
) {
	tu, _ := auth.FromContext(r.Context())
	if len(body.ToAddrs) == 0 {
		response.Validation(w, map[string]string{"to_addrs": "At least one recipient is required."})
		return
	}

	extras, totalExtra, err := decodeClientAttachments(body.Attachments)
	if err != nil {
		response.Validation(w, map[string]string{"attachments": err.Error()})
		return
	}
	if len(p.PDFBytes)+totalExtra > MaxEmailAttachmentsBytes {
		response.Validation(w, map[string]string{
			"attachments": fmt.Sprintf("Attachments exceed %d MB combined limit.", MaxEmailAttachmentsBytes/(1024*1024)),
		})
		return
	}

	bodyHTML, bodyIsHTML := ResolveComposeBody(r.Context(), pool, tu.TenantID, tu.AppUserID, body)

	userID := tu.AppUserID
	sent, err := SendDocumentEmail(r.Context(), pool, SendDocumentEmailParams{
		TenantID:         tu.TenantID,
		SentByUserID:     &userID,
		DocType:          p.DocType,
		DocID:            p.DocID,
		ToAddrs:          body.ToAddrs,
		CcAddrs:          body.CcAddrs,
		Subject:          body.Subject,
		BodyText:         bodyHTML,
		BodyIsHTML:       bodyIsHTML,
		AttachmentName:   p.AttachmentName,
		AttachmentData:   p.PDFBytes,
		AttachmentType:   "application/pdf",
		ExtraAttachments: extras,
		TemplateVars:     p.TemplateVars,
	})
	if err != nil {
		response.Err(w, http.StatusInternalServerError, err.Error(), "ERR_INTERNAL")
		return
	}
	response.OK(w, sent, "Email queued.")
}

// DecodeSendEmailBody parses the request JSON for send-email endpoints.
func DecodeSendEmailBody(r *http.Request) (SendEmailBody, error) {
	var body SendEmailBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		return body, fmt.Errorf("invalid JSON")
	}
	return body, nil
}

// WritePDF writes a PDF attachment response.
func WritePDF(w http.ResponseWriter, filename string, data []byte) {
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename=%q`, filename))
	w.Write(data)
}

func DecodeClientAttachments(in []EmailAttachmentIn) ([]EmailFileAttachment, int, error) {
	return decodeClientAttachments(in)
}

func ResolveComposeBody(ctx context.Context, pool *pgxpool.Pool, tenantID, userID int64, body SendEmailBody) (string, bool) {
	return resolveComposeBody(ctx, pool, tenantID, userID, body)
}

func decodeClientAttachments(in []EmailAttachmentIn) ([]EmailFileAttachment, int, error) {
	var out []EmailFileAttachment
	total := 0
	for i, a := range in {
		name := strings.TrimSpace(a.Filename)
		if name == "" {
			return nil, 0, fmt.Errorf("attachment %d: filename required", i+1)
		}
		raw := strings.TrimSpace(a.DataBase64)
		if raw == "" {
			continue
		}
		data, err := base64.StdEncoding.DecodeString(raw)
		if err != nil {
			data, err = base64.RawStdEncoding.DecodeString(raw)
			if err != nil {
				return nil, 0, fmt.Errorf("attachment %q: invalid base64", name)
			}
		}
		if len(data) == 0 {
			continue
		}
		total += len(data)
		if total > MaxEmailAttachmentsBytes {
			return nil, 0, fmt.Errorf("attachments exceed %d MB combined limit", MaxEmailAttachmentsBytes/(1024*1024))
		}
		ct := strings.TrimSpace(a.ContentType)
		if ct == "" {
			ct = "application/octet-stream"
		}
		out = append(out, EmailFileAttachment{
			Filename:    name,
			ContentType: ct,
			Data:        data,
		})
	}
	return out, total, nil
}

func resolveComposeBody(ctx context.Context, pool *pgxpool.Pool, tenantID, userID int64, body SendEmailBody) (string, bool) {
	html := strings.TrimSpace(body.BodyHTML)
	text := strings.TrimSpace(body.BodyText)
	includeSig := true
	if body.IncludeSignature != nil {
		includeSig = *body.IncludeSignature
	}

	var composed string
	isHTML := false
	if html != "" {
		composed = html
		isHTML = true
	} else if text != "" {
		if looksLikeHTML(text) {
			composed = text
			isHTML = true
		} else {
			composed = text
			isHTML = false
		}
	}

	if includeSig && userID > 0 {
		sig, err := loadEmailSignature(ctx, pool, tenantID, userID)
		if err == nil && strings.TrimSpace(sig.SignatureHTML) != "" {
			sigHTML := strings.TrimSpace(sig.SignatureHTML)
			if !isHTML {
				composed = strings.ReplaceAll(composed, "&", "&amp;")
				composed = strings.ReplaceAll(composed, "<", "&lt;")
				composed = strings.ReplaceAll(composed, ">", "&gt;")
				composed = strings.ReplaceAll(composed, "\n", "<br>")
				composed = "<p>" + composed + "</p>"
				isHTML = true
			}
			composed = composed + `<div class="email-signature" style="margin-top:1.25em;padding-top:0.75em;border-top:1px solid #e2e8f0">` + sigHTML + `</div>`
		}
	}
	return composed, isHTML
}

func looksLikeHTML(s string) bool {
	s = strings.TrimSpace(s)
	return strings.Contains(s, "<") && strings.Contains(s, ">")
}
