package comms

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// SendEmailBody is the JSON body for document send-email endpoints.
type SendEmailBody struct {
	ToAddrs  []string `json:"to_addrs"`
	CcAddrs  []string `json:"cc_addrs"`
	Subject  string   `json:"subject"`
	BodyText string   `json:"body_text"`
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

	userID := tu.AppUserID
	sent, err := SendDocumentEmail(r.Context(), pool, SendDocumentEmailParams{
		TenantID:       tu.TenantID,
		SentByUserID:   &userID,
		DocType:        p.DocType,
		DocID:          p.DocID,
		ToAddrs:        body.ToAddrs,
		CcAddrs:        body.CcAddrs,
		Subject:        body.Subject,
		BodyText:       body.BodyText,
		AttachmentName: p.AttachmentName,
		AttachmentData: p.PDFBytes,
		AttachmentType: "application/pdf",
		TemplateVars:   p.TemplateVars,
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
