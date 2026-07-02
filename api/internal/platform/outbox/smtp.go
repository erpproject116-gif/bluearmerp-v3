package outbox

import (
	"bytes"
	"fmt"
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
