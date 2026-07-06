package demoonboard

import (
	"context"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/demodata"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customerregistry"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/plans"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/provision"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// postProvision creates (or returns) the demo tenant for the caller's verified
// Supabase identity, seeds it with the industry template in the background, and
// marks the associated CRM lead + signup as verified/provisioned.
func (s *service) postProvision(w http.ResponseWriter, r *http.Request) {
	if !s.cfg.DemoSignupEnabled {
		response.Err(w, http.StatusServiceUnavailable, "Demo signups are currently disabled.", "ERR_UNAVAILABLE")
		return
	}
	if s.validator == nil {
		response.Err(w, http.StatusServiceUnavailable, "Auth is not configured on the server.", "ERR_UNAVAILABLE")
		return
	}

	token := bearer(r)
	if token == "" {
		response.Err(w, http.StatusUnauthorized, "Missing bearer token.", "ERR_UNAUTHORIZED")
		return
	}
	claims, err := s.validator.Parse(token)
	if err != nil || claims.Sub == "" {
		response.Err(w, http.StatusUnauthorized, "Invalid token.", "ERR_UNAUTHORIZED")
		return
	}
	authUserID := claims.Sub
	email := strings.TrimSpace(strings.ToLower(claims.Email))
	if email == "" {
		response.Err(w, http.StatusBadRequest, "Token has no email.", "ERR_BAD_REQUEST")
		return
	}

	ctx := r.Context()

	// Idempotency: if this email already has a provisioned demo, return it.
	if existing, code, ind, ok := s.existingProvisionedTenant(ctx, email); ok {
		response.OK(w, map[string]any{
			"tenant_id": existing, "company_code": code, "industry_code": ind, "already_provisioned": true,
		}, "Demo already provisioned.")
		return
	}

	// Pull the most recent pending signup (leadgen + industry choice) for this email.
	var (
		signupID    int64
		industry    string
		fullName    string
		companyName *string
		leadTenant  *int64
		leadID      *int64
	)
	err = s.pool.QueryRow(ctx, `
		select id, industry_code, full_name, company_name, lead_tenant_id, lead_id
		from public.demo_signups
		where lower(email) = $1 and status in ('pending', 'verified')
		order by created_at desc
		limit 1`, email).Scan(&signupID, &industry, &fullName, &companyName, &leadTenant, &leadID)
	if err != nil {
		if err == pgx.ErrNoRows {
			response.Err(w, http.StatusBadRequest,
				"No pending demo signup for this email. Submit the demo form first.", "ERR_NO_SIGNUP")
			return
		}
		response.Err(w, http.StatusInternalServerError, "Failed to load signup.", "ERR_INTERNAL")
		return
	}

	companyCode, err := s.newCompanyCode(ctx)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to allocate demo workspace.", "ERR_INTERNAL")
		return
	}

	displayCompany := fullName + "'s Demo"
	if companyName != nil && strings.TrimSpace(*companyName) != "" {
		displayCompany = strings.TrimSpace(*companyName)
	}
	expiresAt := time.Now().Add(time.Duration(s.cfg.DemoTTLDays) * 24 * time.Hour)

	tenantID, err := s.createDemoTenant(ctx, createDemoArgs{
		authUserID:  authUserID,
		email:       email,
		fullName:    fullName,
		company:     displayCompany,
		companyCode: companyCode,
		industry:    industry,
		expiresAt:   expiresAt,
	})
	if err != nil {
		log.Printf("demoonboard: provision tenant for %s: %v", email, err)
		s.markSignupFailed(ctx, signupID, err.Error())
		response.Err(w, http.StatusInternalServerError, "Failed to create demo workspace.", "ERR_INTERNAL")
		return
	}

	// Mark signup provisioned + advance the CRM lead to verified/qualified.
	_, _ = s.pool.Exec(ctx, `
		update public.demo_signups
		set status = 'provisioned', auth_user_id = $2::uuid, tenant_id = $3,
		    verified_at = coalesce(verified_at, now()), provisioned_at = now(), updated_at = now(), error = null
		where id = $1`, signupID, authUserID, tenantID)

	if leadTenant != nil && leadID != nil {
		_, _ = s.pool.Exec(ctx, `
			update public.crm_leads
			set status = case when status = 'new' then 'qualified' else status end,
			    notes = coalesce(notes, '') || E'\n[verified] Email confirmed; demo workspace #' || $3::text || ' provisioned.',
			    updated_at = now()
			where tenant_id = $1 and id = $2`, *leadTenant, *leadID, tenantID)
	}

	// Platform registry: link customer + demo subscription.
	custID, hasCust := customerregistry.CustomerIDByEmail(ctx, s.pool, email)
	if !hasCust {
		if tid, ok := s.leadgenTenantID(ctx); ok {
			res, err := customerregistry.UpsertCustomerLead(ctx, s.pool, tid, customerregistry.UpsertParams{
				Email: email, AuthUserID: authUserID, FullName: fullName,
				CompanyName: ptrStr(companyName), EntrySource: customerregistry.EntryDemoSignup,
				DemoSignupID: &signupID, CRMLeadSource: "demo_signup",
			})
			if err == nil {
				custID = res.CustomerID
				hasCust = true
			}
		}
	}
	if hasCust {
		_ = customerregistry.LinkTenant(ctx, s.pool, custID, tenantID, authUserID)
		var demoPlanID *int64
		if dp, err := plans.GetByCode(ctx, s.pool, customerregistry.PlanDemo); err == nil {
			demoPlanID = &dp.ID
		}
		_, _ = customerregistry.CreateSubscription(ctx, s.pool, custID, tenantID,
			customerregistry.PlanDemo, demoPlanID, time.Now(), &expiresAt, 0, 0, 0, "Demo sandbox")
		_, _ = customerregistry.UpdateCustomerUrgency(ctx, s.pool, custID, time.Now())
	}

	// Seed the industry dataset in the background so login is instant; the account
	// is already usable (owner access) and data streams in shortly after.
	go func(tenantID int64, industry, email string) {
		bg, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		defer cancel()
		if _, err := demodata.SeedTenant(bg, s.pool, industry, tenantID); err != nil {
			log.Printf("demoonboard: seed tenant %d (%s) for %s: %v", tenantID, industry, email, err)
		}
	}(tenantID, industry, email)

	response.OK(w, map[string]any{
		"tenant_id":     tenantID,
		"company_code":  companyCode,
		"industry_code": industry,
		"seeding":       true,
	}, "Demo workspace ready. Seeding sample data.")
}

