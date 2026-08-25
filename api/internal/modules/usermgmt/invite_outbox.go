package usermgmt

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/inviteemail"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/outbox"
)

func inviteEmailSMTPEnabled() bool {
	return inviteemail.MailConfigured()
}

// HandleOutboxEvent delegates user.invite delivery to the shared inviteemail package.
func HandleOutboxEvent(ctx context.Context, pool *pgxpool.Pool, ev outbox.Event) error {
	return inviteemail.HandleOutboxEvent(ctx, pool, ev)
}

// DrainInviteOutbox processes pending user.invite events.
func DrainInviteOutbox(ctx context.Context, pool *pgxpool.Pool) error {
	return inviteemail.DrainUserInvites(ctx, pool)
}

func drainInviteOutboxAsync(pool *pgxpool.Pool) {
	inviteemail.DrainUserInvitesAsync(pool)
}

func enqueueInviteEmailTx(ctx context.Context, tx pgx.Tx, pool *pgxpool.Pool, tenantID, inviterUserID, inviteID, userID int64, email, fullName, roleCode, idemSuffix string) error {
	return inviteemail.EnqueueUserInviteTx(ctx, tx, pool, tenantID, inviterUserID, inviteID, userID, email, fullName, roleCode, idemSuffix)
}

func enqueueReinviteEmailTx(ctx context.Context, tx pgx.Tx, pool *pgxpool.Pool, tenantID, inviterUserID, inviteID, userID int64, email, fullName, roleCode, idemSuffix, passwordResetURL string) error {
	return inviteemail.EnqueueUserInviteTxWithOptions(ctx, tx, pool, tenantID, inviterUserID, inviteID, userID, email, fullName, roleCode, idemSuffix, passwordResetURL, "reinvite")
}
