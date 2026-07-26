package customerregistry

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	EntryDemoSignup      = "demo_signup"
	EntrySelfSignup      = "self_signup"
	EntryInvite          = "invite"
	EntryGoogle          = "google"
	EntryPlatformCreated = "platform_created"

	PlanDemo         = "demo"
	PlanTrial90d     = "trial_90d"
	PlanStandard6Mo  = "standard_6mo"
	PlanStandard12Mo = "standard_12mo"

	SubPending   = "pending"
	SubActive    = "active"
	SubPastDue   = "past_due"
	SubExpired   = "expired"
	SubCancelled = "cancelled"

	Amount6MoMonthly  = 2000.00
	Amount12MoMonthly = 1800.00
	Amount6MoTotal    = 12000.00
	Amount12MoTotal   = 21600.00
	TrialDays         = 90
)

type UpsertParams struct {
	Email        string
	AuthUserID   string
	FullName     string
	CompanyName  string
	Mobile       string
	EntrySource  string
	DemoSignupID *int64
	LeadNote     string
	CRMLeadSource string
}

type UpsertResult struct {
	CustomerID int64
	LeadID     *int64
	Created    bool
}

// UpsertCustomerLead creates or updates platform_customers and ensures a CRM lead in leadgen tenant.
func UpsertCustomerLead(ctx context.Context, pool *pgxpool.Pool, leadgenTenantID int64, p UpsertParams) (UpsertResult, error) {
	email := strings.ToLower(strings.TrimSpace(p.Email))
	if email == "" {
		return UpsertResult{}, fmt.Errorf("email required")
	}
	source := strings.TrimSpace(p.EntrySource)
	if source == "" {
		source = EntrySelfSignup
	}
	crmSource := strings.TrimSpace(p.CRMLeadSource)
	if crmSource == "" {
		crmSource = source
	}

	var result UpsertResult
	err := pool.QueryRow(ctx, `
		insert into public.platform_customers
		  (email, auth_user_id, full_name, company_name, mobile, entry_source, demo_signup_id, urgency_label)
		values ($1, nullif($2,'')::uuid, $3, nullif($4,''), nullif($5,''), $6, $7, 'new_lead')
		on conflict ((lower(email))) do update set
		  auth_user_id = coalesce(platform_customers.auth_user_id, excluded.auth_user_id),
		  full_name = case when excluded.full_name <> '' then excluded.full_name else platform_customers.full_name end,
		  company_name = coalesce(nullif(excluded.company_name,''), platform_customers.company_name),
		  mobile = coalesce(nullif(excluded.mobile,''), platform_customers.mobile),
		  demo_signup_id = coalesce(platform_customers.demo_signup_id, excluded.demo_signup_id),
		  updated_at = now()
		returning id,
		  (xmax = 0) as created`,
		email, strings.TrimSpace(p.AuthUserID), strings.TrimSpace(p.FullName),
		strings.TrimSpace(p.CompanyName), strings.TrimSpace(p.Mobile), source, p.DemoSignupID,
	).Scan(&result.CustomerID, &result.Created)
	if err != nil {
		return UpsertResult{}, err
	}

	var existingLeadID *int64
	_ = pool.QueryRow(ctx, `
		select crm_lead_id from public.platform_customers where id = $1`, result.CustomerID).Scan(&existingLeadID)

	if existingLeadID != nil && *existingLeadID > 0 {
		result.LeadID = existingLeadID
		return result, nil
	}

	if leadgenTenantID <= 0 {
		return result, nil
	}

	note := strings.TrimSpace(p.LeadNote)
	if note == "" {
		note = "Platform intake. Source: " + crmSource + "."
	}
	leadName := strings.TrimSpace(p.FullName)
	if leadName == "" {
		leadName = email
	}

	var leadID int64
	err = pool.QueryRow(ctx, `
		insert into public.crm_leads
		  (tenant_id, lead_name, company_name, email, phone, source, status, pic_name, notes)
		values ($1, $2, nullif($3,''), $4, nullif($5,''), $6, 'new', '', $7)
		returning id`,
		leadgenTenantID, leadName, strings.TrimSpace(p.CompanyName), email,
		strings.TrimSpace(p.Mobile), crmSource, note,
	).Scan(&leadID)
	if err != nil {
		return result, err
	}

	_, err = pool.Exec(ctx, `
		update public.platform_customers
		set crm_lead_tenant_id = $2, crm_lead_id = $3, updated_at = now()
		where id = $1`, result.CustomerID, leadgenTenantID, leadID)
	if err != nil {
		return result, err
	}
	result.LeadID = &leadID
	return result, nil
}

