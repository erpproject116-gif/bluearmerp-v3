package comms

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/outbox"
)

type documentEmailAttachment struct {
	Name   string `json:"name"`
	Type   string `json:"type"`
	Base64 string `json:"base64"`
}

type documentEmailPayload struct {
	SentMessageID    int64                     `json:"sent_message_id"`
	AttachmentName   string                    `json:"attachment_name"`
	AttachmentBase64 string                    `json:"attachment_base64,omitempty"`
	AttachmentType   string                    `json:"attachment_type,omitempty"`
	Attachments      []documentEmailAttachment `json:"attachments,omitempty"`
	BodyIsHTML       bool                      `json:"body_is_html,omitempty"`
}

// HandleOutboxEvent sends document emails via Gmail when connected, else SMTP fallback.
func HandleOutboxEvent(ctx context.Context, pool *pgxpool.Pool, ev outbox.Event) error {
	if ev.EventType != "document.email" {
		return nil
	}
	var p documentEmailPayload
	if err := json.Unmarshal(ev.Payload, &p); err != nil {
		return err
	}
	if p.SentMessageID <= 0 {
		return fmt.Errorf("document.email: missing sent_message_id")
	}

	sm, err := loadSentMessage(ctx, pool, ev.TenantID, p.SentMessageID)
	if err != nil {
		return err
	}

	htmlBody := composeHTMLBody(sm.BodyText, p.BodyIsHTML)
	attachments, attErr := collectOutboxAttachments(p)
	if attErr != nil {
		errMsg := attErr.Error()
		_ = UpdateSentMessageStatus(ctx, pool, ev.TenantID, sm.ID, "failed", &errMsg)
		return attErr
	}

	gmailCfg := LoadGmailConfig()
	var gmailErr error
	if sm.SentByUserID == nil {
		gmailErr = fmt.Errorf("sender user missing on sent message")
	} else if gmailCfg.StubMode || !gmailCfg.OAuthConfigured() {
		gmailErr = fmt.Errorf("Gmail OAuth not configured on API (set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT on Render and redeploy)")
	} else {
		var msgID, threadID string
		msgID, threadID, gmailErr = SendViaGmail(ctx, pool, gmailCfg, ev.TenantID, *sm.SentByUserID, sm.ToAddrs, sm.CcAddrs, sm.Subject, htmlBody, attachments)
		if gmailErr == nil {
			_ = UpdateSentMessageGmailIDs(ctx, pool, ev.TenantID, sm.ID, msgID, threadID)
			_ = UpdateSentMessageStatus(ctx, pool, ev.TenantID, sm.ID, "sent", nil)
			return nil
		}
		log.Printf("comms outbox: tenant=%d message=%d — Gmail send failed, trying SMTP: %v", ev.TenantID, sm.ID, gmailErr)
	}

	cfg := outbox.LoadSMTPConfig()
	if !cfg.Enabled() {
		errMsg := "SMTP not configured and Gmail send unavailable"
		if gmailErr != nil {
			errMsg = fmt.Sprintf("Gmail unavailable (%v); SMTP not configured", gmailErr)
		}
		_ = UpdateSentMessageStatus(ctx, pool, ev.TenantID, sm.ID, "failed", &errMsg)
		log.Printf("comms outbox: tenant=%d message=%d — no delivery channel: %s", ev.TenantID, sm.ID, errMsg)
		return nil
	}

	var smtpAttachments []outbox.EmailAttachment
	for _, att := range attachments {
		smtpAttachments = append(smtpAttachments, outbox.EmailAttachment{
			Filename:    att.Filename,
			ContentType: att.ContentType,
			Data:        att.Data,
		})
	}

	sendErr := outbox.SendEmailMIME(cfg, sm.ToAddrs, sm.CcAddrs, sm.Subject, htmlBody, smtpAttachments)
	if sendErr != nil {
		errMsg := sendErr.Error()
		_ = UpdateSentMessageStatus(ctx, pool, ev.TenantID, sm.ID, "failed", &errMsg)
		return sendErr
	}
	_ = UpdateSentMessageStatus(ctx, pool, ev.TenantID, sm.ID, "sent", nil)
	return nil
}

// DrainOutbox processes pending document email outbox events.
func DrainOutbox(ctx context.Context, pool *pgxpool.Pool) error {
	for {
		n, err := outbox.DrainPending(ctx, pool, HandleOutboxEvent)
		if err != nil {
			return err
		}
		if n == 0 {
			return nil
		}
	}
}

func textToHTML(text string) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return "<p></p>"
	}
	text = strings.ReplaceAll(text, "&", "&amp;")
	text = strings.ReplaceAll(text, "<", "&lt;")
	text = strings.ReplaceAll(text, ">", "&gt;")
	text = strings.ReplaceAll(text, "\n", "<br>")
	return "<html><body><p>" + text + "</p></body></html>"
}

func composeHTMLBody(body string, isHTML bool) string {
	body = strings.TrimSpace(body)
	if body == "" {
		return "<html><body><p></p></body></html>"
	}
	if isHTML || looksLikeHTML(body) {
		if strings.Contains(strings.ToLower(body), "<html") {
			return body
		}
		return "<html><body>" + body + "</body></html>"
	}
	return textToHTML(body)
}

func collectOutboxAttachments(p documentEmailPayload) ([]gmailAttachment, error) {
	var attachments []gmailAttachment
	seen := map[string]bool{}
	add := func(name, ct, b64 string) error {
		if strings.TrimSpace(b64) == "" {
			return nil
		}
		data, decErr := base64.StdEncoding.DecodeString(strings.TrimSpace(b64))
		if decErr != nil {
			return decErr
		}
		if name == "" {
			name = "attachment"
		}
		if ct == "" {
			ct = "application/octet-stream"
		}
		key := name + "|" + fmt.Sprintf("%d", len(data))
		if seen[key] {
			return nil
		}
		seen[key] = true
		attachments = append(attachments, gmailAttachment{
			Filename:    name,
			ContentType: ct,
			Data:        data,
		})
		return nil
	}
	for _, a := range p.Attachments {
		if err := add(a.Name, a.Type, a.Base64); err != nil {
			return nil, err
		}
	}
	if len(p.Attachments) == 0 && p.AttachmentBase64 != "" {
		if err := add(p.AttachmentName, p.AttachmentType, p.AttachmentBase64); err != nil {
			return nil, err
		}
	}
	return attachments, nil
}
