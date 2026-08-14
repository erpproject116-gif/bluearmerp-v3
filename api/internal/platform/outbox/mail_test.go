package outbox

import (
	"testing"
)

func TestMailConfigured_ResendOrSMTP(t *testing.T) {
	t.Setenv("RESEND_API_KEY", "")
	t.Setenv("RESEND_FROM", "")
	t.Setenv("SMTP_HOST", "")
	t.Setenv("SMTP_FROM", "")
	if MailConfigured() {
		t.Fatal("expected MailConfigured false with empty env")
	}

	t.Setenv("RESEND_API_KEY", "re_test")
	t.Setenv("RESEND_FROM", "BluearmERP <noreply@example.com>")
	if !MailConfigured() {
		t.Fatal("expected MailConfigured true with Resend")
	}

	t.Setenv("RESEND_API_KEY", "")
	t.Setenv("RESEND_FROM", "")
	t.Setenv("SMTP_HOST", "smtp.example.com")
	t.Setenv("SMTP_FROM", "noreply@example.com")
	if !MailConfigured() {
		t.Fatal("expected MailConfigured true with SMTP")
	}
}

func TestLoadResendConfig_FromFallsBackToSMTPFrom(t *testing.T) {
	t.Setenv("RESEND_API_KEY", "re_test")
	t.Setenv("RESEND_FROM", "")
	t.Setenv("SMTP_FROM", "fallback@example.com")
	cfg := LoadResendConfig()
	if cfg.From != "fallback@example.com" {
		t.Fatalf("From=%q", cfg.From)
	}
}
