package console

import (
	"net/http"
	"strings"
	"time"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// workspaceConsoleEmails mirrors auth platform console emails. Kept local to
// avoid importing auth bootstraps into the console read path.
var workspaceConsoleEmails = map[string]bool{
	"bluearmph@gmail.com":     true,
	"itsjohnranel@gmail.com":  true,
	"erpproject116@gmail.com": true,
}

func isWorkspaceGhostOwner(email, fullName string, supportSessionID *int64) bool {
	e := strings.ToLower(strings.TrimSpace(email))
	if workspaceConsoleEmails[e] {
		return true
	}
	if strings.Contains(e, "+support@") {
		return true
	}
	if strings.Contains(strings.ToLower(fullName), "bluearm support") {
		return true
	}
	return supportSessionID != nil && *supportSessionID > 0
}

type workspaceTenantRow struct {
	ID             int64
	Code           string
	Name           string
	Status         string
	OwnerID        *int64
	OwnerEmail     string
	OwnerName      string
	OwnerStatus    string
	OwnerRole      string
	OwnerSupportID *int64
	CreatedAt      time.Time
}

type workspaceCustomerRow struct {
	ID          int64
	Email       string
	FullName    string
	Company     *string
	EntrySource string
	Urgency     string
	TenantID    *int64
	CompanyCode *string
	PlanKind    *string
	SubStatus   *string
	EndsAt      *time.Time
	LeadID      *int64
	CreatedAt   time.Time
	Misjoin     bool
	IsOwner     bool
}

// listCustomerWorkspaces returns workspaces (companies) as the primary unit so
// paying contacts never vanish into a members bucket when owner_user_id drifts.
// Shape: { workspaces: [...], unlinked: [...] }.
func (s *service) listCustomerWorkspaces(w http.ResponseWriter, r *http.Request) {
	q := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	tenantStatus := strings.TrimSpace(r.URL.Query().Get("tenant_status"))

	tenants := []workspaceTenantRow{}
	trows, err := s.pool.Query(r.Context(), `
		select t.id, coalesce(t.company_code,''), coalesce(t.company_name,''),
		       coalesce(t.status,''), t.owner_user_id,
		       coalesce(o.email,''), coalesce(o.full_name,''),
		       coalesce(o.status,''), coalesce(o.tenant_role,''),
		       o.support_session_id, t.created_at
		from public.tenants t
		left join public.users o on o.id = t.owner_user_id
		order by t.id`)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to list workspaces.", "ERR_INTERNAL")
		return
	}
	for trows.Next() {
		var tr workspaceTenantRow
		if err := trows.Scan(&tr.ID, &tr.Code, &tr.Name, &tr.Status, &tr.OwnerID,
			&tr.OwnerEmail, &tr.OwnerName, &tr.OwnerStatus, &tr.OwnerRole,
			&tr.OwnerSupportID, &tr.CreatedAt); err != nil {
			trows.Close()
			response.Err(w, http.StatusInternalServerError, "Failed to read workspaces.", "ERR_INTERNAL")
			return
		}
		tenants = append(tenants, tr)
	}
	trows.Close()

	customers := []workspaceCustomerRow{}
	crows, err := s.pool.Query(r.Context(), `
		select pc.id, pc.email, pc.full_name, pc.company_name, pc.entry_source,
		       pc.urgency_label, pc.tenant_id, t.company_code,
		       ps.plan_kind, ps.status, ps.ends_at,
		       pc.crm_lead_id, pc.created_at,
		       (
		         (pc.entry_source = 'self_signup' or coalesce(t.status,'') = 'pending_approval')
		         and exists (
		           select 1
		           from public.users u
		           join public.user_invites ui on ui.user_id = u.id
		           where lower(u.email) = lower(pc.email)
		             and u.status = 'invited'
		             and u.auth_user_id is null
		             and (pc.tenant_id is null or u.tenant_id <> pc.tenant_id)
		             and ui.revoked_at is null
		             and ui.accepted_at is null
		         )
		       ) as likely_misjoin,
		       exists (
		         select 1
		         from public.users ou
		         where ou.id = t.owner_user_id
		           and lower(ou.email) = lower(pc.email)
		       ) as is_workspace_owner
		from public.platform_customers pc
		left join public.tenants t on t.id = pc.tenant_id
		left join lateral (
		  select plan_kind, status, ends_at
		  from public.platform_subscriptions
		  where customer_id = pc.id
		  order by created_at desc limit 1
		) ps on true
		order by pc.id desc
		limit 500`)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to list workspace people.", "ERR_INTERNAL")
		return
	}
	for crows.Next() {
		var cr workspaceCustomerRow
		if err := crows.Scan(&cr.ID, &cr.Email, &cr.FullName, &cr.Company, &cr.EntrySource,
			&cr.Urgency, &cr.TenantID, &cr.CompanyCode, &cr.PlanKind, &cr.SubStatus,
			&cr.EndsAt, &cr.LeadID, &cr.CreatedAt, &cr.Misjoin, &cr.IsOwner); err != nil {
			crows.Close()
			response.Err(w, http.StatusInternalServerError, "Failed to read workspace people.", "ERR_INTERNAL")
			return
		}
		customers = append(customers, cr)
	}
	crows.Close()

	byTenant := map[int64][]workspaceCustomerRow{}
	unlinked := []map[string]any{}
	for _, c := range customers {
		if c.TenantID == nil {
			unlinked = append(unlinked, workspacePerson(c))
			continue
		}
		byTenant[*c.TenantID] = append(byTenant[*c.TenantID], c)
	}

	workspaces := []map[string]any{}
	for _, t := range tenants {
		if tenantStatus != "" && t.Status != tenantStatus {
			continue
		}
		people := []map[string]any{}
		for _, c := range byTenant[t.ID] {
			people = append(people, workspacePerson(c))
		}
		// Owner user row even when it has no platform_customers contact (support ghosts).
		ownerLower := strings.ToLower(strings.TrimSpace(t.OwnerEmail))
		found := false
		for _, c := range byTenant[t.ID] {
			if strings.ToLower(strings.TrimSpace(c.Email)) == ownerLower && ownerLower != "" {
				found = true
				break
			}
		}
		if !found && ownerLower != "" {
			people = append(people, map[string]any{
				"email": t.OwnerEmail, "full_name": t.OwnerName,
				"tenant_role": t.OwnerRole, "status": t.OwnerStatus,
				"is_workspace_owner": true, "kind": "owner",
				"is_support_ghost": isWorkspaceGhostOwner(t.OwnerEmail, t.OwnerName, t.OwnerSupportID),
			})
		}

		// Billing contact: active subscription holder, else latest ends_at.
		billingIdx := -1
		for i, c := range byTenant[t.ID] {
			if c.SubStatus != nil && *c.SubStatus == "active" {
				if billingIdx < 0 || (c.EndsAt != nil && (byTenant[t.ID][billingIdx].EndsAt == nil || c.EndsAt.After(*byTenant[t.ID][billingIdx].EndsAt))) {
					billingIdx = i
				}
			}
		}
		if billingIdx < 0 {
			for i, c := range byTenant[t.ID] {
				if billingIdx < 0 || (c.EndsAt != nil && (byTenant[t.ID][billingIdx].EndsAt == nil || c.EndsAt.After(*byTenant[t.ID][billingIdx].EndsAt))) {
					billingIdx = i
				}
			}
		}
		var planKind, subStatus *string
		var endsAt *time.Time
		var billingEmail string
		var billingCustomer map[string]any
		if billingIdx >= 0 {
			b := byTenant[t.ID][billingIdx]
			planKind, subStatus, endsAt = b.PlanKind, b.SubStatus, b.EndsAt
			billingEmail = b.Email
			billingCustomer = map[string]any{
				"customer_id": b.ID, "email": b.Email, "full_name": b.FullName,
			}
		}
		var daysLeft *int
		if endsAt != nil {
			d := int(time.Until(*endsAt).Hours() / 24)
			daysLeft = &d
		}
		ownerGhost := isWorkspaceGhostOwner(t.OwnerEmail, t.OwnerName, t.OwnerSupportID)
		ownerDisabled := t.OwnerID == nil || !strings.EqualFold(strings.TrimSpace(t.OwnerStatus), "active")
		billingNotOwner := billingCustomer != nil && ownerLower != "" &&
			strings.ToLower(strings.TrimSpace(billingEmail)) != ownerLower
		likelyMisjoin := false
		hasActiveSub := false
		for _, c := range byTenant[t.ID] {
			if c.Misjoin {
				likelyMisjoin = true
			}
			if c.SubStatus != nil && *c.SubStatus == "active" {
				hasActiveSub = true
			}
		}
		if q != "" && !workspaceMatchesQ(t, people, q) {
			continue
		}
		workspaces = append(workspaces, map[string]any{
			"tenant_id": t.ID, "company_code": t.Code, "company_name": t.Name,
			"tenant_status": t.Status, "created_at": t.CreatedAt,
			"plan_kind": planKind, "subscription_status": subStatus,
			"ends_at": endsAt, "days_remaining": daysLeft,
			"owner": map[string]any{
				"user_id": t.OwnerID, "email": t.OwnerEmail, "full_name": t.OwnerName,
				"status": t.OwnerStatus, "tenant_role": t.OwnerRole,
				"is_support_ghost": ownerGhost,
			},
			"billing_customer": billingCustomer,
			"people":           people,
			"people_count":     len(people),
			"flags": map[string]any{
				"owner_disabled":         ownerDisabled,
				"owner_is_support_ghost": ownerGhost,
				"billing_is_not_owner":   billingNotOwner,
				"likely_misjoin":         likelyMisjoin,
				"no_active_sub":          !hasActiveSub,
			},
		})
	}

	if q != "" {
		kept := unlinked[:0]
		for _, p := range unlinked {
			email, _ := p["email"].(string)
			name, _ := p["full_name"].(string)
			if strings.Contains(strings.ToLower(email+" "+name), q) {
				kept = append(kept, p)
			}
		}
		unlinked = kept
	}

	response.OK(w, map[string]any{"workspaces": workspaces, "unlinked": unlinked}, "OK")
}

