package auth

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// EmailOccupancy describes the primary customer-business claim on an email.
type EmailOccupancy struct {
	Occupied    bool
	TenantID    int64
	CompanyName string
	CompanyCode string
	Status      string // invited | active | disabled
	AuthLinked  bool
}

// CustomerEmailOccupancy returns the primary customer tenant claim for an email.
// Demo and non-demo tenants both count. Bootstrap/platform-console emails are exempt
// (Occupied=false) so ops can keep internal memberships without blocking flows.
// Prefer active+linked, then invited, then disabled; skip cancelled/suspended tenants.
func CustomerEmailOccupancy(ctx context.Context, pool *pgxpool.Pool, email string) (EmailOccupancy, error) {
	email = normalizeEmail(email)
	var out EmailOccupancy
	if email == "" {
		return out, nil
	}
	if isBootstrapSuperadminEmail(email) {
		return out, nil
	}

	err := pool.QueryRow(ctx, `
		select u.tenant_id,
		       coalesce(nullif(trim(t.company_name), ''), t.company_code, 'another business'),
		       coalesce(t.company_code, ''),
		       u.status,
		       u.auth_user_id is not null
		from public.users u
		join public.tenants t on t.id = u.tenant_id
		where lower(u.email) = $1
		  and u.status in ('invited', 'active', 'disabled')
		  and t.status not in ('suspended', 'cancelled')
		order by
		  case
		    when u.status = 'active' and u.auth_user_id is not null then 0
		    when u.status = 'invited' then 1
		    when u.status = 'active' then 2
		    else 3
		  end,
		  u.id
		limit 1`, email).Scan(
		&out.TenantID, &out.CompanyName, &out.CompanyCode, &out.Status, &out.AuthLinked,
	)
	if err == pgx.ErrNoRows {
		return out, nil
	}
	if err != nil {
		return out, err
	}
	out.Occupied = true
	return out, nil
}

// OccupiedElsewhere reports whether email is claimed by a different tenant than forTenantID.
func OccupiedElsewhere(ctx context.Context, pool *pgxpool.Pool, email string, forTenantID int64) (EmailOccupancy, bool, error) {
	occ, err := CustomerEmailOccupancy(ctx, pool, email)
	if err != nil || !occ.Occupied {
		return occ, false, err
	}
	if forTenantID > 0 && occ.TenantID == forTenantID {
		return occ, false, nil
	}
	return occ, true, nil
}

// CrossTenantOccupancyMessage is the user-facing conflict copy for invites / trial.
func CrossTenantOccupancyMessage(occ EmailOccupancy) string {
	name := occ.CompanyName
	if name == "" {
		name = "another business"
	}
	return fmt.Sprintf(
		"This email already belongs to another business (%s). Use a different email, or ask that business's admin to remove access first.",
		name,
	)
}

// OwnBusinessRequiresDifferentEmailMessage is used when trial/demo is blocked.
func OwnBusinessRequiresDifferentEmailMessage(occ EmailOccupancy) string {
	name := occ.CompanyName
	if name == "" {
		name = "another business"
	}
	return fmt.Sprintf(
		"This email already belongs to %s. To open your own business, sign up with a different Google email.",
		name,
	)
}

// CountActiveMembershipsForAuth returns how many active customer user rows this auth UUID has.
func CountActiveMembershipsForAuth(ctx context.Context, pool *pgxpool.Pool, authUserID string) (int, error) {
	if authUserID == "" {
		return 0, nil
	}
	var n int
	err := pool.QueryRow(ctx, `
		select count(*)::int
		from public.users u
		join public.tenants t on t.id = u.tenant_id
		where u.auth_user_id = $1::uuid
		  and u.status = 'active'
		  and t.status not in ('suspended', 'cancelled')`, authUserID).Scan(&n)
	return n, err
}

// PendingInviteInfo is a pending company invite with display fields.
type PendingInviteInfo struct {
	TenantID    int64
	CompanyCode string
	CompanyName string
}

// PendingInviteTenantInfo returns the oldest pending invite for email (with company name).
func PendingInviteTenantInfo(ctx context.Context, pool *pgxpool.Pool, email string) (PendingInviteInfo, bool) {
	email = normalizeEmail(email)
	var info PendingInviteInfo
	if email == "" {
		return info, false
	}
	err := pool.QueryRow(ctx, `
		select u.tenant_id,
		       t.company_code,
		       coalesce(nullif(trim(t.company_name), ''), t.company_code, 'your company')
		from public.users u
		join public.tenants t on t.id = u.tenant_id
		join public.user_invites ui on ui.user_id = u.id
		where lower(u.email) = $1
		  and u.auth_user_id is null
		  and u.status = 'invited'
		  and ui.revoked_at is null
		  and ui.accepted_at is null
		order by ui.invited_at asc nulls last, u.id asc
		limit 1`, email).Scan(&info.TenantID, &info.CompanyCode, &info.CompanyName)
	if err != nil {
		return info, false
	}
	return info, true
}

// ListMultiMembershipEmails returns emails with more than one active customer membership (ops).
func ListMultiMembershipEmails(ctx context.Context, pool *pgxpool.Pool, limit int) ([]map[string]any, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := pool.Query(ctx, `
		select lower(u.email) as email,
		       count(distinct u.tenant_id)::int as tenant_count,
		       array_agg(distinct t.company_code) as company_codes
		from public.users u
		join public.tenants t on t.id = u.tenant_id
		where u.status = 'active'
		  and u.auth_user_id is not null
		  and t.status not in ('suspended', 'cancelled')
		group by lower(u.email)
		having count(distinct u.tenant_id) > 1
		order by tenant_count desc, email
		limit $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]map[string]any, 0)
	for rows.Next() {
		var email string
		var count int
		var codes []string
		if err := rows.Scan(&email, &count, &codes); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{
			"email":         email,
			"tenant_count":  count,
			"company_codes": codes,
		})
	}
	return out, rows.Err()
}
