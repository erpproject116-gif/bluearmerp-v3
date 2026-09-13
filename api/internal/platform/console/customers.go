package console

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customerregistry"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// customerAccessFlags labels product owners / platform superadmins and the BLUEARM operator workspace.
func customerAccessFlags(email string, companyCode string) map[string]any {
	email = strings.ToLower(strings.TrimSpace(email))
	isPO := auth.IsPlatformConsoleEmail(email)
	out := map[string]any{
		"is_product_owner":       isPO,
		"is_platform_superadmin": isPO,
		"is_operator_workspace":  auth.IsOperatorCompanyCode(companyCode),
	}
	if isPO {
		out["access_label"] = "Product owner / superadmin"
	}
	if auth.IsOperatorCompanyCode(companyCode) {
		out["workspace_label"] = "Operator (BLUEARM)"
	}
	return out
}

func (s *service) listCustomers(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	label := strings.TrimSpace(r.URL.Query().Get("urgency_label"))
	tenantStatus := strings.TrimSpace(r.URL.Query().Get("tenant_status"))
	limit := 50
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}

	args := []any{limit}
	where := "where 1=1"
	if q != "" {
		args = append(args, "%"+strings.ToLower(q)+"%")
		where += fmt.Sprintf(" and (lower(pc.email) like $%d or lower(pc.full_name) like $%d or lower(coalesce(pc.company_name,'')) like $%d)", len(args), len(args), len(args))
	}
	if label != "" {
		args = append(args, label)
		where += fmt.Sprintf(" and pc.urgency_label = $%d", len(args))
	}
	if tenantStatus != "" {
		args = append(args, tenantStatus)
		where += fmt.Sprintf(" and t.status = $%d", len(args))
	}

	query := `
		select pc.id, pc.email, pc.full_name, pc.company_name, pc.entry_source,
		       pc.urgency_label, pc.tenant_id, t.company_code, coalesce(t.status, '') as tenant_status,
		       ps.plan_kind, ps.status as sub_status, ps.ends_at,
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
		       ) as likely_misjoin
		from public.platform_customers pc
		left join public.tenants t on t.id = pc.tenant_id
		left join lateral (
		  select plan_kind, status, ends_at
		  from public.platform_subscriptions
		  where customer_id = pc.id
		  order by created_at desc limit 1
		) ps on true
		` + where + `
		order by
		  case when t.status = 'pending_approval' then 0 else 1 end,
		  pc.urgency_updated_at desc, pc.id desc
		limit $1`

	rows, err := s.pool.Query(r.Context(), query, args...)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to list customers.", "ERR_INTERNAL")
		return
	}
	defer rows.Close()

	out := make([]map[string]any, 0)
	for rows.Next() {
		var (
			id                                                      int64
			email, fullName, entrySource, urgency, tenantStatusVal  string
			company, companyCode, planKind, subStatus               *string
			tenantID, leadID                                        *int64
			endsAt                                                  *time.Time
			createdAt                                               time.Time
			likelyMisjoin                                           bool
		)
		if err := rows.Scan(&id, &email, &fullName, &company, &entrySource, &urgency, &tenantID,
			&companyCode, &tenantStatusVal, &planKind, &subStatus, &endsAt, &leadID, &createdAt, &likelyMisjoin); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to read customer.", "ERR_INTERNAL")
			return
		}
		row := map[string]any{
			"id": id, "email": email, "full_name": fullName, "company_name": company,
			"entry_source": entrySource, "urgency_label": urgency,
			"tenant_id": tenantID, "company_code": companyCode, "tenant_status": tenantStatusVal,
			"plan_kind": planKind, "subscription_status": subStatus, "ends_at": endsAt,
			"crm_lead_id": leadID, "created_at": createdAt, "likely_misjoin": likelyMisjoin,
		}
		code := ""
		if companyCode != nil {
			code = *companyCode
		}
		for k, v := range customerAccessFlags(email, code) {
			row[k] = v
		}
		if endsAt != nil {
			days := int(time.Until(*endsAt).Hours() / 24)
			row["days_remaining"] = days
		}
		out = append(out, row)
	}
	response.OK(w, map[string]any{"customers": out}, "OK")
}

