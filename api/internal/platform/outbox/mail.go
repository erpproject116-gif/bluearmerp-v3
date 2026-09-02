package outbox

import "fmt"

// MailConfigured reports whether invite/transactional mail can be sent
// via Resend HTTPS and/or SMTP.
func MailConfigured() bool {
	return LoadResendConfig().Enabled() || LoadSMTPConfig().Enabled()
}

// DeliverText sends a plain-text email. Prefers Resend HTTPS when configured, then SMTP.
func DeliverText(to, subject, body string) error {
	if r := LoadResendConfig(); r.Enabled() {
		if err := SendResendEmail(r, to, subject, body, ""); err != nil {
			return fmt.Errorf("resend: %w", err)
		}
		return nil
	}
	cfg := LoadSMTPConfig()
	if !cfg.Enabled() {
		return fmt.Errorf("email not configured (set RESEND_API_KEY + RESEND_FROM/SMTP_FROM, or SMTP_HOST + SMTP_FROM)")
	}
	return SendEmail(cfg, to, subject, body)
}

// DeliverHTML sends an HTML email (optional plain-text alternative via Resend).
// Prefers Resend HTTPS, then SMTP MIME.
func DeliverHTML(to, subject, htmlBody, textFallback string) error {
	return DeliverHTMLToMany([]string{to}, subject, htmlBody, textFallback)
}

// DeliverHTMLToMany sends HTML to one or more recipients. Prefers Resend, then SMTP.
func DeliverHTMLToMany(to []string, subject, htmlBody, textFallback string) error {
	to = trimNonEmpty(to)
	if len(to) == 0 {
		return fmt.Errorf("at least one recipient is required")
	}
	if r := LoadResendConfig(); r.Enabled() {
		if err := SendResendEmailToMany(r, to, subject, textFallback, htmlBody); err != nil {
			return fmt.Errorf("resend: %w", err)
		}
		return nil
	}
	cfg := LoadSMTPConfig()
	if !cfg.Enabled() {
		return fmt.Errorf("email not configured (set RESEND_API_KEY + RESEND_FROM/SMTP_FROM, or SMTP_HOST + SMTP_FROM)")
	}
	return SendEmailMIME(cfg, to, nil, subject, htmlBody, nil)
}
