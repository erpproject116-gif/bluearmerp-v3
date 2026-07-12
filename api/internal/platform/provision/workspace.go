package provision

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrCodeExhausted = errors.New("could not allocate unique company code")
	ErrEmailConflict = errors.New("email already has a user in this workspace")
)

// TenantArgs configures production (non-demo) tenant creation.
type TenantArgs struct {
	Email           string
	FullName        string
	Company         string
	CompanyCode     string
	AuthUserID      string
	InvitedByUserID *int64
}

// TenantResult is returned after a workspace is created.
type TenantResult struct {
	TenantID    int64
	UserID      int64
	CompanyCode string
	Invited     bool
	InviteID    *int64
}

// NewCompanyCode allocates a unique tenant company code with the given prefix.
func NewCompanyCode(ctx context.Context, pool *pgxpool.Pool, prefix string) (string, error) {
	if prefix == "" {
		prefix = "BA-"
	}
	for i := 0; i < 6; i++ {
		buf := make([]byte, 3)
		if _, err := rand.Read(buf); err != nil {
			return "", err
		}
		code := prefix + strings.ToUpper(hex.EncodeToString(buf))
		var exists bool
		if err := pool.QueryRow(ctx,
			`select exists(select 1 from public.tenants where company_code = $1)`, code).Scan(&exists); err != nil {
			return "", err
		}
		if !exists {
			return code, nil
		}
	}
	return "", ErrCodeExhausted
}

// LookupAuthUserID returns an existing Supabase auth id for the email, if any.
func LookupAuthUserID(ctx context.Context, pool *pgxpool.Pool, email string) string {
	email = strings.ToLower(strings.TrimSpace(email))
	var id *string
	_ = pool.QueryRow(ctx, `
		select auth_user_id::text from public.users
		where lower(email) = $1 and auth_user_id is not null
		limit 1`, email).Scan(&id)
	if id != nil {
		return strings.TrimSpace(*id)
	}
	return ""
}

// CreateProductionTenant creates a non-demo tenant, owner user, and modules (empty chart of accounts).
// When AuthUserID is empty the owner is created as invited with a pending user_invites row.
func CreateProductionTenant(ctx context.Context, pool *pgxpool.Pool, a TenantArgs) (TenantResult, error) {
	email := strings.ToLower(strings.TrimSpace(a.Email))
	fullName := strings.TrimSpace(a.FullName)
	if fullName == "" {
		fullName = email
	}
	authID := strings.TrimSpace(a.AuthUserID)
	if authID == "" {
		authID = LookupAuthUserID(ctx, pool, email)
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return TenantResult{}, err
	}
	defer tx.Rollback(ctx)

	var tenantID int64
	if err := tx.QueryRow(ctx, `
		insert into public.tenants
		  (company_name, company_code, industry_type, country, currency, status,
		   is_demo, auto_enable_all_modules)
		values ($1, $2, 'general', 'PH', 'PHP', 'active', false, true)
		returning id`,
		a.Company, a.CompanyCode).Scan(&tenantID); err != nil {
		return TenantResult{}, err
	}

	if err := SeedTenantDefaults(ctx, tx, tenantID); err != nil {
		return TenantResult{}, err
	}

	var result TenantResult
	result.CompanyCode = a.CompanyCode

	if authID != "" {
		if err := tx.QueryRow(ctx, `
			insert into public.users
			  (tenant_id, auth_user_id, email, full_name, status, tenant_role)
			values ($1, $2::uuid, $3, $4, 'active', 'store_admin')
			returning id`,
			tenantID, authID, email, fullName).Scan(&result.UserID); err != nil {
			return TenantResult{}, err
		}
		if _, err := tx.Exec(ctx, `
			insert into public.user_active_tenant (auth_user_id, tenant_id)
			values ($1::uuid, $2)
			on conflict (auth_user_id) do update
			  set tenant_id = excluded.tenant_id, updated_at = now()`,
			authID, tenantID); err != nil {
			return TenantResult{}, err
		}
	} else {
		var existingStatus string
		err := tx.QueryRow(ctx, `
			select status from public.users
			where tenant_id = $1 and lower(email) = $2`, tenantID, email).Scan(&existingStatus)
		if err == nil {
			return TenantResult{}, ErrEmailConflict
		}
		if err != pgx.ErrNoRows {
			return TenantResult{}, err
		}

		if err := tx.QueryRow(ctx, `
			insert into public.users (tenant_id, email, full_name, status, tenant_role)
			values ($1, $2, $3, 'invited', 'store_admin')
			returning id`, tenantID, email, fullName).Scan(&result.UserID); err != nil {
			return TenantResult{}, err
		}

		var inviteID int64
		if err := tx.QueryRow(ctx, `
			insert into public.user_invites (tenant_id, user_id, email, full_name, role_code, invited_by_user_id)
			values ($1, $2, $3, $4, 'store_admin', $5)
			returning id`,
			tenantID, result.UserID, email, fullName, a.InvitedByUserID).Scan(&inviteID); err != nil {
			return TenantResult{}, err
		}
		result.Invited = true
		result.InviteID = &inviteID
	}

	if _, err := tx.Exec(ctx,
		`update public.tenants set owner_user_id = $2, updated_at = now() where id = $1`,
		tenantID, result.UserID); err != nil {
		return TenantResult{}, err
	}

	if _, err := tx.Exec(ctx, `
		insert into public.tenant_modules (tenant_id, module_code, is_enabled)
		select $1, module_code, true
		from public.module_registry
		where tenant_enableable = true
		on conflict (tenant_id, module_code) do update
		  set is_enabled = true, disabled_at = null`, tenantID); err != nil {
		return TenantResult{}, err
	}

	if _, err := tx.Exec(ctx, `select public.seed_tenant_base_config($1)`, tenantID); err != nil {
		return TenantResult{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return TenantResult{}, err
	}

	result.TenantID = tenantID
	return result, nil
}
