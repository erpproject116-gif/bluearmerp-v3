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

type documentEmailPayload struct {
	SentMessageID    int64  `json:"sent_message_id"`
	AttachmentName   string `json:"attachment_name"`
	AttachmentBase64 string `json:"attachment_base64,omitempty"`
	AttachmentType   string `json:"attachment_type,omitempty"`
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

	htmlBody := textToHTML(sm.BodyText)
	var attachments []gmailAttachment
	if p.AttachmentBase64 != "" {
		data, decErr := base64.StdEncoding.DecodeString(strings.TrimSpace(p.AttachmentBase64))
		if decErr != nil {
			errMsg := decErr.Error()
			_ = UpdateSentMessageStatus(ctx, pool, ev.TenantID, sm.ID, "failed", &errMsg)
			return decErr
		}
		name := p.AttachmentName
		if name == "" {
			name = "document.pdf"
		}
		ct := p.AttachmentType
		if ct == "" {
			ct = "application/pdf"
		}
		attachments = append(attachments, gmailAttachment{
			Filename:    name,
			ContentType: ct,
			Data:        data,
		})
	}

	gmailCfg := LoadGmailConfig()
	if sm.SentByUserID != nil && !gmailCfg.StubMode && gmailCfg.OAuthConfigured() {
		msgID, threadID, gmailErr := SendViaGmail(ctx, pool, gmailCfg, ev.TenantID, *sm.SentByUserID, sm.ToAddrs, sm.CcAddrs, sm.Subject, htmlBody, attachments)
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
		_ = UpdateSentMessageStatus(ctx, pool, ev.TenantID, sm.ID, "failed", &errMsg)
		log.Printf("comms outbox: tenant=%d message=%d — no delivery channel", ev.TenantID, sm.ID)
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
