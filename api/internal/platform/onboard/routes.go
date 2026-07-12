package onboard

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/config"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customerregistry"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/plans"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/provision"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

var errCodeExhausted = errors.New("could not allocate unique company code")

type service struct {
	pool      *pgxpool.Pool
	validator *auth.JWTValidator
	cfg       config.Config
}

// RegisterRoutes mounts public platform onboarding endpoints.
func RegisterRoutes(r chi.Router, pool *pgxpool.Pool, cfg config.Config) {
	svc := &service{pool: pool, cfg: cfg}
	if v, err := auth.NewJWTValidator(cfg.SupabaseURL, cfg.SupabaseJWTSecret); err == nil {
		svc.validator = v
	}

	r.Post("/platform/intake", svc.postIntake)
	r.Post("/platform/trial/provision", svc.postTrialProvision)
}

type intakeRequest struct {
	FullName    string `json:"full_name"`
	Email       string `json:"email"`
	CompanyName string `json:"company_name"`
	Mobile      string `json:"mobile"`
}

func (s *service) postIntake(w http.ResponseWriter, r *http.Request) {
	var body intakeRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Validation(w, map[string]string{"body": "Invalid JSON."})
		return
	}
	email := strings.ToLower(strings.TrimSpace(body.Email))
	if email == "" || !strings.Contains(email, "@") {
		response.Validation(w, map[string]string{"email": "Enter a valid email address."})
		return
	}

	var recent int
	if err := s.pool.QueryRow(r.Context(), `
		select count(*)::int from public.platform_customers
		where lower(email) = $1 and created_at > now() - interval '24 hours'`, email).Scan(&recent); err == nil && recent >= 5 {
		response.Err(w, http.StatusTooManyRequests,
			"Too many requests for this email today. Please try again later.", "ERR_RATE_LIMITED")
		return
	}

	leadgenID, _ := customerregistry.LeadgenTenantIDFromCfg(r.Context(), s.pool, s.cfg)
	res, err := customerregistry.UpsertCustomerLead(r.Context(), s.pool, leadgenID, customerregistry.UpsertParams{
		Email:         email,
		FullName:      strings.TrimSpace(body.FullName),
		CompanyName:   strings.TrimSpace(body.CompanyName),
		Mobile:        strings.TrimSpace(body.Mobile),
		EntrySource:   customerregistry.EntrySelfSignup,
		CRMLeadSource: "self_signup",
		LeadNote:      "Self-service signup. Awaiting workspace provisioning.",
	})
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to record signup.", "ERR_INTERNAL")
		return
	}

	response.OK(w, map[string]any{
		"customer_id": res.CustomerID,
		"lead_id":     res.LeadID,
		"created":     res.Created,
	}, "Intake recorded.")
}

