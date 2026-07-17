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

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customerregistry"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func (s *service) listCustomers(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	label := strings.TrimSpace(r.URL.Query().Get("urgency_label"))
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

	query := `
		select pc.id, pc.email, pc.full_name, pc.company_name, pc.entry_source,
		       pc.urgency_label, pc.tenant_id, t.company_code,
		       ps.plan_kind, ps.status as sub_status, ps.ends_at,
		       pc.crm_lead_id, pc.created_at
		from public.platform_customers pc
		left join public.tenants t on t.id = pc.tenant_id
		left join lateral (
		  select plan_kind, status, ends_at
		  from public.platform_subscriptions
		  where customer_id = pc.id
		  order by created_at desc limit 1
		) ps on true
		` + where + `
		order by pc.urgency_updated_at desc, pc.id desc
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
			email, fullName, entrySource, urgency                   string
			company, companyCode, planKind, subStatus               *string
			tenantID, leadID                                          *int64
			endsAt                                                    *time.Time
			createdAt                                                 time.Time
		)
		if err := rows.Scan(&id, &email, &fullName, &company, &entrySource, &urgency, &tenantID,
			&companyCode, &planKind, &subStatus, &endsAt, &leadID, &createdAt); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to read customer.", "ERR_INTERNAL")
			return
		}
		row := map[string]any{
			"id": id, "email": email, "full_name": fullName, "company_name": company,
			"entry_source": entrySource, "urgency_label": urgency,
			"tenant_id": tenantID, "company_code": companyCode,
			"plan_kind": planKind, "subscription_status": subStatus, "ends_at": endsAt,
			"crm_lead_id": leadID, "created_at": createdAt,
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

	invRows, _ := s.pool.Query(r.Context(), `
		select i.id, i.invoice_no, i.period_start, i.period_end, i.amount, i.currency,
		       i.due_date, i.paid_at, i.status, i.notes, s.plan_kind
		from public.platform_subscription_invoices i
		join public.platform_subscriptions s on s.id = i.subscription_id
		where s.customer_id = $1 order by i.due_date desc`, id)
	invoices := scanInvoices(invRows)

	response.OK(w, map[string]any{
		"customer": map[string]any{
			"id": id, "email": email, "full_name": fullName, "company_name": company,
			"mobile": mobile, "entry_source": entrySource, "urgency_label": urgency,
			"tenant_id": tenantID, "auth_user_id": authUserID,
			"crm_lead_id": leadID, "crm_lead_tenant_id": leadTenantID,
			"onboarding_progress": json.RawMessage(onboarding), "created_at": createdAt,
		},
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