func workspacePerson(c workspaceCustomerRow) map[string]any {
	var daysLeft *int
	if c.EndsAt != nil {
		d := int(time.Until(*c.EndsAt).Hours() / 24)
		daysLeft = &d
	}
	kind := "member"
	if c.IsOwner {
		kind = "owner"
	}
	return map[string]any{
		"customer_id": c.ID, "email": c.Email, "full_name": c.FullName,
		"company_name": c.Company, "entry_source": c.EntrySource,
		"urgency_label": c.Urgency, "tenant_id": c.TenantID,
		"company_code": c.CompanyCode, "plan_kind": c.PlanKind,
		"subscription_status": c.SubStatus, "ends_at": c.EndsAt,
		"days_remaining": daysLeft, "likely_misjoin": c.Misjoin,
		"is_workspace_owner": c.IsOwner, "kind": kind,
	}
}

func workspaceMatchesQ(t workspaceTenantRow, people []map[string]any, q string) bool {
	hay := strings.ToLower(t.Code + " " + t.Name + " " + t.OwnerEmail + " " + t.OwnerName)
	if strings.Contains(hay, q) {
		return true
	}
	for _, p := range people {
		email, _ := p["email"].(string)
		name, _ := p["full_name"].(string)
		if strings.Contains(strings.ToLower(email+" "+name), q) {
			return true
		}
	}
	return false
}
