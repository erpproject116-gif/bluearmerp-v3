package auth

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNoPlatformProfile = errors.New("no platform profile")

// platformSignInWriteInterval bounds how often last_signed_in_at is re-stamped.
// It is presence bookkeeping, not an audit trail, so one write per window is enough.
const platformSignInWriteInterval = 15 * time.Minute

// shouldStampPlatformSignIn reports whether last_signed_in_at is stale enough to rewrite.
func shouldStampPlatformSignIn(last *time.Time, now time.Time) bool {
	return last == nil || now.Sub(*last) >= platformSignInWriteInterval
}

// Platform identity fields attached to TenantUser for Command Center.
// PlatformUserID == 0 means the caller has no platform membership.

type PlatformIdentity struct {
	PlatformUserID int64
	Role           string
	Permissions    map[string]bool
	PlatformOnly   bool // authenticated without a tenant membership
}

func (tu TenantUser) HasPlatformPermission(code string) bool {
	if tu.IsPlatformSuperadmin || isBootstrapSuperadminEmail(tu.Email) {
		return true
	}
	if tu.PlatformPermissions == nil {
		return false
	}
	return tu.PlatformPermissions[code]
}

func (tu TenantUser) CanAccessPlatformCommand() bool {
	if isBootstrapSuperadminEmail(tu.Email) || tu.IsPlatformSuperadmin {
		return true
	}
	return tu.HasPlatformPermission("platform.command.read") ||
		tu.HasPlatformPermission("platform.customers.read")
}

// loadPlatformIdentity loads platform_users + permissions for an auth UUID.
func loadPlatformIdentity(ctx context.Context, pool *pgxpool.Pool, authUserID, email string) (PlatformIdentity, error) {
	var id int64
	var role string
	var active bool
	var lastSignedIn *time.Time
	err := pool.QueryRow(ctx, `
		select id, role, is_active, last_signed_in_at
		from public.platform_users
		where auth_user_id = $1::uuid
		limit 1`, authUserID).Scan(&id, &role, &active, &lastSignedIn)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Accept pending invite on first Google sign-in.
			if email != "" {
				if accepted, aerr := acceptPlatformInvite(ctx, pool, authUserID, email); aerr == nil && accepted.PlatformUserID > 0 {
					return accepted, nil
				}
			}
			return PlatformIdentity{}, ErrNoPlatformProfile
		}
		return PlatformIdentity{}, err
	}
	if !active {
		return PlatformIdentity{}, ErrNoPlatformProfile
	}
	perms, err := loadPlatformRolePermissions(ctx, pool, role)
	if err != nil {
		return PlatformIdentity{}, err
	}
	if shouldStampPlatformSignIn(lastSignedIn, time.Now()) {
		_, _ = pool.Exec(ctx, `update public.platform_users set last_signed_in_at = now() where id = $1`, id)
	}
	return PlatformIdentity{
		PlatformUserID: id,
		Role:           role,
		Permissions:    perms,
	}, nil
}

func loadPlatformRolePermissions(ctx context.Context, pool *pgxpool.Pool, role string) (map[string]bool, error) {
	out := map[string]bool{}
	rows, err := pool.Query(ctx, `
		select permission_code
		from public.platform_role_permissions
		where role = $1`, role)
	if err != nil {
		// Table may not exist before migration 179.
		if strings.Contains(err.Error(), "platform_role_permissions") {
			if role == "superadmin" {
				return map[string]bool{"platform.command.read": true, "platform.customers.read": true, "platform.plans.read": true}, nil
			}
			return out, nil
		}
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var code string
		if err := rows.Scan(&code); err != nil {
			return nil, err
		}
		out[code] = true
	}
	return out, rows.Err()
}

