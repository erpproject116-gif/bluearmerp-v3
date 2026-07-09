package outbox

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"mime"
	"net/smtp"
	"os"
	"strings"
)

// SMTPConfig holds optional SMTP settings from environment.
type SMTPConfig struct {
	Host string
	Port string
	From string
	User string
	Pass string
}

// LoadSMTPConfig reads SMTP_* environment variables.
func LoadSMTPConfig() SMTPConfig {
	return SMTPConfig{
		Host: strings.TrimSpace(os.Getenv("SMTP_HOST")),
		Port: strings.TrimSpace(os.Getenv("SMTP_PORT")),
		From: strings.TrimSpace(os.Getenv("SMTP_FROM")),
		User: strings.TrimSpace(os.Getenv("SMTP_USER")),
		Pass: strings.TrimSpace(os.Getenv("SMTP_PASS")),
	}
}

func (c SMTPConfig) Enabled() bool {
	return c.Host != "" && c.From != ""
}

func (c SMTPConfig) addr() string {
	port := c.Port
	if port == "" {
		port = "587"
	}
	return fmt.Sprintf("%s:%s", c.Host, port)
}

// SendEmail delivers a plain-text email via SMTP. Returns nil when SMTP is not configured (no-op).
func SendEmail(cfg SMTPConfig, to, subject, body string) error {
	to = strings.TrimSpace(to)
	if to == "" {
		return fmt.Errorf("recipient email is required")
	}
	if !cfg.Enabled() {
		return fmt.Errorf("SMTP not configured (set SMTP_HOST and SMTP_FROM)")
	}
	msg := bytes.NewBuffer(nil)
	msg.WriteString(fmt.Sprintf("From: %s\r\n", cfg.From))
	msg.WriteString(fmt.Sprintf("To: %s\r\n", to))
	msg.WriteString(fmt.Sprintf("Subject: %s\r\n", subject))
	msg.WriteString("MIME-Version: 1.0\r\n")
	msg.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	msg.WriteString("\r\n")
	msg.WriteString(body)

	var auth smtp.Auth
	if cfg.User != "" {
		auth = smtp.PlainAuth("", cfg.User, cfg.Pass, cfg.Host)
	}
	return smtp.SendMail(cfg.addr(), auth, cfg.From, []string{to}, msg.Bytes())
}

// EmailAttachment is a binary file attached to a MIME email.
type EmailAttachment struct {
	Filename    string
	ContentType string
	Data        []byte
}

// SendEmailMIME delivers HTML email with optional attachments via SMTP.
func SendEmailMIME(cfg SMTPConfig, to, cc []string, subject, htmlBody string, attachments []EmailAttachment) error {
	to = trimNonEmpty(to)
	cc = trimNonEmpty(cc)
	if len(to) == 0 {
		return fmt.Errorf("at least one recipient is required")
	}
	if !cfg.Enabled() {
		return fmt.Errorf("SMTP not configured (set SMTP_HOST and SMTP_FROM)")
	}

	boundary := "bluearm-mime-" + fmt.Sprintf("%d", len(subject)+len(htmlBody))
	var msg bytes.Buffer
	msg.WriteString(fmt.Sprintf("From: %s\r\n", cfg.From))
	msg.WriteString(fmt.Sprintf("To: %s\r\n", strings.Join(to, ", ")))
	if len(cc) > 0 {
		msg.WriteString(fmt.Sprintf("Cc: %s\r\n", strings.Join(cc, ", ")))
	}
	msg.WriteString(fmt.Sprintf("Subject: %s\r\n", mime.QEncoding.Encode("utf-8", subject)))
	msg.WriteString("MIME-Version: 1.0\r\n")
	msg.WriteString(fmt.Sprintf("Content-Type: multipart/mixed; boundary=%q\r\n", boundary))
	msg.WriteString("\r\n")

	writePart := func(contentType, body string) {
		msg.WriteString("--" + boundary + "\r\n")
		msg.WriteString("Content-Type: " + contentType + "\r\n")
		msg.WriteString("Content-Transfer-Encoding: 8bit\r\n")
		msg.WriteString("\r\n")
		msg.WriteString(body)
		msg.WriteString("\r\n")
	}

	writePart("text/html; charset=UTF-8", htmlBody)

	for _, att := range attachments {
		if len(att.Data) == 0 {
			continue
		}
		ct := att.ContentType
		if ct == "" {
			ct = "application/octet-stream"
		}
		name := att.Filename
		if name == "" {
			name = "attachment"
		}
		msg.WriteString("--" + boundary + "\r\n")
		msg.WriteString(fmt.Sprintf("Content-Type: %s; name=%q\r\n", ct, name))
		msg.WriteString("Content-Transfer-Encoding: base64\r\n")
		msg.WriteString(fmt.Sprintf("Content-Disposition: attachment; filename=%q\r\n", name))
		msg.WriteString("\r\n")
		encoded := base64.StdEncoding.EncodeToString(att.Data)
		for i := 0; i < len(encoded); i += 76 {
			end := i + 76
			if end > len(encoded) {
				end = len(encoded)
			}
			msg.WriteString(encoded[i:end] + "\r\n")
		}
	}
	msg.WriteString("--" + boundary + "--\r\n")

	recipients := append(append([]string{}, to...), cc...)
	var auth smtp.Auth
	if cfg.User != "" {
		auth = smtp.PlainAuth("", cfg.User, cfg.Pass, cfg.Host)
	}
	return smtp.SendMail(cfg.addr(), auth, cfg.From, recipients, msg.Bytes())
}

func trimNonEmpty(addrs []string) []string {
	var out []string
	for _, a := range addrs {
		a = strings.TrimSpace(a)
		if a != "" {
			out = append(out, a)
		}
	}
	return out
}