func (s *service) existingProvisionedTenant(ctx context.Context, email string) (int64, string, string, bool) {
	var (
		tenantID int64
		code     string
		industry string
	)
	err := s.pool.QueryRow(ctx, `
		select ds.tenant_id, t.company_code, ds.industry_code
		from public.demo_signups ds
		join public.tenants t on t.id = ds.tenant_id
		where lower(ds.email) = $1 and ds.status = 'provisioned' and ds.tenant_id is not null
		  and t.status = 'active'
		order by ds.provisioned_at desc nulls last
		limit 1`, email).Scan(&tenantID, &code, &industry)
	if err != nil {
		return 0, "", "", false
	}
	return tenantID, code, industry, true
}

func (s *service) markSignupFailed(ctx context.Context, signupID int64, msg string) {
	_, _ = s.pool.Exec(ctx, `
		update public.demo_signups
		set status = 'failed', error = $2, updated_at = now()
		where id = $1`, signupID, msg)
}

type createDemoArgs struct {
	authUserID  string
	email       string
	fullName    string
	company     string
	companyCode string
	industry    string
	expiresAt   time.Time
}

// createDemoTenant atomically creates the tenant, its owner user, enables all
// modules, and sets the caller's active tenant. Returns the new tenant id.
func (s *service) createDemoTenant(ctx context.Context, a createDemoArgs) (int64, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	var tenantID int64
	if err := tx.QueryRow(ctx, `
		insert into public.tenants
		  (company_name, company_code, industry_type, country, currency, status,
		   is_demo, demo_expires_at, auto_enable_all_modules)
		values ($1, $2, $3, 'PH', 'PHP', 'active', true, $4, true)
		returning id`,
		a.company, a.companyCode, a.industry, a.expiresAt).Scan(&tenantID); err != nil {
		return 0, err
	}

	if err := provision.SeedTenantDefaults(ctx, tx, tenantID); err != nil {
		return 0, err
	}

	var userID int64
	if err := tx.QueryRow(ctx, `
		insert into public.users
		  (tenant_id, auth_user_id, email, full_name, status, tenant_role)
		values ($1, $2::uuid, $3, $4, 'active', 'store_admin')
		returning id`,
		tenantID, a.authUserID, a.email, a.fullName).Scan(&userID); err != nil {
		return 0, err
	}

	if _, err := tx.Exec(ctx,
		`update public.tenants set owner_user_id = $2, updated_at = now() where id = $1`,
		tenantID, userID); err != nil {
		return 0, err
	}

	// Enable every tenant-enableable module so the demo shows the full product.
	if _, err := tx.Exec(ctx, `
		insert into public.tenant_modules (tenant_id, module_code, is_enabled)
		select $1, module_code, true
		from public.module_registry
		where tenant_enableable = true
		on conflict (tenant_id, module_code) do update
		  set is_enabled = true, disabled_at = null`, tenantID); err != nil {
		return 0, err
	}

	// Seed the standard chart of accounts so the demo can post Sales/Purchase invoices.
	if _, err := tx.Exec(ctx, `select public.seed_tenant_chart_of_accounts($1)`, tenantID); err != nil {
		return 0, err
	}

	if _, err := tx.Exec(ctx, `select public.seed_tenant_base_config($1)`, tenantID); err != nil {
		return 0, err
	}

	// Default the user's active business to this demo tenant.
	if _, err := tx.Exec(ctx, `
		insert into public.user_active_tenant (auth_user_id, tenant_id)
		values ($1::uuid, $2)
		on conflict (auth_user_id) do update
		  set tenant_id = excluded.tenant_id, updated_at = now()`,
		a.authUserID, tenantID); err != nil {
		return 0, err
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return tenantID, nil
}

func bearer(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
}

func ptrStr(s *string) string {
	if s == nil {
		return ""
	}
	return strings.TrimSpace(*s)
}
