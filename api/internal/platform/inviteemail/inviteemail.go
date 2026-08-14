package inviteemail

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"log"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/outbox"
)

const (
	EventTypeUserInvite  = "user.invite"
	EventTypeStaffInvite = "platform.staff.invite" // handled via direct send (no tenant outbox row)
)

// Payload is stored on user.invite outbox events and used for HTML/text rendering.
type Payload struct {
	InviteID    int64  `json:"invite_id"`
	UserID      int64  `json:"user_id"`
	Email       string `json:"email"`
	FullName    string `json:"full_name"`
	RoleCode    string `json:"role_code"`
	CompanyName string `json:"company_name"`
	InviterName string `json:"inviter_name"`
	SignInURL   string `json:"signin_url"`
	Kind        string `json:"kind,omitempty"` // "workspace" | "staff"
}

// MailConfigured reports whether Resend or SMTP can send invite mail.
func MailConfigured() bool {
	return outbox.MailConfigured()
}

// AbsoluteSignInURL builds https://…/signin from APP_PUBLIC_URL or CORS_ORIGIN.
func AbsoluteSignInURL() string {
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

// LoadWorkspaceContext loads company + inviter for a tenant invite.
func LoadWorkspaceContext(ctx context.Context, pool *pgxpool.Pool, tenantID, inviterUserID int64) (companyName, inviterName, signInURL string) {
	_ = pool.QueryRow(ctx, `
		select coalesce(nullif(trim(company_name), ''), 'your company')
		from public.tenants where id = $1`, tenantID).Scan(&companyName)
	if inviterUserID > 0 {
		_ = pool.QueryRow(ctx, `
			select coalesce(nullif(trim(full_name), ''), coalesce(email, 'A teammate'))
			from public.users where id = $1 and tenant_id = $2`, inviterUserID, tenantID).Scan(&inviterName)
	}
	if strings.TrimSpace(inviterName) == "" {
		inviterName = "A teammate"
	}
	signInURL = AbsoluteSignInURL()
	return companyName, inviterName, signInURL
}

// EnqueueUserInviteTx queues a workspace invite email on the tenant outbox.
func EnqueueUserInviteTx(ctx context.Context, tx pgx.Tx, pool *pgxpool.Pool, tenantID, inviterUserID, inviteID, userID int64, email, fullName, roleCode, idemSuffix string) error {
	companyName, inviterName, signInURL := LoadWorkspaceContext(ctx, pool, tenantID, inviterUserID)
	p := Payload{
		InviteID: inviteID, UserID: userID, Email: email, FullName: fullName,
		RoleCode: roleCode, CompanyName: companyName, InviterName: inviterName, SignInURL: signInURL,
		Kind: "workspace",
	}
	key := fmt.Sprintf("user.invite:%d:%d", tenantID, inviteID)
	if idemSuffix != "" {
		key = fmt.Sprintf("user.invite:%d:%d:%s", tenantID, inviteID, idemSuffix)
	}
	return outbox.EnqueueTx(ctx, tx, tenantID, EventTypeUserInvite, key, p)
}

// HandleOutboxEvent sends user.invite emails.
func HandleOutboxEvent(ctx context.Context, pool *pgxpool.Pool, ev outbox.Event) error {
	if ev.EventType != EventTypeUserInvite {
		return nil
	}
	var p Payload
	if len(ev.Payload) > 0 {
		_ = json.Unmarshal(ev.Payload, &p)
	}
	return Deliver(p)
}

// DrainUserInvites processes pending user.invite outbox rows.
func DrainUserInvites(ctx context.Context, pool *pgxpool.Pool) error {
	for {
		n, err := outbox.DrainPendingOfTypes(ctx, pool, []string{EventTypeUserInvite}, HandleOutboxEvent)
		if err != nil {
			return err
		}
		if n == 0 {
			return nil
		}
	}
}

// DrainUserInvitesAsync drains after the HTTP response returns.
func DrainUserInvitesAsync(pool *pgxpool.Pool) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
		defer cancel()
		if err := DrainUserInvites(ctx, pool); err != nil {
			log.Printf("inviteemail: async drain: %v", err)
		}
	}()
}

// Deliver sends one invite email (workspace or staff copy).
func Deliver(p Payload) error {
	if !outbox.MailConfigured() {
		log.Printf("inviteemail: invite=%d — email not configured, skipping", p.InviteID)
		return nil
	}
	to := strings.TrimSpace(p.Email)
	if to == "" {
		return fmt.Errorf("invite email missing recipient")
	}
	kind := strings.TrimSpace(p.Kind)
	if kind == "" {
		kind = "workspace"
	}
	signIn := strings.TrimSpace(p.SignInURL)
	if signIn == "" {
		signIn = AbsoluteSignInURL()
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
	company := strings.TrimSpace(p.CompanyName)

	var subject, textBody, htmlBody string
	if kind == "staff" {
		subject = "You're invited to BluearmERP Platform Command"
		if role == "" {
			role = "support_viewer"
		}
		textBody = fmt.Sprintf(
			"Hello %s,\n\n%s invited you to BluearmERP Platform Command as %s.\n\n"+
				"Sign in at %s using Google with this same email address (%s).\n"+
				"There is no separate Accept button — access is linked when you sign in.\n\n"+
				"— BluearmERP\n",
			fullName, inviter, role, signIn, to,
		)
		htmlBody = buildStaffInviteHTML(fullName, inviter, role, signIn, to)
	} else {
		if company == "" {
			company = "your company"
			subject = "You're invited to BluearmERP"
		} else {
			subject = fmt.Sprintf("You're invited to %s on BluearmERP", company)
		}
		textBody = fmt.Sprintf(
			"Hello %s,\n\n%s invited you to join %s on BluearmERP as %s.\n\n"+
				"Sign in at %s using Google with this same email address (%s).\n"+
				"There is no separate Accept button — joining happens when you sign in.\n\n"+
				"— BluearmERP\n",
			fullName, inviter, company, role, signIn, to,
		)
		htmlBody = buildWorkspaceInviteHTML(fullName, inviter, company, role, signIn, to)
	}
	return outbox.DeliverHTML(to, subject, htmlBody, textBody)
}

// SendStaffInviteAsync emails a platform staff invite without outbox (no tenant_id).
func SendStaffInviteAsync(inviteID int64, email, fullName, role, inviterName string) {
	p := Payload{
		InviteID: inviteID, Email: email, FullName: fullName, RoleCode: role,
		InviterName: inviterName, SignInURL: AbsoluteSignInURL(), Kind: "staff",
		CompanyName: "BluearmERP Platform Command",
	}
	go func() {
		if err := Deliver(p); err != nil {
			log.Printf("inviteemail: staff invite=%d: %v", inviteID, err)
		}
	}()
}

func buildWorkspaceInviteHTML(fullName, inviter, company, role, signInURL, email string) string {
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

func buildStaffInviteHTML(fullName, inviter, role, signInURL, email string) string {
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
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#0f172a;">Platform Command invite</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#334155;">
            Hello %s — <strong>%s</strong> invited you to <strong>BluearmERP Platform Command</strong> as <strong>%s</strong>.
          </p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#334155;">
            Sign in with <strong>Google</strong> using this exact email address (<strong>%s</strong>).
            There is no separate Accept button — platform access is linked when you sign in.
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
          <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;">BluearmERP — platform staff invite</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
		esc(fullName), esc(inviter), esc(role), esc(email), esc(signInURL),
	)
}
