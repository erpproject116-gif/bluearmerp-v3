package auth

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNoTenantProfile    = errors.New("no tenant profile")
	ErrAmbiguousInvite    = errors.New("ambiguous invite email across tenants")
)

func normalizeEmail(raw string) string {
	return strings.ToLower(strings.TrimSpace(raw))
}

// tryAutoLinkInvitedUser links a Supabase auth user to a pre-provisioned invited row by email.
func tryAutoLinkInvitedUser(ctx context.Context, pool *pgxpool.Pool, authUserID, email string) error {
	email = normalizeEmail(email)
	if email == "" || authUserID == "" {
		return ErrNoTenantProfile
	}

	var inviteCount int
	if err := pool.QueryRow(ctx, `
		select count(*)::int
		from public.users u
		where lower(u.email) = $1
		  and u.status = 'invited'
		  and u.auth_user_id is null`, email).Scan(&inviteCount); err != nil {
		return err
	}
	if inviteCount == 0 {
		return ErrNoTenantProfile
	}
	if inviteCount > 1 {
		return ErrAmbiguousInvite
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var userID int64
	err = tx.QueryRow(ctx, `
		update public.users u
		set auth_user_id = $1::uuid, status = 'active', updated_at = now()
		where u.id = (
		  select u2.id
		  from public.users u2
		  where lower(u2.email) = $2
		    and u2.status = 'invited'
		    and u2.auth_user_id is null
		  limit 1
		)
		and not exists (
		  select 1 from public.users x
		  where x.auth_user_id = $1::uuid and x.id <> u.id
		)
		returning u.id`, authUserID, email).Scan(&userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNoTenantProfile
		}
		return err
	}

	_, err = tx.Exec(ctx, `
		update public.user_invites ui
		set accepted_at = now()
		where ui.user_id = $1
		  and ui.revoked_at is null
		  and ui.accepted_at is null`, userID)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}