// LinkTenant attaches a provisioned tenant to the customer record.
func LinkTenant(ctx context.Context, pool *pgxpool.Pool, customerID, tenantID int64, authUserID string) error {
	_, err := pool.Exec(ctx, `
		update public.platform_customers
		set tenant_id = $2,
		    auth_user_id = coalesce(auth_user_id, nullif($3,'')::uuid),
		    updated_at = now()
		where id = $1`, customerID, tenantID, strings.TrimSpace(authUserID))
	if err == nil {
		NotifyTenantBillingChanged(tenantID)
	}
	return err
}

// LinkTenantByEmail finds customer by email and links tenant.
func LinkTenantByEmail(ctx context.Context, pool *pgxpool.Pool, email, authUserID string, tenantID int64) error {
	email = strings.ToLower(strings.TrimSpace(email))
	_, err := pool.Exec(ctx, `
		update public.platform_customers
		set tenant_id = $3,
		    auth_user_id = coalesce(auth_user_id, nullif($2,'')::uuid),
		    updated_at = now()
		where lower(email) = $1`, email, strings.TrimSpace(authUserID), tenantID)
	return err
}

// EnsureCustomerForLinkedUser records invite/google autolink without duplicating.
func EnsureCustomerForLinkedUser(ctx context.Context, pool *pgxpool.Pool, leadgenTenantID int64, authUserID, email, fullName, entrySource string, tenantID int64) error {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return nil
	}
	res, err := UpsertCustomerLead(ctx, pool, leadgenTenantID, UpsertParams{
		Email:       email,
		AuthUserID:  authUserID,
		FullName:    fullName,
		EntrySource: entrySource,
		CRMLeadSource: entrySource,
		LeadNote:    fmt.Sprintf("Linked via %s. Tenant #%d.", entrySource, tenantID),
	})
	if err != nil {
		return err
	}
	return LinkTenant(ctx, pool, res.CustomerID, tenantID, authUserID)
}

// CreateSubscription inserts an active subscription row.
func CreateSubscription(ctx context.Context, pool *pgxpool.Pool, customerID, tenantID int64, planKind string, planID *int64, startsAt time.Time, endsAt *time.Time, lockInMonths int, monthly, total float64, notes string) (int64, error) {
	var subID int64
	err := pool.QueryRow(ctx, `
		insert into public.platform_subscriptions
		  (customer_id, tenant_id, plan_kind, plan_id, status, starts_at, ends_at,
		   lock_in_months, monthly_amount, total_contract_amount, notes)
		values ($1, $2, $3, $4, 'active', $5, $6, $7, $8, $9, nullif($10,''))
		returning id`,
		customerID, tenantID, planKind, planID, startsAt, endsAt, lockInMonths, monthly, total, notes,
	).Scan(&subID)
	if err == nil {
		NotifyTenantBillingChanged(tenantID)
	}
	return subID, err
}

// CustomerIDByEmail returns platform customer id if exists.
func CustomerIDByEmail(ctx context.Context, pool *pgxpool.Pool, email string) (int64, bool) {
	email = strings.ToLower(strings.TrimSpace(email))
	var id int64
	err := pool.QueryRow(ctx, `select id from public.platform_customers where lower(email) = $1`, email).Scan(&id)
	if err != nil {
		return 0, false
	}
	return id, true
}

// ExistingTrialTenant returns tenant id if email already has trial or non-demo workspace.
func ExistingTrialTenant(ctx context.Context, pool *pgxpool.Pool, email string) (int64, string, bool) {
	email = strings.ToLower(strings.TrimSpace(email))
	var tenantID int64
	var code string
	err := pool.QueryRow(ctx, `
		select pc.tenant_id, t.company_code
		from public.platform_customers pc
		join public.tenants t on t.id = pc.tenant_id
		where lower(pc.email) = $1
		  and pc.tenant_id is not null
		  and t.status = 'active'
		  and t.is_demo = false
		limit 1`, email).Scan(&tenantID, &code)
	if err != nil {
		if err == pgx.ErrNoRows {
			return 0, "", false
		}
		return 0, "", false
	}
	return tenantID, code, true
}

// AppendCRMLeadNote appends a note to the linked CRM lead.
func AppendCRMLeadNote(ctx context.Context, pool *pgxpool.Pool, customerID int64, note string) {
	var leadTenant, leadID *int64
	_ = pool.QueryRow(ctx, `
		select crm_lead_tenant_id, crm_lead_id from public.platform_customers where id = $1`, customerID).
		Scan(&leadTenant, &leadID)
	if leadTenant == nil || leadID == nil {
		return
	}
	_, _ = pool.Exec(ctx, `
		update public.crm_leads
		set notes = coalesce(notes, '') || E'\n' || $3,
		    updated_at = now()
		where tenant_id = $1 and id = $2`, *leadTenant, *leadID, note)
}
