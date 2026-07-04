package demoonboard

import (
	"encoding/json"
	"net"
	"net/http"
	"strings"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type demoTemplate struct {
	IndustryCode string `json:"industry_code"`
	Label        string `json:"label"`
	Description  string `json:"description"`
}

func (s *service) getTemplates(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(), `
		select industry_code, label, description
		from public.demo_templates
		where is_active = true
		order by sort_order, label`)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to load demo templates.", "ERR_INTERNAL")
		return
	}
	defer rows.Close()

	out := make([]demoTemplate, 0, 8)
	for rows.Next() {
		var t demoTemplate
		if err := rows.Scan(&t.IndustryCode, &t.Label, &t.Description); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to read demo templates.", "ERR_INTERNAL")
			return
		}
		out = append(out, t)
	}
	response.OK(w, map[string]any{"templates": out}, "OK")
}

type signupRequest struct {
	FullName     string `json:"full_name"`
	Email        string `json:"email"`
	Mobile       string `json:"mobile"`
	CompanyName  string `json:"company_name"`
	IndustryCode string `json:"industry_code"`
}

func (s *service) postSignup(w http.ResponseWriter, r *http.Request) {
	if !s.cfg.DemoSignupEnabled {
		response.Err(w, http.StatusServiceUnavailable, "Demo signups are currently disabled.", "ERR_UNAVAILABLE")
		return
	}

	var body signupRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Validation(w, map[string]string{"body": "Invalid JSON."})
		return
	}

	fullName := strings.TrimSpace(body.FullName)
	email := strings.TrimSpace(strings.ToLower(body.Email))
	company := strings.TrimSpace(body.CompanyName)
	industry := strings.TrimSpace(strings.ToLower(body.IndustryCode))

	fieldErrs := map[string]string{}
	if fullName == "" || len(fullName) > 255 {
		fieldErrs["full_name"] = "Enter your full name."
	}
	if !isValidEmail(email) {
		fieldErrs["email"] = "Enter a valid email address."
	}
	mobile, mobileOK := normalizePHMobile(body.Mobile)
	if !mobileOK {
		fieldErrs["mobile"] = "Enter a valid Philippine mobile number (e.g. 0917 123 4567)."
	}
	if industry == "" {
		fieldErrs["industry_code"] = "Choose an industry."
	}
	if len(fieldErrs) > 0 {
		response.Validation(w, fieldErrs)
		return
	}

	// Industry must be an active template.
	var industryActive bool
	err := s.pool.QueryRow(r.Context(),
		`select is_active from public.demo_templates where industry_code = $1`, industry).Scan(&industryActive)
	if err != nil || !industryActive {
		response.Validation(w, map[string]string{"industry_code": "That industry is not available yet."})
		return
	}

	// Lightweight abuse guard: cap signups per email per day.
	var recent int
	if err := s.pool.QueryRow(r.Context(), `
		select count(*)::int from public.demo_signups
		where lower(email) = $1 and created_at > now() - interval '24 hours'`, email).Scan(&recent); err == nil && recent >= 5 {
		response.Err(w, http.StatusTooManyRequests,
			"Too many demo requests for this email today. Please try again later.", "ERR_RATE_LIMITED")
		return
	}

	ip := clientIP(r)
	ua := strings.TrimSpace(r.UserAgent())

	// Create the CRM lead in the home (leadgen) tenant, best-effort.
	var leadTenantID *int64
	var leadID *int64
	if tid, ok := s.leadgenTenantID(r.Context()); ok {
		leadTenantID = &tid
		note := "Free demo signup. Industry: " + industry + ". Mobile: " + mobile + ". Awaiting email verification."
		if company != "" {
			note = "Company: " + company + ". " + note
		}
		var newLeadID int64
		if err := s.pool.QueryRow(r.Context(), `
			insert into public.crm_leads
			  (tenant_id, lead_name, company_name, email, phone, source, status, pic_name, notes)
			values ($1, $2, nullif($3,''), $4, $5, 'demo_signup', 'new', '', $6)
			returning id`,
			tid, fullName, company, email, mobile, note).Scan(&newLeadID); err == nil {
			leadID = &newLeadID
		}
	}

	var signupID int64
	err = s.pool.QueryRow(r.Context(), `
		insert into public.demo_signups
		  (full_name, email, mobile, company_name, industry_code, status,
		   lead_tenant_id, lead_id, request_ip, user_agent)
		values ($1, $2, $3, nullif($4,''), $5, 'pending', $6, $7, $8, nullif($9,''))
		returning id`,
		fullName, email, mobile, company, industry, leadTenantID, leadID, ip, ua).Scan(&signupID)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to record demo signup.", "ERR_INTERNAL")
		return
	}

	response.OK(w, map[string]any{
		"signup_id":     signupID,
		"industry_code": industry,
		"email":         email,
		"next":          "verify_email",
	}, "Signup received. Verify your email to start the demo.")
}

func clientIP(r *http.Request) string {
	if xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); xff != "" {
		if i := strings.IndexByte(xff, ','); i >= 0 {
			return strings.TrimSpace(xff[:i])
		}
		return xff
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