func (s *service) getCustomer(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		response.Validation(w, map[string]string{"id": "Invalid customer id."})
		return
	}

	var (
		email, fullName, entrySource, urgency, mobile string
		company, authUserID                           *string
		tenantID, leadID, leadTenantID                *int64
		onboarding                                    []byte
		createdAt                                     time.Time
	)
	err = s.pool.QueryRow(r.Context(), `
		select email, full_name, company_name, coalesce(mobile,''), entry_source, urgency_label,
		       tenant_id, auth_user_id::text, crm_lead_id, crm_lead_tenant_id,
		       onboarding_progress, created_at
		from public.platform_customers where id = $1`, id).Scan(
		&email, &fullName, &company, &mobile, &entrySource, &urgency,
		&tenantID, &authUserID, &leadID, &leadTenantID, &onboarding, &createdAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			response.Err(w, http.StatusNotFound, "Customer not found.", "ERR_NOT_FOUND")
			return
		}
		log.Printf("console: get customer %d: %v", id, err)
		response.Err(w, http.StatusInternalServerError, "Failed to load customer.", "ERR_INTERNAL")
		return
	}

	subRows, _ := s.pool.Query(r.Context(), `
		select id, plan_kind, status, starts_at, ends_at, lock_in_months,
		       monthly_amount, total_contract_amount, notes, created_at
		from public.platform_subscriptions where customer_id = $1 order by created_at desc`, id)
	subs := scanSubscriptions(subRows)

	var tenantStatus, companyCode string
	if tenantID != nil {
		_ = s.pool.QueryRow(r.Context(), `
			select coalesce(status,''), coalesce(company_code,'') from public.tenants where id = $1`, *tenantID).
			Scan(&tenantStatus, &companyCode)
	}

	likelyMisjoin := false
	if entrySource == customerregistry.EntrySelfSignup || tenantStatus == "pending_approval" {
		_ = s.pool.QueryRow(r.Context(), `
			select exists (
			  select 1
			  from public.users u
			  join public.user_invites ui on ui.user_id = u.id
			  where lower(u.email) = lower($1)
			    and u.status = 'invited'
			    and u.auth_user_id is null
			    and ($2::bigint is null or u.tenant_id <> $2)
			    and ui.revoked_at is null
			    and ui.accepted_at is null
			)`, email, tenantID).Scan(&likelyMisjoin)
	}

	invRows, _ := s.pool.Query(r.Context(), `
		select i.id, i.invoice_no, i.period_start, i.period_end, i.amount, i.currency,
		       i.due_date, i.paid_at, i.status, i.notes, s.plan_kind
		from public.platform_subscription_invoices i
		join public.platform_subscriptions s on s.id = i.subscription_id
		where s.customer_id = $1 order by i.due_date desc`, id)
	invoices := scanInvoices(invRows)

	cust := map[string]any{
		"id": id, "email": email, "full_name": fullName, "company_name": company,
		"mobile": mobile, "entry_source": entrySource, "urgency_label": urgency,
		"tenant_id": tenantID, "auth_user_id": authUserID,
		"tenant_status": tenantStatus, "company_code": companyCode,
		"crm_lead_id": leadID, "crm_lead_tenant_id": leadTenantID,
		"onboarding_progress": json.RawMessage(onboarding), "created_at": createdAt,
		"likely_misjoin": likelyMisjoin,
	}
	for k, v := range customerAccessFlags(email, companyCode) {
		cust[k] = v
	}

	response.OK(w, map[string]any{
		"customer":      cust,
		"subscriptions": subs,
		"invoices":      invoices,
	}, "OK")
}

type createCustomerBody struct {
	Email       string `json:"email"`
	FullName    string `json:"full_name"`
	CompanyName string `json:"company_name"`
	Mobile      string `json:"mobile"`
}

func (s *service) createCustomer(w http.ResponseWriter, r *http.Request) {
	var body createCustomerBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Validation(w, map[string]string{"body": "Invalid JSON."})
		return
	}
	email := strings.ToLower(strings.TrimSpace(body.Email))
	if email == "" {
		response.Validation(w, map[string]string{"email": "Email required."})
		return
	}
	leadgenID, _ := customerregistry.LeadgenTenantIDFromCfg(r.Context(), s.pool, s.cfg)
	res, err := customerregistry.UpsertCustomerLead(r.Context(), s.pool, leadgenID, customerregistry.UpsertParams{
		Email:         email,
		FullName:      body.FullName,
		CompanyName:   body.CompanyName,
		Mobile:        body.Mobile,
		EntrySource:   customerregistry.EntryPlatformCreated,
		CRMLeadSource: "platform_created",
		LeadNote:      "Created by platform admin.",
	})
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to create customer.", "ERR_INTERNAL")
		return
	}
	response.OK(w, map[string]any{"customer_id": res.CustomerID, "lead_id": res.LeadID}, "Created.")
}

