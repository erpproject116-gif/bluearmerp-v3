package usermgmt

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

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
	return outbox.LoadSMTPConfig().Enabled()
}

func HandleOutboxEvent(ctx context.Context, pool *pgxpool.Pool, ev outbox.Event) error {
	if ev.EventType != inviteEmailEventType {
		return nil
	}
	var p inviteEmailPayload
	if len(ev.Payload) > 0 {
		_ = json.Unmarshal(ev.Payload, &p)
	}
	cfg := outbox.LoadSMTPConfig()
	if !cfg.Enabled() {
		log.Printf("usermgmt outbox: tenant=%d invite=%d — SMTP not configured, skipping email",
			ev.TenantID, p.InviteID)
		return nil
	}
	to := strings.TrimSpace(p.Email)
	if to == "" {
		return fmt.Errorf("invite email missing recipient")
	}
	subject := fmt.Sprintf("You're invited to %s on BluearmERP", p.CompanyName)
	if strings.TrimSpace(p.CompanyName) == "" {
		subject = "You're invited to BluearmERP"
	}
	signIn := strings.TrimSpace(p.SignInURL)
	if signIn == "" {
		signIn = "/signin"
	}
	body := fmt.Sprintf(
		"Hello %s,\n\n%s invited you to join %s on BluearmERP as %s.\n\n"+
			"Sign in at %s using Google with this same email address (%s).\n"+
			"There is no separate Accept button — joining happens when you sign in.\n\n"+
			"— BluearmERP\n",
		strings.TrimSpace(p.FullName),
		strings.TrimSpace(p.InviterName),
		strings.TrimSpace(p.CompanyName),
		strings.TrimSpace(p.RoleCode),
		signIn,
		to,
	)
	return outbox.SendEmail(cfg, to, subject, body)
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

func loadInviteEmailContext(ctx context.Context, pool *pgxpool.Pool, tenantID, inviterUserID int64) (companyName, inviterName, signInURL string) {
	_ = pool.QueryRow(ctx, `
		select coalesce(nullif(trim(company_name), ''), 'your company')
		from public.tenants where id = $1`, tenantID).Scan(&companyName)
	_ = pool.QueryRow(ctx, `
		select coalesce(nullif(trim(full_name), ''), coalesce(email, 'A teammate'))
		from public.users where id = $1 and tenant_id = $2`, inviterUserID, tenantID).Scan(&inviterName)
	// Relative path is fine in email body; tenants typically bookmark the app origin.
	signInURL = "/signin"
	return companyName, inviterName, signInURL
}
