package comms

import (
	"context"
	"encoding/base64"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/outbox"
)

// TemplateVars are substituted into email templates ({{key}}).
type TemplateVars map[string]string

// SendDocumentEmailParams configures a document email send.
type SendDocumentEmailParams struct {
	TenantID       int64
	SentByUserID   *int64
	DocType        string
	DocID          int64
	ToAddrs        []string
	CcAddrs        []string
	Subject        string
	BodyText       string
	AttachmentName string
	AttachmentData []byte
	AttachmentType string
	TemplateVars   TemplateVars
}

// SendDocumentEmail logs the send, enqueues outbox delivery, and drains pending events.
func SendDocumentEmail(ctx context.Context, pool *pgxpool.Pool, p SendDocumentEmailParams) (SentMessage, error) {
	to := trimAddrs(p.ToAddrs)
	if len(to) == 0 {
		return SentMessage{}, fmt.Errorf("at least one recipient is required")
	}
	cc := trimAddrs(p.CcAddrs)

	subject := strings.TrimSpace(p.Subject)
	body := strings.TrimSpace(p.BodyText)
	if subject == "" || body == "" {
		tplSubject, tplBody, err := loadEmailTemplate(ctx, pool, p.TenantID, p.DocType)
		if err != nil {
			return SentMessage{}, err
		}
		if subject == "" {
			subject = applyTemplate(tplSubject, p.TemplateVars)
		}
		if body == "" {
			body = applyTemplate(tplBody, p.TemplateVars)
		}
	}
	if subject == "" {
		subject = fmt.Sprintf("%s #%d", p.DocType, p.DocID)
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return SentMessage{}, err
	}
	defer tx.Rollback(ctx)

	sentID, err := InsertSentMessageTx(ctx, tx, InsertSentMessageParams{
		TenantID:     p.TenantID,
		Channel:      "email",
		DocType:      p.DocType,
		DocID:        p.DocID,
		ToAddrs:      to,
		CcAddrs:      cc,
		Subject:      subject,
		BodyText:     body,
		SentByUserID: p.SentByUserID,
	})
	if err != nil {
		return SentMessage{}, err
	}
	if err := InsertThreadLinkTx(ctx, tx, sentID, p.DocType, p.DocID); err != nil {
		return SentMessage{}, err
	}

	payload := documentEmailPayload{
		SentMessageID:  sentID,
		AttachmentName: p.AttachmentName,
		AttachmentType: p.AttachmentType,
	}
	if len(p.AttachmentData) > 0 {
		payload.AttachmentBase64 = base64.StdEncoding.EncodeToString(p.AttachmentData)
	}
	key := fmt.Sprintf("document.email:%s:%d:%d", p.DocType, p.DocID, sentID)
	if err := outbox.EnqueueTx(ctx, tx, p.TenantID, "document.email", key, payload); err != nil {
		return SentMessage{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return SentMessage{}, err
	}

	_ = DrainOutbox(ctx, pool)
	sm, err := loadSentMessage(ctx, pool, p.TenantID, sentID)
	if err != nil {
		return SentMessage{}, err
	}
	if sm.Status == "failed" {
		msg := "Email delivery failed"
		if sm.ErrorMessage != nil && strings.TrimSpace(*sm.ErrorMessage) != "" {
			msg = strings.TrimSpace(*sm.ErrorMessage)
		}
		return sm, fmt.Errorf("%s", msg)
	}
	if sm.Status == "pending" {
		return sm, fmt.Errorf("email queued but not delivered yet (check SMTP/Gmail configuration)")
	}
	return sm, nil
}

func loadEmailTemplate(ctx context.Context, pool *pgxpool.Pool, tenantID int64, docType string) (subject, body string, err error) {
	err = pool.QueryRow(ctx, `
		select subject_tpl, body_tpl
		from public.com_email_templates
		where tenant_id = $1 and doc_type = $2`, tenantID, docType).Scan(&subject, &body)
	if err == pgx.ErrNoRows {
		return "", "", nil
	}
	return subject, body, err
}

func applyTemplate(tpl string, vars TemplateVars) string {
	out := tpl
	for k, v := range vars {
		out = strings.ReplaceAll(out, "{{"+k+"}}", v)
	}
	return out
}

func trimAddrs(addrs []string) []string {
	var out []string
	seen := map[string]bool{}
	for _, a := range addrs {
		a = strings.TrimSpace(a)
		if a == "" || seen[strings.ToLower(a)] {
			continue
		}
		seen[strings.ToLower(a)] = true
		out = append(out, a)
	}
	return out
}

// ParseAddrs splits comma/semicolon-separated addresses.
func ParseAddrs(raw string) []string {
	raw = strings.ReplaceAll(raw, ";", ",")
	parts := strings.Split(raw, ",")
	var out []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
