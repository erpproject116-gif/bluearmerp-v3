package comms

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/outbox"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type reportEmailAttachment struct {
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	DataBase64  string `json:"data_base64"`
}

type reportEmailBody struct {
	ToAddrs     []string                `json:"to_addrs"`
	CcAddrs     []string                `json:"cc_addrs"`
	Subject     string                  `json:"subject"`
	BodyHTML    string                  `json:"body_html"`
	Attachments []reportEmailAttachment `json:"attachments"`
}

func sendReportEmail(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		_, _ = auth.FromContext(r.Context())
		var body reportEmailBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		to := trimReportAddrs(body.ToAddrs)
		if len(to) == 0 {
			response.Validation(w, map[string]string{"to_addrs": "At least one recipient is required."})
			return
		}
		subject := strings.TrimSpace(body.Subject)
		if subject == "" {
			response.Validation(w, map[string]string{"subject": "Subject is required."})
			return
		}
		htmlBody := strings.TrimSpace(body.BodyHTML)
		if htmlBody == "" {
			htmlBody = "<p>Please find the report attached.</p>"
		}

		var atts []outbox.EmailAttachment
		totalBytes := 0
		for _, a := range body.Attachments {
			raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(a.DataBase64))
			if err != nil || len(raw) == 0 {
				continue
			}
			totalBytes += len(raw)
			if totalBytes > 20*1024*1024 {
				response.Validation(w, map[string]string{"attachments": "Attachments too large (max 20 MB total)."})
				return
			}
			name := strings.TrimSpace(a.Filename)
			if name == "" {
				name = "report.csv"
			}
			ct := strings.TrimSpace(a.ContentType)
			if ct == "" {
				ct = "application/octet-stream"
			}
			atts = append(atts, outbox.EmailAttachment{Filename: name, ContentType: ct, Data: raw})
		}

		smtpCfg := outbox.LoadSMTPConfig()
		if !smtpCfg.Enabled() {
			response.Err(w, http.StatusServiceUnavailable, "Email is not configured (set SMTP_HOST and SMTP_FROM).", "ERR_SMTP")
			return
		}
		if err := outbox.SendEmailMIME(smtpCfg, to, trimReportAddrs(body.CcAddrs), subject, htmlBody, atts); err != nil {
			response.Err(w, http.StatusBadGateway, "Failed to send email: "+err.Error(), "ERR_EMAIL")
			return
		}
		_ = pool
		response.OK(w, map[string]any{"sent": true}, "Report emailed.")
	}
}

func trimReportAddrs(in []string) []string {
	var out []string
	for _, a := range in {
		a = strings.TrimSpace(a)
		if a != "" {
			out = append(out, a)
		}
	}
	return out
}
