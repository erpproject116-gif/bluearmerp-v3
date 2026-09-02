package outbox

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// ResendConfig holds HTTPS API settings (works when SMTP is unavailable).
type ResendConfig struct {
	APIKey string
	From   string
}

// LoadResendConfig reads RESEND_API_KEY and RESEND_FROM (falls back to SMTP_FROM).
func LoadResendConfig() ResendConfig {
	from := strings.TrimSpace(os.Getenv("RESEND_FROM"))
	if from == "" {
		from = strings.TrimSpace(os.Getenv("SMTP_FROM"))
	}
	return ResendConfig{
		APIKey: strings.TrimSpace(os.Getenv("RESEND_API_KEY")),
		From:   from,
	}
}

func (c ResendConfig) Enabled() bool {
	return c.APIKey != "" && c.From != ""
}

type resendSendBody struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	Subject string   `json:"subject"`
	Html    string   `json:"html,omitempty"`
	Text    string   `json:"text,omitempty"`
}

// SendResendEmail sends plain text and/or HTML via Resend's HTTPS API (single recipient).
func SendResendEmail(cfg ResendConfig, to, subject, textBody, htmlBody string) error {
	return SendResendEmailToMany(cfg, []string{to}, subject, textBody, htmlBody)
}

// SendResendEmailToMany sends to one or more recipients via Resend HTTPS.
func SendResendEmailToMany(cfg ResendConfig, to []string, subject, textBody, htmlBody string) error {
	to = trimNonEmpty(to)
	if len(to) == 0 {
		return fmt.Errorf("recipient email is required")
	}
	if !cfg.Enabled() {
		return fmt.Errorf("Resend not configured (set RESEND_API_KEY and RESEND_FROM or SMTP_FROM)")
	}
	if strings.TrimSpace(textBody) == "" && strings.TrimSpace(htmlBody) == "" {
		return fmt.Errorf("email body is required")
	}

	payload := resendSendBody{
		From:    cfg.From,
		To:      to,
		Subject: subject,
		Text:    textBody,
		Html:    htmlBody,
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("resend marshal: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(raw))
	if err != nil {
		return fmt.Errorf("resend request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+cfg.APIKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 20 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("resend HTTP: %w", err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("resend API %d: %s", res.StatusCode, strings.TrimSpace(string(body)))
	}
	return nil
}
