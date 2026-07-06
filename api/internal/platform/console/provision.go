package console

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customerregistry"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/plans"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/provision"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type provisionCustomerBody struct {
	Email       string `json:"email"`
	FullName    string `json:"full_name"`
	CompanyName string `json:"company_name"`
	Mobile      string `json:"mobile"`
	PlanKind    string `json:"plan_kind"`
	PlanID      int64  `json:"plan_id"`
}

func (s *service) provisionCustomer(w http.ResponseWriter, r *http.Request) {
	var body provisionCustomerBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Validation(w, map[string]string{"body": "Invalid JSON."})
		return
	}

	email := strings.ToLower(strings.TrimSpace(body.Email))
	if email == "" || !strings.Contains(email, "@") {
		response.Validation(w, map[string]string{"email": "Enter a valid email address."})
		return
	}
	fullName := strings.TrimSpace(body.FullName)
	if fullName == "" {
		response.Validation(w, map[string]string{"full_name": "Full name is required."})
		return
	}

	ctx := r.Context()

	if tid, code, ok := customerregistry.ExistingTrialTenant(ctx, s.pool, email); ok {
		response.OK(w, map[string]any{
			"tenant_id": tid, "company_code": code, "already_provisioned": true,
		}, "Workspace already provisioned for this email.")
		return
	}

	leadgenID, _ := customerregistry.LeadgenTenantIDFromCfg(ctx, s.pool, s.cfg)
	res, err := customerregistry.UpsertCustomerLead(ctx, s.pool, leadgenID, customerregistry.UpsertParams{
		Email:         email,
		FullName:      fullName,
		CompanyName:   strings.TrimSpace(body.CompanyName),
		Mobile:        strings.TrimSpace(body.Mobile),
		EntrySource:   customerregistry.EntryPlatformCreated,
		CRMLeadSource: "platform_provisioned",
		LeadNote:      "Workspace provisioned by platform admin.",
	})
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to register customer.", "ERR_INTERNAL")
		return
	}

	companyCode, err := provision.NewCompanyCode(ctx, s.pool, "BA-")
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to allocate workspace code.", "ERR_INTERNAL")
		return
	}

	displayCompany := strings.TrimSpace(body.CompanyName)
	if displayCompany == "" {
		displayCompany = fullName + "'s Workspace"
	}

	authUserID := provision.LookupAuthUserID(ctx, s.pool, email)
	tenantRes, err := provision.CreateProductionTenant(ctx, s.pool, provision.TenantArgs{
		Email:       email,
		FullName:    fullName,
		Company:     displayCompany,
		CompanyCode: companyCode,
		AuthUserID:  authUserID,
	})
	if err != nil {
		log.Printf("console: provision workspace for %s: %v", email, err)
		msg := "Failed to create workspace."
		if errors.Is(err, provision.ErrEmailConflict) {
			msg = "This email already has a user record in the workspace."
		}
		response.Err(w, http.StatusInternalServerError, msg, "ERR_INTERNAL")
		return
	}

	_ = customerregistry.LinkTenant(ctx, s.pool, res.CustomerID, tenantRes.TenantID, authUserID)

	startsAt := time.Now()
	planKind := strings.TrimSpace(body.PlanKind)
	if planKind == "" && body.PlanID <= 0 {
		planKind = customerregistry.PlanTrial90d
	}

	var subID int64
	var trialEndsAt *time.Time
	var planCode string

	if planKind == customerregistry.PlanTrial90d && body.PlanID <= 0 {
		endsAt := startsAt.Add(customerregistry.TrialDays * 24 * time.Hour)
		trialEndsAt = &endsAt
		var trialPlanID *int64
		if tp, err := plans.GetByCode(ctx, s.pool, customerregistry.PlanTrial90d); err == nil {
			trialPlanID = &tp.ID
		}
		subID, err = customerregistry.CreateSubscription(ctx, s.pool, res.CustomerID, tenantRes.TenantID,
			customerregistry.PlanTrial90d, trialPlanID, startsAt, &endsAt, 0, 0, 0,
			"90-day trial (platform admin provisioned)")
		planCode = customerregistry.PlanTrial90d
	} else {
		plan, ep, err := plans.ResolvePaidPlan(ctx, s.pool, planKind, body.PlanID)
		if err != nil {
			if err == pgx.ErrNoRows {
				response.Validation(w, map[string]string{"plan_kind": "Unknown or inactive plan."})
				return
			}
			response.Validation(w, map[string]string{"plan": err.Error()})
			return
		}
		var endsAt *time.Time
		if plan.LockInMonths > 0 {
			t := startsAt.AddDate(0, plan.LockInMonths, 0)
			endsAt = &t
		}
		monthly := ep.Monthly
		var total float64
		if ep.Total != nil {
			total = *ep.Total
		} else if plan.LockInMonths > 0 {
			total = monthly * float64(plan.LockInMonths)
		}
		notes := "Provisioned by platform admin."
		if ep.PromoActive {
			notes = "Promo: " + ep.PromoLabel + " (platform admin provisioned)"
		}
		pid := plan.ID
		subID, err = customerregistry.CreateSubscription(ctx, s.pool, res.CustomerID, tenantRes.TenantID,
			plan.PlanCode, &pid, startsAt, endsAt, plan.LockInMonths, monthly, total, notes)
		planCode = plan.PlanCode
	}
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to create subscription.", "ERR_INTERNAL")
		return
	}

	note := fmt.Sprintf("[platform] Workspace #%d (%s) provisioned. Plan: %s.",
		tenantRes.TenantID, companyCode, planCode)
	if tenantRes.Invited {
		note += " Owner invited — they must sign in with Google using this email."
	} else {
		note += " Owner linked to existing Google account."
	}
	customerregistry.AppendCRMLeadNote(ctx, s.pool, res.CustomerID, note)
	_, _ = s.pool.Exec(ctx, `
		update public.crm_leads
		set status = case when status = 'new' then 'qualified' else status end,
		    updated_at = now()
		where tenant_id = (select crm_lead_tenant_id from public.platform_customers where id = $1)
		  and id = (select crm_lead_id from public.platform_customers where id = $1)`, res.CustomerID)
	_, _ = customerregistry.UpdateCustomerUrgency(ctx, s.pool, res.CustomerID, time.Now())

	msg := "Workspace provisioned."
	if tenantRes.Invited {
		msg = "Workspace provisioned. User must sign in with Google using " + email + "."
	}

	response.OK(w, map[string]any{
		"customer_id":   res.CustomerID,
		"tenant_id":     tenantRes.TenantID,
		"company_code":  companyCode,
		"subscription_id": subID,
		"plan_kind":     planCode,
		"trial_ends_at": trialEndsAt,
		"invited":       tenantRes.Invited,
		"invite_id":     tenantRes.InviteID,
		"auth_linked":   authUserID != "",
	}, msg)
}
