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

const bluearmOperatorTenantCode = "BLUEARM"
const bluearmStoreOwnerEmail = "bluearmph@gmail.com"

// platformConsoleOwnerEmails are platform superadmins (same Command Center +
// unrestricted ERP as itsjohnranel@gmail.com). bluearmph@gmail.com is also the
// store owner of every tenant they belong to. Must match seed-platform-owners.sql.
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

// IsOperatorCompanyCode reports whether this is the Bluearm operator tenant (BLUEARM).
func IsOperatorCompanyCode(code string) bool {
	return strings.EqualFold(strings.TrimSpace(code), bluearmOperatorTenantCode)
}

// IsOperatorStoreOwnerEmail reports whether email is the required BLUEARM store owner.
func IsOperatorStoreOwnerEmail(email string) bool {
	return normalizeEmail(email) == bluearmStoreOwnerEmail
}

// IsPlatformConsoleEmail reports whether email may use the Platform console.
func IsPlatformConsoleEmail(email string) bool {
	return isBootstrapSuperadminEmail(email)
}

// applyBootstrapOwnerFlags grants allowlisted emails the same in-request
// capabilities as a platform superadmin, even if DB rows are still catching up.
func applyBootstrapOwnerFlags(tu *TenantUser) {
	if tu == nil || !isBootstrapSuperadminEmail(tu.Email) {
		return
	}
	tu.IsPlatformSuperadmin = true
	if tu.PlatformRole == "" {
		tu.PlatformRole = "superadmin"
	}
	// bluearmph is the store owner of the business they are signed into.
	if normalizeEmail(tu.Email) == bluearmStoreOwnerEmail && tu.TenantID > 0 {
		tu.IsTenantOwner = true
		tu.IsStoreAdmin = true
	}
}

func (tu TenantUser) hasOwnerCapability() bool {
	return tu.IsPlatformSuperadmin || tu.IsTenantOwner || isBootstrapSuperadminEmail(tu.Email)
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

	// Superadmins keep BLUEARM membership + platform_users.superadmin.
	// Do not consume a customer-store invite as their primary identity.
	if isBootstrapSuperadminEmail(email) {
		return ensureBootstrapFullAccess(ctx, pool, authUserID, email, "")
	}

	existing, err := CountActiveMembershipsForAuth(ctx, pool, authUserID)
	if err != nil {
		return err
	}
	if existing > 0 {
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

	return tx.Commit(ctx)
}

func ensureBootstrapFullAccess(ctx context.Context, pool *pgxpool.Pool, authUserID, email, fullName string) error {
	email = normalizeEmail(email)
	if email == "" || authUserID == "" || !isBootstrapSuperadminEmail(email) {
		return ErrNoTenantProfile
	}
	if strings.TrimSpace(fullName) == "" {
		fullName = email
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if err := ensureBootstrapTenantMembership(ctx, tx, authUserID, email, fullName); err != nil {
		return err
	}
	if err := ensureBootstrapPlatformUser(ctx, tx, authUserID, email, fullName); err != nil {
		return err
	}
	if email == bluearmStoreOwnerEmail {
		if err := ensureStoreOwnerMemberships(ctx, tx, authUserID, email); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func ensureBootstrapTenantMembership(ctx context.Context, tx pgx.Tx, authUserID, email, fullName string) error {
	var tenantID int64
	err := tx.QueryRow(ctx, `
		select id from public.tenants
		where company_code = $1
		limit 1`, bluearmOperatorTenantCode).Scan(&tenantID)
	if err == pgx.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}

	_, _ = tx.Exec(ctx, `
		insert into public.tenant_roles (
		  tenant_id, role_code, role_name, description, is_system,
		  can_manage_users, can_manage_form_settings, sort_order
		)
		values ($1, 'store_admin', 'Store Admin', 'Can manage users and form settings', true, true, true, 20)
		on conflict (tenant_id, role_code) do nothing`, tenantID)

	if _, err := tx.Exec(ctx, `
		update public.users
		set auth_user_id = null, updated_at = now()
		where tenant_id = $1
		  and auth_user_id = $2::uuid
		  and lower(email) <> $3`, tenantID, authUserID, email); err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, `
		insert into public.users (tenant_id, auth_user_id, email, full_name, status, tenant_role)
		values ($1, $2::uuid, $3, $4, 'active', 'store_admin')
		on conflict (tenant_id, email) do update
		set auth_user_id = excluded.auth_user_id,
		    status = 'active',
		    tenant_role = 'store_admin',
		    full_name = case
		      when nullif(trim(public.users.full_name), '') is null then excluded.full_name
		      else public.users.full_name
		    end,
		    auth_revision = public.users.auth_revision + 1,
		    updated_at = now()`,
		tenantID, authUserID, email, fullName); err != nil {
		return err
	}

	_, _ = tx.Exec(ctx, `
		insert into public.user_active_tenant (auth_user_id, tenant_id)
		values ($1::uuid, $2)
		on conflict (auth_user_id) do nothing`,
		authUserID, tenantID)
	return nil
}

// ensureStoreOwnerMemberships makes bluearmph@gmail.com the tenant owner (store
// owner) of every company they already belong to, with store_admin on those rows.
func ensureStoreOwnerMemberships(ctx context.Context, tx pgx.Tx, authUserID, email string) error {
	if _, err := tx.Exec(ctx, `
		update public.users u
		set tenant_role = 'store_admin',
		    status = 'active',
		    updated_at = now()
		where u.auth_user_id = $1::uuid
		  and lower(u.email) = $2
		  and u.status in ('active', 'invited')
		  and (u.tenant_role is distinct from 'store_admin' or u.status is distinct from 'active')`,
		authUserID, email); err != nil {
		return err
	}

	_, err := tx.Exec(ctx, `
		update public.tenants t
		set owner_user_id = u.id, updated_at = now()
		from public.users u
		where u.auth_user_id = $1::uuid
		  and lower(u.email) = $2
		  and u.status = 'active'
		  and t.id = u.tenant_id
		  and t.owner_user_id is distinct from u.id`,
		authUserID, email)
	return err
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
	return err
}

// repairBootstrapPlatformAccess restores superadmin ERP + platform access
// (BLUEARM store_admin, platform_users.superadmin, and store owner on every
// tenant bluearmph@gmail.com already belongs to).
func repairBootstrapPlatformAccess(ctx context.Context, pool *pgxpool.Pool, tu TenantUser) error {
	if !isBootstrapSuperadminEmail(tu.Email) {
		return nil
	}
	return ensureBootstrapFullAccess(ctx, pool, tu.AuthUserID, tu.Email, tu.FullName)
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
