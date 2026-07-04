package auth

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNoTenantProfile = errors.New("no tenant profile")
	ErrAmbiguousInvite = errors.New("ambiguous invite email across tenants")
)

// bootstrapSuperadminEmails match scripts/seed-platform-owners.sql + link-platform-owners.sql.
var bootstrapSuperadminEmails = map[string]struct{}{
	"itsjohnranel@gmail.com": {},
	"bluearmph@gmail.com":    {},
}

func normalizeEmail(raw string) string {
	return strings.ToLower(strings.TrimSpace(raw))
}

func isBootstrapSuperadminEmail(email string) bool {
	_, ok := bootstrapSuperadminEmails[normalizeEmail(email)]
	return ok
}

// tryAutoLinkProvisionedUser links a Supabase auth user to ALL pre-provisioned rows for
// its email, across every tenant. Matches invited users (invite flow) and active users
// without auth_user_id (platform owner seed). Supporting one login across many businesses
// means the same email invited to multiple tenants is linked to each rather than rejected.
func tryAutoLinkProvisionedUser(ctx context.Context, pool *pgxpool.Pool, authUserID, email string) error {
	email = normalizeEmail(email)
	if email == "" || authUserID == "" {
		return ErrNoTenantProfile
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Link every unclaimed row for this email whose tenant does not already have a row
	// bound to this auth identity (the (auth_user_id, tenant_id) unique index guards this).
	rows, err := tx.Query(ctx, `
		update public.users u
		set auth_user_id = $1::uuid, status = 'active', updated_at = now()
		where lower(u.email) = $2
		  and u.auth_user_id is null
		  and u.status in ('invited', 'active')
		  and not exists (
		    select 1 from public.users x
		    where x.auth_user_id = $1::uuid and x.tenant_id = u.tenant_id
		  )
		returning u.id, u.full_name`, authUserID, email)
	if err != nil {
		return err
	}
	var userIDs []int64
	var fullName string
	for rows.Next() {
		var id int64
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			rows.Close()
			return err
		}
		userIDs = append(userIDs, id)
		if fullName == "" {
			fullName = name
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	if len(userIDs) == 0 {
		return ErrNoTenantProfile
	}

	_, err = tx.Exec(ctx, `
		update public.user_invites ui
		set accepted_at = now()
		where ui.user_id = any($1)
		  and ui.revoked_at is null
		  and ui.accepted_at is null`, userIDs)
	if err != nil {
		return err
	}

	if isBootstrapSuperadminEmail(email) {
		if err := ensureBootstrapPlatformUser(ctx, tx, authUserID, email, fullName); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func ensureBootstrapPlatformUser(ctx context.Context, tx pgx.Tx, authUserID, email, fullName string) error {
	// Drop stale platform_users rows for this email tied to another auth UUID.
	_, err := tx.Exec(ctx, `
		delete from public.platform_users
		where lower(email) = lower($2)
		  and auth_user_id <> $1::uuid`,
		authUserID, email)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		insert into public.platform_users (auth_user_id, email, full_name, role, is_active)
		values ($1::uuid, $2, $3, 'superadmin', true)
		on conflict (auth_user_id) do update
		set email = excluded.email,
		    full_name = excluded.full_name,
		    role = 'superadmin',
		    is_active = true`,
		authUserID, email, fullName)
	if err != nil {
		return err
	}

	if normalizeEmail(email) == "bluearmph@gmail.com" {
		_, err = tx.Exec(ctx, `
			update public.tenants t
			set owner_user_id = u.id, updated_at = now()
			from public.users u
			join public.tenants bt on bt.id = u.tenant_id
			where bt.company_code = 'BLUEARM'
			  and u.auth_user_id = $1::uuid
			  and lower(u.email) = 'bluearmph@gmail.com'
			  and t.id = bt.id
			  and t.owner_user_id is distinct from u.id`,
			authUserID)
	}
	return err
}

// repairBootstrapPlatformAccess fixes platform_users for bootstrap emails that were
// linked before platform_users existed (e.g. manual link or pre-fix autolink).
func repairBootstrapPlatformAccess(ctx context.Context, pool *pgxpool.Pool, tu TenantUser) error {
	if !isBootstrapSuperadminEmail(tu.Email) {
		return nil
	}
	if tu.IsPlatformSuperadmin && (normalizeEmail(tu.Email) != "bluearmph@gmail.com" || tu.IsTenantOwner) {
		return nil
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if err := ensureBootstrapPlatformUser(ctx, tx, tu.AuthUserID, tu.Email, tu.FullName); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// tryAutoLinkInvitedUser is kept as an alias for tests and call sites during rename.
func tryAutoLinkInvitedUser(ctx context.Context, pool *pgxpool.Pool, authUserID, email string) error {
	return tryAutoLinkProvisionedUser(ctx, pool, authUserID, email)
}