type patchCustomerBody struct {
	FullName    *string `json:"full_name"`
	CompanyName *string `json:"company_name"`
	Mobile      *string `json:"mobile"`
}

func (s *service) patchCustomer(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		response.Validation(w, map[string]string{"id": "Invalid customer id."})
		return
	}
	var body patchCustomerBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Validation(w, map[string]string{"body": "Invalid JSON."})
		return
	}
	tag, err := s.pool.Exec(r.Context(), `
		update public.platform_customers set
		  full_name = coalesce($2, full_name),
		  company_name = coalesce($3, company_name),
		  mobile = coalesce($4, mobile),
		  updated_at = now()
		where id = $1`,
		id, body.FullName, body.CompanyName, body.Mobile)
	if err != nil || tag.RowsAffected() == 0 {
		response.Err(w, http.StatusNotFound, "Customer not found.", "ERR_NOT_FOUND")
		return
	}
	response.OK(w, map[string]any{"id": id}, "Updated.")
}

// deleteCustomer removes the Platform Command contact. If a workspace is still linked,
// wipe it first (same rules as wipeCustomer) then delete the contact row.
func (s *service) deleteCustomer(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		response.Validation(w, map[string]string{"id": "Invalid customer id."})
		return
	}
	var body struct {
		ConfirmEmail            string `json:"confirm_email"`
		AcknowledgeIrreversible bool   `json:"acknowledge_irreversible"`
		WipeIfLinked            bool   `json:"wipe_if_linked"`
		ConfirmCompanyCode      string `json:"confirm_company_code"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if !body.AcknowledgeIrreversible {
		response.Validation(w, map[string]string{"acknowledge_irreversible": "Confirm irreversible remove."})
		return
	}

	var email string
	var tenantID *int64
	var companyCode, tenantStatus string
	err = s.pool.QueryRow(r.Context(), `
		select pc.email, pc.tenant_id, coalesce(t.company_code,''), coalesce(t.status,'')
		from public.platform_customers pc
		left join public.tenants t on t.id = pc.tenant_id
		where pc.id = $1`, id).Scan(&email, &tenantID, &companyCode, &tenantStatus)
	if err != nil {
		if err == pgx.ErrNoRows {
			response.Err(w, http.StatusNotFound, "Customer not found.", "ERR_NOT_FOUND")
			return
		}
		response.Err(w, http.StatusInternalServerError, "Failed to load customer.", "ERR_INTERNAL")
		return
	}
	if auth.IsPlatformConsoleEmail(email) {
		response.Err(w, http.StatusConflict,
			"Cannot remove a product owner / platform superadmin contact ("+email+").",
			"ERR_FORBIDDEN")
		return
	}
	if strings.ToLower(strings.TrimSpace(body.ConfirmEmail)) != strings.ToLower(strings.TrimSpace(email)) {
		response.Validation(w, map[string]string{"confirm_email": "Type the exact customer email (" + email + ") to confirm remove."})
		return
	}
	if auth.IsOperatorCompanyCode(companyCode) {
		response.Err(w, http.StatusConflict,
			"Cannot remove a contact still linked to BLUEARM (operator company). Unlink or wipe a customer company instead.",
			"ERR_FORBIDDEN")
		return
	}

	wiped := false
	if tenantID != nil && *tenantID > 0 {
		if !body.WipeIfLinked {
			response.Err(w, http.StatusConflict,
				"This contact still has workspace "+companyCode+". Wipe the company first, or set wipe_if_linked and confirm the company code.",
				"ERR_CONFLICT")
			return
		}
		if strings.TrimSpace(body.ConfirmCompanyCode) != companyCode {
			response.Validation(w, map[string]string{"confirm_company_code": "Type company code " + companyCode + " to wipe before remove."})
			return
		}
		if tenantStatus != "active" && tenantStatus != "suspended" && tenantStatus != "cancelled" && tenantStatus != "pending_approval" {
			response.Err(w, http.StatusBadRequest, "Cannot wipe workspace in status "+tenantStatus+".", "ERR_BAD_REQUEST")
			return
		}
		tx, err := s.pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to remove customer.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		if _, err := tx.Exec(r.Context(), `
			update public.platform_subscriptions
			set status = 'cancelled', updated_at = now(),
			    notes = coalesce(notes,'') || E'\n[remove] Workspace wiped with contact delete.'
			where customer_id = $1`, id); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to cancel subscriptions: "+err.Error(), "ERR_INTERNAL")
			return
		}
		if _, err := tx.Exec(r.Context(), `
			update public.platform_customers set tenant_id = null, updated_at = now() where id = $1`, id); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to unlink customer.", "ERR_INTERNAL")
			return
		}
		if _, err := tx.Exec(r.Context(), `delete from public.users where tenant_id = $1`, *tenantID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to delete workspace users: "+err.Error(), "ERR_INTERNAL")
			return
		}
		if _, err := tx.Exec(r.Context(), `delete from public.tenants where id = $1`, *tenantID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Could not wipe company "+companyCode+": "+err.Error(), "ERR_INTERNAL")
			return
		}
		if _, err := tx.Exec(r.Context(), `delete from public.platform_customers where id = $1`, id); err != nil {
			response.Err(w, http.StatusInternalServerError, "Workspace wiped but contact delete failed: "+err.Error(), "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to remove customer.", "ERR_INTERNAL")
			return
		}
		wiped = true
	} else {
		tag, err := s.pool.Exec(r.Context(), `delete from public.platform_customers where id = $1`, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to delete contact: "+err.Error(), "ERR_INTERNAL")
			return
		}
		if tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Customer not found.", "ERR_NOT_FOUND")
			return
		}
	}

	// Contact row alone does not own the one-email→one-business claim — free users/invites too.
	released, relErr := auth.ReleaseCustomerEmailClaim(r.Context(), s.pool, email)
	if relErr != nil {
		log.Printf("console: release email claim for %s after contact delete: %v", email, relErr)
		response.Err(w, http.StatusInternalServerError,
			"Contact removed but could not free email memberships: "+relErr.Error(), "ERR_INTERNAL")
		return
	}

	tu, _ := auth.FromContext(r.Context())
	logPlatformAudit(r.Context(), s.pool, tu, platformAuditEntry{
		ActionCode: "platform.customer.delete", EventKind: "change",
		HTTPMethod: "DELETE", RoutePath: r.URL.Path,
		PlatformCustomerID: &id, TenantID: tenantID,
		TargetType: "platform_customers", TargetID: &id,
		Summary: "Removed customer contact " + email,
	})
	msg := "Contact " + email + " removed from Platform Command."
	if wiped {
		msg = "Company " + companyCode + " wiped and contact " + email + " removed from Platform Command."
	}
	if released > 0 {
		msg += fmt.Sprintf(" Freed %d workspace membership(s) so the email can be provisioned or start a trial again.", released)
	}
	response.OK(w, map[string]any{
		"deleted": true, "wiped": wiped, "email": email, "memberships_released": released,
	}, msg)
}

// releaseEmailClaim frees an email that still has users/invites after the Platform
// Command contact row was already deleted (or never existed).
func (s *service) releaseEmailClaim(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email        string `json:"email"`
		ConfirmEmail string `json:"confirm_email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Validation(w, map[string]string{"body": "Invalid JSON."})
		return
	}
	email := strings.ToLower(strings.TrimSpace(body.Email))
	confirm := strings.ToLower(strings.TrimSpace(body.ConfirmEmail))
	if email == "" || !strings.Contains(email, "@") {
		response.Validation(w, map[string]string{"email": "Enter a valid email address."})
		return
	}
	if confirm != email {
		response.Validation(w, map[string]string{"confirm_email": "Type the exact email to confirm release."})
		return
	}
	if auth.IsPlatformConsoleEmail(email) {
		response.Err(w, http.StatusConflict, "Cannot release a product owner / platform superadmin email.", "ERR_FORBIDDEN")
		return
	}

	occ, err := auth.CustomerEmailOccupancy(r.Context(), s.pool, email)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to check email.", "ERR_INTERNAL")
		return
	}

	released, err := auth.ReleaseCustomerEmailClaim(r.Context(), s.pool, email)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to release email: "+err.Error(), "ERR_INTERNAL")
		return
	}

	tu, _ := auth.FromContext(r.Context())
	logPlatformAudit(r.Context(), s.pool, tu, platformAuditEntry{
		ActionCode: "platform.email.release", EventKind: "change",
		HTTPMethod: "POST", RoutePath: r.URL.Path,
		TargetType: "users", Summary: "Released email claim for " + email,
	})

	msg := "Email " + email + " is free for provision or trial."
	if released == 0 && !occ.Occupied {
		msg = "Email " + email + " was already free."
	} else if occ.Occupied {
		msg = fmt.Sprintf("Freed %d membership(s) for %s (was on %s).", released, email, occ.CompanyName)
	}
	response.OK(w, map[string]any{
		"email": email, "memberships_released": released, "was_occupied": occ.Occupied,
		"previous_company": occ.CompanyName,
	}, msg)
}