func acceptPlatformInvite(ctx context.Context, pool *pgxpool.Pool, authUserID, email string) (PlatformIdentity, error) {
	email = normalizeEmail(email)
	tx, err := pool.Begin(ctx)
	if err != nil {
		return PlatformIdentity{}, err
	}
	defer tx.Rollback(ctx)

	var inviteID int64
	var fullName, role string
	err = tx.QueryRow(ctx, `
		select id, coalesce(full_name,''), role
		from public.platform_user_invites
		where lower(email) = $1
		  and accepted_at is null
		  and revoked_at is null
		  and expires_at > now()
		order by id desc
		limit 1
		for update`, email).Scan(&inviteID, &fullName, &role)
	if err != nil {
		return PlatformIdentity{}, err
	}
	if fullName == "" {
		fullName = email
	}

	var platformUserID int64
	err = tx.QueryRow(ctx, `
		insert into public.platform_users (auth_user_id, email, full_name, role, is_active, last_signed_in_at)
		values ($1::uuid, $2, $3, $4, true, now())
		on conflict (auth_user_id) do update
		set email = excluded.email,
		    full_name = excluded.full_name,
		    role = excluded.role,
		    is_active = true,
		    last_signed_in_at = now()
		returning id`, authUserID, email, fullName, role).Scan(&platformUserID)
	if err != nil {
		return PlatformIdentity{}, err
	}
	_, err = tx.Exec(ctx, `
		update public.platform_user_invites
		set accepted_at = now()
		where id = $1`, inviteID)
	if err != nil {
		return PlatformIdentity{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return PlatformIdentity{}, err
	}
	perms, _ := loadPlatformRolePermissions(ctx, pool, role)
	return PlatformIdentity{
		PlatformUserID: platformUserID,
		Role:           role,
		Permissions:    perms,
		PlatformOnly:   true,
	}, nil
}

// resolvePlatformOnlyUser builds a synthetic TenantUser for staff with platform access but no tenant membership.
func resolvePlatformOnlyUser(ctx context.Context, pool *pgxpool.Pool, authUserID, email string) (TenantUser, error) {
	ident, err := loadPlatformIdentity(ctx, pool, authUserID, email)
	if err != nil {
		return TenantUser{}, err
	}
	var fullName string
	_ = pool.QueryRow(ctx, `select full_name from public.platform_users where id = $1`, ident.PlatformUserID).Scan(&fullName)
	if fullName == "" {
		fullName = email
	}
	tu := TenantUser{
		AuthUserID:           authUserID,
		AppUserID:            0,
		TenantID:             0,
		Email:                normalizeEmail(email),
		FullName:             fullName,
		TenantRole:           "platform",
		IsPlatformSuperadmin: ident.Role == "superadmin",
		PlatformUserID:       ident.PlatformUserID,
		PlatformRole:         ident.Role,
		PlatformPermissions:  ident.Permissions,
		PlatformOnly:         true,
		permissions:          map[string]string{},
		submitPerms:          map[string]bool{},
	}
	return tu, nil
}

func attachPlatformIdentity(ctx context.Context, pool *pgxpool.Pool, tu *TenantUser) {
	ident, err := loadPlatformIdentity(ctx, pool, tu.AuthUserID, tu.Email)
	if err != nil {
		// Backward-compat: allowlisted bootstrap emails with platform_users.superadmin still work.
		if tu.IsPlatformSuperadmin && isBootstrapSuperadminEmail(tu.Email) {
			tu.PlatformPermissions = map[string]bool{
				"platform.command.read": true,
				"platform.customers.read": true,
				"platform.customers.write": true,
				"platform.users.read": true,
				"platform.tickets.read": true,
				"platform.tickets.write": true,
				"platform.onboarding.read": true,
				"platform.activity.read": true,
				"platform.access_logs.read": true,
				"platform.followups.read": true,
				"platform.followups.write": true,
				"platform.plans.read": true,
				"platform.plans.write": true,
				"platform.billing.write": true,
				"platform.provisioning.write": true,
				"platform.staff.manage": true,
			}
			tu.PlatformRole = "superadmin"
		}
		return
	}
	tu.PlatformUserID = ident.PlatformUserID
	tu.PlatformRole = ident.Role
	tu.PlatformPermissions = ident.Permissions
	tu.IsPlatformSuperadmin = ident.Role == "superadmin" || tu.IsPlatformSuperadmin
}
