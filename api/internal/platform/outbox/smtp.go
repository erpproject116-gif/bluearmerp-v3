package outbox

import (
	"bytes"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"mime"
	"net"
	"net/smtp"
	"os"
	"strings"
	"time"
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

func (c SMTPConfig) port() string {
	if c.Port != "" {
		return c.Port
	}
	return "587"
}

func (c SMTPConfig) addr() string {
	return fmt.Sprintf("%s:%s", c.Host, c.port())
}

const smtpDialTimeout = 12 * time.Second

func smtpDialHint(err error) string {
	if err == nil {
		return ""
	}
	msg := err.Error()
	if strings.Contains(msg, "i/o timeout") ||
		strings.Contains(msg, "connection timed out") ||
		strings.Contains(msg, "deadline exceeded") ||
		strings.Contains(msg, "connection refused") {
		return msg + " — if the API runs on Render free tier, outbound SMTP ports 25/465/587 are blocked; set RESEND_API_KEY (+ RESEND_FROM or SMTP_FROM) to send over HTTPS, upgrade the instance, or use Gmail OAuth (Communications → Settings)"
	}
	return msg
}

// dialSMTP opens an SMTP client with a short dial timeout (avoids hanging HTTP requests).
func dialSMTP(cfg SMTPConfig) (*smtp.Client, error) {
	addr := cfg.addr()
	port := cfg.port()
	d := net.Dialer{Timeout: smtpDialTimeout}
	raw, err := d.Dial("tcp", addr)
	if err != nil {
		return nil, fmt.Errorf("SMTP dial %s: %s", addr, smtpDialHint(err))
	}
	_ = raw.SetDeadline(time.Now().Add(smtpDialTimeout))

	var client *smtp.Client
	if port == "465" {
		tlsConn := tls.Client(raw, &tls.Config{ServerName: cfg.Host, MinVersion: tls.VersionTLS12})
		if err := tlsConn.Handshake(); err != nil {
			_ = raw.Close()
			return nil, fmt.Errorf("SMTP TLS handshake: %w", err)
		}
		client, err = smtp.NewClient(tlsConn, cfg.Host)
	} else {
		client, err = smtp.NewClient(raw, cfg.Host)
	}
	if err != nil {
		_ = raw.Close()
		return nil, fmt.Errorf("SMTP client: %w", err)
	}

	if port != "465" {
		if ok, _ := client.Extension("STARTTLS"); ok {
			if err := client.StartTLS(&tls.Config{ServerName: cfg.Host, MinVersion: tls.VersionTLS12}); err != nil {
				_ = client.Close()
				return nil, fmt.Errorf("SMTP STARTTLS: %w", err)
			}
		}
	}

	if cfg.User != "" {
		auth := smtp.PlainAuth("", cfg.User, cfg.Pass, cfg.Host)
		if err := client.Auth(auth); err != nil {
			_ = client.Close()
			return nil, fmt.Errorf("SMTP auth: %w", err)
		}
	}
	return client, nil
}

func sendMail(cfg SMTPConfig, to []string, msg []byte) error {
	if !cfg.Enabled() {
		return fmt.Errorf("SMTP not configured (set SMTP_HOST and SMTP_FROM)")
	}
	client, err := dialSMTP(cfg)
	if err != nil {
		return err
	}
	defer client.Close()

	if err := client.Mail(cfg.From); err != nil {
		return fmt.Errorf("SMTP MAIL FROM: %w", err)
	}
	for _, rcpt := range to {
		if err := client.Rcpt(rcpt); err != nil {
			return fmt.Errorf("SMTP RCPT TO %s: %w", rcpt, err)
		}
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("SMTP DATA: %w", err)
	}
	if _, err := w.Write(msg); err != nil {
		_ = w.Close()
		return fmt.Errorf("SMTP write: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("SMTP data close: %w", err)
	}
	return client.Quit()
}

// SendEmail delivers a plain-text email via SMTP.
func SendEmail(cfg SMTPConfig, to, subject, body string) error {
	to = strings.TrimSpace(to)
	if to == "" {
		return fmt.Errorf("recipient email is required")
	}
	msg := bytes.NewBuffer(nil)
	msg.WriteString(fmt.Sprintf("From: %s\r\n", cfg.From))
	msg.WriteString(fmt.Sprintf("To: %s\r\n", to))
	msg.WriteString(fmt.Sprintf("Subject: %s\r\n", subject))
	msg.WriteString("MIME-Version: 1.0\r\n")
	msg.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	msg.WriteString("\r\n")
	msg.WriteString(body)
	return sendMail(cfg, []string{to}, msg.Bytes())
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
	return sendMail(cfg, recipients, msg.Bytes())
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
