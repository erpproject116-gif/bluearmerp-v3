package inviteemail

import (
	"fmt"
	"html"
	"log"
	"strings"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/outbox"
)

// AbsolutePortalURL turns a relative portal path (e.g. /portal/dashboard?token=…)
// into an absolute URL using APP_PUBLIC_URL / CORS_ORIGIN. Relative returned if origin unknown.
func AbsolutePortalURL(relative string) string {
	rel := strings.TrimSpace(relative)
	if rel == "" {
		return ""
	}
	if strings.HasPrefix(rel, "http://") || strings.HasPrefix(rel, "https://") {
		return rel
	}
	origin := AbsoluteAppURL()
	if origin == "" {
		if !strings.HasPrefix(rel, "/") {
			return "/" + rel
		}
		return rel
	}
	if !strings.HasPrefix(rel, "/") {
		rel = "/" + rel
	}
	return origin + rel
}

// SendPortalInviteAsync emails a client portal magic link. Returns whether send was attempted.
// No-op (false) when mail is not configured — callers must still return login_url for copy-link.
func SendPortalInviteAsync(toEmail, displayName, clientName, inviterName, relativeLoginURL string) (attempted bool) {
	if !MailConfigured() {
		return false
	}
	to := strings.TrimSpace(strings.ToLower(toEmail))
	if to == "" {
		return false
	}
	loginURL := AbsolutePortalURL(relativeLoginURL)
	name := strings.TrimSpace(displayName)
	if name == "" {
		name = to
	}
	client := strings.TrimSpace(clientName)
	if client == "" {
		client = "your company"
	}
	inviter := strings.TrimSpace(inviterName)
	if inviter == "" {
		inviter = "Your agency HR team"
	}
	go func() {
		subject := fmt.Sprintf("Client portal access — %s", client)
		textBody := fmt.Sprintf(
			"Hello %s,\n\n%s invited you to the client portal for %s on BluearmERP.\n\n"+
				"Open your portal (link expires): %s\n\n"+
				"If you were not expecting this, you can ignore this email.\n\n— BluearmERP\n",
			name, inviter, client, loginURL,
		)
		htmlBody := buildPortalInviteHTML(name, inviter, client, loginURL)
		if err := outbox.DeliverHTML(to, subject, htmlBody, textBody); err != nil {
			log.Printf("inviteemail: portal invite to %s: %v", to, err)
		}
	}()
	return true
}

func buildPortalInviteHTML(fullName, inviter, client, loginURL string) string {
	esc := html.EscapeString
	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background-color:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
  <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background-color:#f4f6fb;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="background-color:#3c50e0;padding:20px 28px;">
          <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">BluearmERP</p>
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#0f172a;">Client portal access</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#334155;">
            Hello %s — <strong>%s</strong> invited you to the client portal for <strong>%s</strong>.
          </p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#334155;">
            Use the button below to open the portal. This link expires; ask your agency contact if you need a new one.
          </p>
          <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
            <tr><td style="border-radius:6px;background-color:#3c50e0;">
              <a href="%s" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
                Open client portal
              </a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:13px;line-height:1.5;color:#64748b;">If you were not expecting this invite, you can ignore this email.</p>
        </td></tr>
        <tr><td style="padding:16px 28px 24px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;">BluearmERP — client portal invite</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
		esc(fullName), esc(inviter), esc(client), esc(loginURL),
	)
}
