package comms

import (
	"os"
	"strings"
)

// GmailConfig holds Google OAuth / Gmail API settings from environment.
type GmailConfig struct {
	ClientID     string
	ClientSecret string
	RedirectURI  string
	StubMode     bool
}

// LoadGmailConfig reads GOOGLE_* and COMMS_GMAIL_STUB environment variables.
func LoadGmailConfig() GmailConfig {
	stub := strings.EqualFold(strings.TrimSpace(os.Getenv("COMMS_GMAIL_STUB")), "true") ||
		strings.TrimSpace(os.Getenv("COMMS_GMAIL_STUB")) == "1"
	cfg := GmailConfig{
		ClientID:     strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_ID")),
		ClientSecret: strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_SECRET")),
		RedirectURI:  strings.TrimSpace(os.Getenv("GOOGLE_OAUTH_REDIRECT")),
		StubMode:     stub,
	}
	if cfg.ClientID == "" || cfg.ClientSecret == "" || cfg.RedirectURI == "" {
		cfg.StubMode = true
	}
	return cfg
}

func (c GmailConfig) OAuthConfigured() bool {
	return c.ClientID != "" && c.ClientSecret != "" && c.RedirectURI != ""
}

func (c GmailConfig) OAuthScopes() []string {
	return []string{
		"https://www.googleapis.com/auth/gmail.send",
		"https://www.googleapis.com/auth/gmail.readonly",
		"https://www.googleapis.com/auth/userinfo.email",
	}
}