func (s *service) postTrialProvision(w http.ResponseWriter, r *http.Request) {
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
	email := strings.ToLower(strings.TrimSpace(claims.Email))
	if email == "" {
		response.Err(w, http.StatusBadRequest, "Token has no email.", "ERR_BAD_REQUEST")
		return
	}
	ctx := r.Context()

	if tid, code, ok := customerregistry.ExistingTrialTenant(ctx, s.pool, email); ok {
		var endsAt *time.Time
		_ = s.pool.QueryRow(ctx, `
			select ends_at from public.platform_subscriptions ps
			join public.platform_customers pc on pc.id = ps.customer_id
			where pc.tenant_id = $1 and ps.plan_kind = 'trial_90d'
			order by ps.created_at desc limit 1`, tid).Scan(&endsAt)
		response.OK(w, map[string]any{
			"tenant_id": tid, "company_code": code, "already_provisioned": true, "trial_ends_at": endsAt,
		}, "Trial workspace already provisioned.")
		return
	}

	fullName := email
	if claims.Email != "" {
		fullName = strings.TrimSpace(claims.Email)
	}

	leadgenID, _ := customerregistry.LeadgenTenantIDFromCfg(ctx, s.pool, s.cfg)
	res, err := customerregistry.UpsertCustomerLead(ctx, s.pool, leadgenID, customerregistry.UpsertParams{
		Email:         email,
		AuthUserID:    claims.Sub,
		FullName:      fullName,
		EntrySource:   customerregistry.EntrySelfSignup,
		CRMLeadSource: "self_signup",
		LeadNote:      "90-day trial provisioning started.",
	})
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to register customer.", "ERR_INTERNAL")
		return
	}

	companyCode, err := s.newTrialCompanyCode(ctx)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to allocate workspace code.", "ERR_INTERNAL")
		return
	}

	displayCompany := fullName + "'s Workspace"
	startsAt := time.Now()
	endsAt := startsAt.Add(customerregistry.TrialDays * 24 * time.Hour)

	tenantID, err := s.createTrialTenant(ctx, trialArgs{
		authUserID:  claims.Sub,
		email:       email,
		fullName:    fullName,
		company:     displayCompany,
		companyCode: companyCode,
	})
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to create trial workspace.", "ERR_INTERNAL")
		return
	}

	_ = customerregistry.LinkTenant(ctx, s.pool, res.CustomerID, tenantID, claims.Sub)
	var trialPlanID *int64
	if tp, err := plans.GetByCode(ctx, s.pool, customerregistry.PlanTrial90d); err == nil {
		trialPlanID = &tp.ID
	}
	_, _ = customerregistry.CreateSubscription(ctx, s.pool, res.CustomerID, tenantID,
		customerregistry.PlanTrial90d, trialPlanID, startsAt, &endsAt, 0, 0, 0, "90-day free trial")

	customerregistry.AppendCRMLeadNote(ctx, s.pool, res.CustomerID,
		"[trial] Email confirmed; trial workspace #"+strconv.FormatInt(tenantID, 10)+" provisioned.")
	_, _ = s.pool.Exec(ctx, `
		update public.crm_leads
		set status = case when status = 'new' then 'qualified' else status end,
		    updated_at = now()
		where tenant_id = (select crm_lead_tenant_id from public.platform_customers where id = $1)
		  and id = (select crm_lead_id from public.platform_customers where id = $1)`, res.CustomerID)

	_, _ = customerregistry.UpdateCustomerUrgency(ctx, s.pool, res.CustomerID, time.Now())

	response.OK(w, map[string]any{
		"tenant_id":     tenantID,
		"company_code":  companyCode,
		"trial_ends_at": endsAt,
		"customer_id":   res.CustomerID,
	}, "Trial workspace ready.")
}

type trialArgs struct {
	authUserID  string
	email       string
	fullName    string
	company     string
	companyCode string
}

func (s *service) createTrialTenant(ctx context.Context, a trialArgs) (int64, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	var tenantID int64
	if err := tx.QueryRow(ctx, `
		insert into public.tenants
		  (company_name, company_code, industry_type, country, currency, status,
		   is_demo, auto_enable_all_modules)
		values ($1, $2, 'general', 'PH', 'PHP', 'active', false, true)
		returning id`,
		a.company, a.companyCode).Scan(&tenantID); err != nil {
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

	if _, err := tx.Exec(ctx, `
		insert into public.tenant_modules (tenant_id, module_code, is_enabled)
		select $1, module_code, true
		from public.module_registry
		where tenant_enableable = true
		on conflict (tenant_id, module_code) do update
		  set is_enabled = true, disabled_at = null`, tenantID); err != nil {
		return 0, err
	}

	if _, err := tx.Exec(ctx, `select public.seed_tenant_base_config($1)`, tenantID); err != nil {
		return 0, err
	}

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

func (s *service) newTrialCompanyCode(ctx context.Context) (string, error) {
	for i := 0; i < 6; i++ {
		buf := make([]byte, 3)
		if _, err := rand.Read(buf); err != nil {
			return "", err
		}
		code := "TRIAL-" + hex.EncodeToString(buf)
		var exists bool
		if err := s.pool.QueryRow(ctx,
			`select exists(select 1 from public.tenants where company_code = $1)`, code).Scan(&exists); err != nil {
			return "", err
		}
		if !exists {
			return code, nil
		}
	}
	return "", errCodeExhausted
}

func bearer(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
}
