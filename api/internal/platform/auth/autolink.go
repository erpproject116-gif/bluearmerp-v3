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

// platformConsoleOwnerEmails are the only accounts allowed Platform console access
// (Customers / Plans). Must match scripts/seed-platform-owners.sql + link-platform-owners.sql.
var platformConsoleOwnerEmails = map[string]struct{}{
	"itsjohnranel@gmail.com":  {},
	"bluearmph@gmail.com":     {},
	"erpproject116@gmail.com": {},
}

// bootstrapSuperadminEmails is an alias kept for call sites / tests.
var bootstrapSuperadminEmails = platformConsoleOwnerEmails

func normalizeEmail(raw string) string {
	return strings.ToLower(strings.TrimSpace(raw))
}

func isBootstrapSuperadminEmail(email string) bool {
	_, ok := platformConsoleOwnerEmails[normalizeEmail(email)]
	return ok
}

// IsPlatformConsoleEmail reports whether email may use the Platform console.
func IsPlatformConsoleEmail(email string) bool {
	return isBootstrapSuperadminEmail(email)
}

// tryAutoLinkProvisionedUser links a Supabase auth user to at most ONE pre-provisioned
// customer user row for its email (one email → one customer business).
// Grandfather: if this auth already has an active membership, additional invites are not linked.
// Legacy multi-invite: if several pending invites exist and auth has zero memberships, link the oldest only.
func tryAutoLinkProvisionedUser(ctx context.Context, pool *pgxpool.Pool, authUserID, email string) error {
	email = normalizeEmail(email)
	if email == "" || authUserID == "" {
		return ErrNoTenantProfile
	}

	existing, err := CountActiveMembershipsForAuth(ctx, pool, authUserID)
	if err != nil {
		return err
	}
	if existing > 0 && !isBootstrapSuperadminEmail(email) {
		// Already in a customer business — do not attach further invites.
		return ErrNoTenantProfile
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Prefer oldest pending invite; fall back to unclaimed active seed row (platform owner).
	var userID int64
	var fullName string
	err = tx.QueryRow(ctx, `
		select u.id, coalesce(u.full_name, '')
		from public.users u
		left join public.user_invites ui on ui.user_id = u.id
		  and ui.revoked_at is null and ui.accepted_at is null
		where lower(u.email) = $1
		  and u.auth_user_id is null
		  and u.status in ('invited', 'active')
		  and not exists (
		    select 1 from public.users x
		    where x.auth_user_id = $2::uuid and x.tenant_id = u.tenant_id
		  )
		order by
		  case when u.status = 'invited' then 0 else 1 end,
		  ui.invited_at asc nulls last,
		  u.id asc
		limit 1`, email, authUserID).Scan(&userID, &fullName)
	if err == pgx.ErrNoRows {
		return ErrNoTenantProfile
	}
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		update public.users
		set auth_user_id = $1::uuid, status = 'active', updated_at = now()
		where id = $2`, authUserID, userID)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		update public.user_invites
		set accepted_at = now()
		where user_id = $1
		  and revoked_at is null
		  and accepted_at is null`, userID)
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

// LinkProvisionedUser links all invited/pre-provisioned users rows for this email to the auth identity.
func LinkProvisionedUser(ctx context.Context, pool *pgxpool.Pool, authUserID, email string) error {
	return tryAutoLinkProvisionedUser(ctx, pool, authUserID, email)
}

// PendingInviteTenant returns the first tenant where this email still has an unclaimed invite.
func PendingInviteTenant(ctx context.Context, pool *pgxpool.Pool, email string) (tenantID int64, companyCode string, ok bool) {
	info, ok := PendingInviteTenantInfo(ctx, pool, email)
	if !ok {
		return 0, "", false
	}
	return info.TenantID, info.CompanyCode, true
}

// SetActiveTenant records the user's preferred active tenant after invite join.
func SetActiveTenant(ctx context.Context, pool *pgxpool.Pool, authUserID string, tenantID int64) error {
	_, err := pool.Exec(ctx, `
		insert into public.user_active_tenant (auth_user_id, tenant_id)
		values ($1::uuid, $2)
		on conflict (auth_user_id) do update
		  set tenant_id = excluded.tenant_id, updated_at = now()`,
		authUserID, tenantID)
	return err
}

// HasPendingApprovalTenant reports whether this auth identity (or email) belongs to a
// self-serve workspace still waiting for Platform Command approval.
func HasPendingApprovalTenant(ctx context.Context, pool *pgxpool.Pool, authUserID, email string) bool {
	email = normalizeEmail(email)
	var n int
	err := pool.QueryRow(ctx, `
		select 1
		from public.users u
		join public.tenants t on t.id = u.tenant_id
		where t.status = 'pending_approval'
		  and (
		    u.auth_user_id = nullif($1, '')::uuid
		    or ($2 <> '' and lower(u.email) = $2)
		  )
		limit 1`, authUserID, email).Scan(&n)
	return err == nil
}

// PendingApprovalTenant returns the pending-approval workspace for this email/auth user.
func PendingApprovalTenant(ctx context.Context, pool *pgxpool.Pool, authUserID, email string) (tenantID int64, companyCode string, ok bool) {
	email = normalizeEmail(email)
	err := pool.QueryRow(ctx, `
		select t.id, t.company_code
		from public.users u
		join public.tenants t on t.id = u.tenant_id
		where t.status = 'pending_approval'
		  and (
		    u.auth_user_id = nullif($1, '')::uuid
		    or ($2 <> '' and lower(u.email) = $2)
		  )
		order by t.id
		limit 1`, authUserID, email).Scan(&tenantID, &companyCode)
	if err != nil {
		return 0, "", false
	}
	return tenantID, companyCode, true
}

// tryAutoLinkInvitedUser is kept as an alias for tests and call sites during rename.
func tryAutoLinkInvitedUser(ctx context.Context, pool *pgxpool.Pool, authUserID, email string) error {
	return tryAutoLinkProvisionedUser(ctx, pool, authUserID, email)
}
