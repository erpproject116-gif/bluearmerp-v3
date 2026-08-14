package usermgmt

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"log"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/outbox"
)

const inviteEmailEventType = "user.invite"

type inviteEmailPayload struct {
	InviteID    int64  `json:"invite_id"`
	UserID      int64  `json:"user_id"`
	Email       string `json:"email"`
	FullName    string `json:"full_name"`
	RoleCode    string `json:"role_code"`
	CompanyName string `json:"company_name"`
	InviterName string `json:"inviter_name"`
	SignInURL   string `json:"signin_url"`
}

func inviteEmailSMTPEnabled() bool {
	return outbox.MailConfigured()
}

func HandleOutboxEvent(ctx context.Context, pool *pgxpool.Pool, ev outbox.Event) error {
	if ev.EventType != inviteEmailEventType {
		return nil
	}
	var p inviteEmailPayload
	if len(ev.Payload) > 0 {
		_ = json.Unmarshal(ev.Payload, &p)
	}
	if !outbox.MailConfigured() {
		log.Printf("usermgmt outbox: tenant=%d invite=%d — email not configured (RESEND_API_KEY or SMTP_*), skipping",
			ev.TenantID, p.InviteID)
		return nil
	}
	to := strings.TrimSpace(p.Email)
	if to == "" {
		return fmt.Errorf("invite email missing recipient")
	}
	company := strings.TrimSpace(p.CompanyName)
	subject := fmt.Sprintf("You're invited to %s on BluearmERP", company)
	if company == "" {
		subject = "You're invited to BluearmERP"
		company = "your company"
	}
	signIn := strings.TrimSpace(p.SignInURL)
	if signIn == "" {
		signIn = absoluteSignInURL()
	}
	fullName := strings.TrimSpace(p.FullName)
	if fullName == "" {
		fullName = to
	}
	inviter := strings.TrimSpace(p.InviterName)
	if inviter == "" {
		inviter = "A teammate"
	}
	role := strings.TrimSpace(p.RoleCode)
	if role == "" {
		role = "member"
	}

	textBody := fmt.Sprintf(
		"Hello %s,\n\n%s invited you to join %s on BluearmERP as %s.\n\n"+
			"Sign in at %s using Google with this same email address (%s).\n"+
			"There is no separate Accept button — joining happens when you sign in.\n\n"+
			"— BluearmERP\n",
		fullName, inviter, company, role, signIn, to,
	)
	htmlBody := buildInviteHTML(fullName, inviter, company, role, signIn, to)
	return outbox.DeliverHTML(to, subject, htmlBody, textBody)
}

// DrainInviteOutbox processes pending user.invite events only (does not claim other event types).
func DrainInviteOutbox(ctx context.Context, pool *pgxpool.Pool) error {
	for {
		n, err := outbox.DrainPendingOfTypes(ctx, pool, []string{inviteEmailEventType}, HandleOutboxEvent)
		if err != nil {
			return err
		}
		if n == 0 {
			return nil
		}
	}
}

// drainInviteOutboxAsync sends invite mail after the HTTP response so SMTP/Resend
// latency cannot leave the Invite modal stuck on a loading state.
func drainInviteOutboxAsync(pool *pgxpool.Pool) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
		defer cancel()
		if err := DrainInviteOutbox(ctx, pool); err != nil {
			log.Printf("usermgmt outbox: async drain: %v", err)
		}
	}()
}

func loadInviteEmailContext(ctx context.Context, pool *pgxpool.Pool, tenantID, inviterUserID int64) (companyName, inviterName, signInURL string) {
	_ = pool.QueryRow(ctx, `
		select coalesce(nullif(trim(company_name), ''), 'your company')
		from public.tenants where id = $1`, tenantID).Scan(&companyName)
	_ = pool.QueryRow(ctx, `
		select coalesce(nullif(trim(full_name), ''), coalesce(email, 'A teammate'))
		from public.users where id = $1 and tenant_id = $2`, inviterUserID, tenantID).Scan(&inviterName)
	signInURL = absoluteSignInURL()
	return companyName, inviterName, signInURL
}

func absoluteSignInURL() string {
	origin := strings.TrimSpace(os.Getenv("APP_PUBLIC_URL"))
	if origin == "" {
		raw := strings.TrimSpace(os.Getenv("CORS_ORIGIN"))
		if raw != "" {
			origin = strings.TrimSpace(strings.Split(raw, ",")[0])
		}
	}
	origin = strings.TrimRight(origin, "/")
	if origin == "" {
		return "/signin"
	}
	return origin + "/signin"
}

func buildInviteHTML(fullName, inviter, company, role, signInURL, email string) string {
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
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#0f172a;">You're invited</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#334155;">
            Hello %s — <strong>%s</strong> invited you to join <strong>%s</strong> on BluearmERP as <strong>%s</strong>.
          </p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#334155;">
            Sign in with <strong>Google</strong> using this exact email address (<strong>%s</strong>).
            There is no separate Accept button — joining happens when you sign in.
          </p>
          <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
            <tr><td style="border-radius:6px;background-color:#3c50e0;">
              <a href="%s" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
                Sign in to BluearmERP
              </a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:13px;line-height:1.5;color:#64748b;">If you were not expecting this invite, you can ignore this email.</p>
        </td></tr>
        <tr><td style="padding:16px 28px 24px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;">BluearmERP — workspace invite</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
		esc(fullName), esc(inviter), esc(company), esc(role), esc(email), esc(signInURL),
	)
}
