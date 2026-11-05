package portal

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func registerPortalHRRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/time", portalTime(pool))
	r.Post("/time", portalCreateTime(pool))
	r.Get("/manpower-requests", portalManpower(pool))
	r.Post("/manpower-requests", portalCreateManpower(pool))
	r.Get("/evaluations", portalEvaluations(pool))
	r.Get("/people", portalPeople(pool))
	r.Get("/incidents", portalIncidents(pool))
	r.Post("/incidents", portalCreateIncident(pool))
	r.Get("/bills", portalBills(pool))
	r.Get("/documents", portalDocuments(pool))
	r.Get("/summary", portalSummary(pool))
	r.Get("/account-users", portalAccountUsers(pool))
	r.Get("/notices", portalNotices(pool))
	r.Get("/activity", portalActivity(pool))
	r.Get("/leave-requests", portalLeave(pool))
	r.Post("/leave-requests/{id}/decision", portalLeaveDecision(pool))
}

func portalTime(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Portal token required.", "ERR_UNAUTHORIZED")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select t.id, s.site_name, t.period_start::text, t.period_end::text, t.status, t.file_name,
			       coalesce(t.accepted_hours::float8, 0)
			from public.hr_client_time_submissions t
			join public.hr_client_sites s on s.id = t.site_id and s.tenant_id = t.tenant_id
			join public.hr_clients c on c.id = s.client_id and c.tenant_id = t.tenant_id
			where t.tenant_id = $1 and c.partner_id = $2
			order by t.id desc limit 100`, pu.TenantID, pu.PartnerID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load time.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id int64
			var site, start, end, status, name string
			var hours float64
			if err := rows.Scan(&id, &site, &start, &end, &status, &name, &hours); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load time.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{
				"id": id, "site_name": site, "period_start": start, "period_end": end,
				"status": status, "file_name": name, "accepted_hours": hours,
			})
		}
		response.OK(w, out, "OK")
	}
}

func portalCreateTime(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Portal token required.", "ERR_UNAUTHORIZED")
			return
		}
		var body struct {
			SiteID      int64  `json:"site_id"`
			PeriodStart string `json:"period_start"`
			PeriodEnd   string `json:"period_end"`
			FileName    string `json:"file_name"`
			FileBase64  string `json:"file_base64"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON.", "ERR_BAD_REQUEST")
			return
		}
		if body.SiteID == 0 || body.PeriodStart == "" || body.PeriodEnd == "" {
			response.Validation(w, map[string]string{"site_id": "Choose a site and a period."})
			return
		}
		if !portalOwnsSite(r, pool, pu, body.SiteID) {
			response.Err(w, http.StatusNotFound, "Site not found.", "ERR_NOT_FOUND")
			return
		}
		var file []byte
		if strings.TrimSpace(body.FileBase64) != "" {
			decoded, err := base64.StdEncoding.DecodeString(body.FileBase64)
			if err != nil || len(decoded) > 2<<20 {
				response.Validation(w, map[string]string{"file_base64": "File must be valid and under 2 MB."})
				return
			}
			file = decoded
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save time.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.hr_client_time_submissions
			  (tenant_id, site_id, period_start, period_end, file_name, file_bytes)
			values ($1,$2,$3::date,$4::date,$5,$6) returning id`,
			pu.TenantID, body.SiteID, body.PeriodStart, body.PeriodEnd, strings.TrimSpace(body.FileName), file).Scan(&id)
		if err != nil || recordPortal(r, tx, pu, "time_submitted", id, "Time file received") != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save time.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save time.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Created.")
	}
}

func portalManpower(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Portal token required.", "ERR_UNAUTHORIZED")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select m.id, s.site_name, m.headcount, m.details, m.status
			from public.hr_manpower_requests m
			join public.hr_client_sites s on s.id = m.site_id and s.tenant_id = m.tenant_id
			join public.hr_clients c on c.id = s.client_id and c.tenant_id = m.tenant_id
			where m.tenant_id = $1 and c.partner_id = $2
			order by m.id desc limit 100`, pu.TenantID, pu.PartnerID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load requests.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id int64
			var site, details, status string
			var head int
			if err := rows.Scan(&id, &site, &head, &details, &status); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load requests.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{"id": id, "site_name": site, "headcount": head, "details": details, "status": status})
		}
		response.OK(w, out, "OK")
	}
}

func portalCreateManpower(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Portal token required.", "ERR_UNAUTHORIZED")
			return
		}
		var body struct {
			SiteID    int64  `json:"site_id"`
			Headcount int    `json:"headcount"`
			Details   string `json:"details"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.SiteID == 0 || body.Headcount < 1 {
			response.Validation(w, map[string]string{"headcount": "Choose a site and a headcount of at least 1."})
			return
		}
		if !portalOwnsSite(r, pool, pu, body.SiteID) {
			response.Err(w, http.StatusNotFound, "Site not found.", "ERR_NOT_FOUND")
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the request.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.hr_manpower_requests (tenant_id, site_id, headcount, details)
			values ($1,$2,$3,$4) returning id`,
			pu.TenantID, body.SiteID, body.Headcount, strings.TrimSpace(body.Details)).Scan(&id)
		if err != nil || recordPortal(r, tx, pu, "manpower_requested", id, "Manpower request received") != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the request.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the request.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Created.")
	}
}

func portalEvaluations(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Portal token required.", "ERR_UNAUTHORIZED")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select r.id, e.full_name, coalesce(r.overall_score::float8, 0), coalesce(r.scores_json, '{}'::jsonb)
			from public.hr_performance_reviews r
			join public.hr_employees e on e.id = r.employee_id and e.tenant_id = r.tenant_id
			where r.tenant_id = $1 and r.review_source = 'client'
			  and exists (
			    select 1 from public.hr_assignments a
			    join public.hr_client_sites s on s.id = a.site_id and s.tenant_id = a.tenant_id
			    join public.hr_clients c on c.id = s.client_id and c.tenant_id = a.tenant_id
			    where a.tenant_id = r.tenant_id and a.employee_id = r.employee_id and c.partner_id = $2
			  )
			order by r.id desc limit 100`, pu.TenantID, pu.PartnerID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load evaluations.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id int64
			var name string
			var score float64
			var scores []byte
			if err := rows.Scan(&id, &name, &score, &scores); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load evaluations.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{"id": id, "employee_name": name, "overall_score": score, "scores_json": json.RawMessage(scores)})
		}
		response.OK(w, out, "OK")
	}
}

func portalPeople(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Portal token required.", "ERR_UNAUTHORIZED")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select distinct e.id, e.full_name
			from public.hr_assignments a
			join public.hr_employees e on e.id = a.employee_id and e.tenant_id = a.tenant_id
			join public.hr_client_sites s on s.id = a.site_id and s.tenant_id = a.tenant_id
			join public.hr_clients c on c.id = s.client_id and c.tenant_id = a.tenant_id
			where a.tenant_id = $1 and c.partner_id = $2
			order by e.full_name`, pu.TenantID, pu.PartnerID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load people.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id int64
			var name string
			if err := rows.Scan(&id, &name); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load people.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{"id": id, "full_name": name})
		}
		response.OK(w, out, "OK")
	}
}

func portalIncidents(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Portal token required.", "ERR_UNAUTHORIZED")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select v.id, e.full_name, v.description, v.status
			from public.hr_client_violation_reports v
			join public.hr_employees e on e.id = v.employee_id and e.tenant_id = v.tenant_id
			where v.tenant_id = $1
			  and exists (
			    select 1 from public.hr_assignments a
			    join public.hr_client_sites s on s.id = a.site_id and s.tenant_id = a.tenant_id
			    join public.hr_clients c on c.id = s.client_id and c.tenant_id = a.tenant_id
			    where a.tenant_id = v.tenant_id and a.employee_id = v.employee_id and c.partner_id = $2
			  )
			order by v.id desc limit 100`, pu.TenantID, pu.PartnerID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load incidents.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id int64
			var name, description, status string
			if err := rows.Scan(&id, &name, &description, &status); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load incidents.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{"id": id, "employee_name": name, "description": description, "status": status})
		}
		response.OK(w, out, "OK")
	}
}

func portalCreateIncident(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Portal token required.", "ERR_UNAUTHORIZED")
			return
		}
		var body struct {
			EmployeeID  int64  `json:"employee_id"`
			Description string `json:"description"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.EmployeeID == 0 || strings.TrimSpace(body.Description) == "" {
			response.Validation(w, map[string]string{"description": "Choose a person and describe the incident."})
			return
		}
		if !portalEmploys(r, pool, pu, body.EmployeeID) {
			response.Err(w, http.StatusNotFound, "Person not found.", "ERR_NOT_FOUND")
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the incident.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.hr_client_violation_reports (tenant_id, employee_id, description)
			values ($1,$2,$3) returning id`, pu.TenantID, body.EmployeeID, strings.TrimSpace(body.Description)).Scan(&id)
		if err != nil || recordPortal(r, tx, pu, "incident_reported", id, "Incident report received") != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the incident.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the incident.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Created.")
	}
}

func portalBills(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Portal token required.", "ERR_UNAUTHORIZED")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select b.id, s.site_name, b.period_start::text, b.period_end::text, b.total::float8
			from public.hr_client_bills b
			join public.hr_client_sites s on s.id = b.site_id and s.tenant_id = b.tenant_id
			join public.hr_clients c on c.id = s.client_id and c.tenant_id = b.tenant_id
			where b.tenant_id = $1 and c.partner_id = $2
			order by b.id desc limit 100`, pu.TenantID, pu.PartnerID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load bills.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id int64
			var site, start, end string
			var total float64
			if err := rows.Scan(&id, &site, &start, &end, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load bills.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{"id": id, "site_name": site, "period_start": start, "period_end": end, "total": total})
		}
		response.OK(w, out, "OK")
	}
}

func portalDocuments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Portal token required.", "ERR_UNAUTHORIZED")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select d.id, d.title, coalesce(d.expires_on::text, '')
			from public.hr_employee_documents d
			where d.tenant_id = $1 and d.client_visible = true
			  and exists (
			    select 1 from public.hr_assignments a
			    join public.hr_client_sites s on s.id = a.site_id and s.tenant_id = a.tenant_id
			    join public.hr_clients c on c.id = s.client_id and c.tenant_id = a.tenant_id
			    where a.tenant_id = d.tenant_id and a.employee_id = d.employee_id and c.partner_id = $2
			  )
			order by d.id desc limit 100`, pu.TenantID, pu.PartnerID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load documents.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id int64
			var title, expires string
			if err := rows.Scan(&id, &title, &expires); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load documents.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{"id": id, "title": title, "expires_on": expires})
		}
		response.OK(w, out, "OK")
	}
}

func portalSummary(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Portal token required.", "ERR_UNAUTHORIZED")
			return
		}
		var people, requests, bills, openings, hired int
		err := pool.QueryRow(r.Context(), `
			select
			  (select count(distinct a.employee_id) from public.hr_assignments a
			    join public.hr_client_sites s on s.id = a.site_id and s.tenant_id = a.tenant_id
			    join public.hr_clients c on c.id = s.client_id and c.tenant_id = a.tenant_id
			    where a.tenant_id = $1 and c.partner_id = $2 and a.end_date is null),
			  (select count(*) from public.hr_manpower_requests m
			    join public.hr_client_sites s on s.id = m.site_id and s.tenant_id = m.tenant_id
			    join public.hr_clients c on c.id = s.client_id and c.tenant_id = m.tenant_id
			    where m.tenant_id = $1 and c.partner_id = $2 and m.status = 'open'),
			  (select count(*) from public.hr_client_bills b
			    join public.hr_client_sites s on s.id = b.site_id and s.tenant_id = b.tenant_id
			    join public.hr_clients c on c.id = s.client_id and c.tenant_id = b.tenant_id
			    where b.tenant_id = $1 and c.partner_id = $2),
			  (select count(*) from public.hr_job_postings p
			    join public.hr_client_sites s on s.id = p.site_id and s.tenant_id = p.tenant_id
			    join public.hr_clients c on c.id = s.client_id and c.tenant_id = p.tenant_id
			    where p.tenant_id = $1 and c.partner_id = $2 and p.status = 'open'),
			  (select count(*) from public.hr_applications a
			    join public.hr_job_postings p on p.id = a.job_posting_id and p.tenant_id = a.tenant_id
			    join public.hr_client_sites s on s.id = p.site_id and s.tenant_id = p.tenant_id
			    join public.hr_clients c on c.id = s.client_id and c.tenant_id = p.tenant_id
			    where a.tenant_id = $1 and c.partner_id = $2 and a.status = 'hired')
		`, pu.TenantID, pu.PartnerID).Scan(&people, &requests, &bills, &openings, &hired)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load the summary.", "ERR_INTERNAL")
			return
		}
		pipeline := []map[string]any{
			{"step": "request", "label": "Open requests", "count": requests},
			{"step": "opening", "label": "Open openings", "count": openings},
			{"step": "hired", "label": "Hired from openings", "count": hired},
			{"step": "deployed", "label": "Deployed people", "count": people},
			{"step": "bills", "label": "Bills", "count": bills},
		}
		response.OK(w, map[string]any{
			"people": people, "open_requests": requests, "bills": bills,
			"open_openings": openings, "hired_from_openings": hired, "pipeline": pipeline,
		}, "OK")
	}
}

func portalAccountUsers(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Portal token required.", "ERR_UNAUTHORIZED")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select id, email, display_name, is_active
			from public.portal_users
			where tenant_id = $1 and partner_id = $2
			order by id`, pu.TenantID, pu.PartnerID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load users.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id int64
			var email, name string
			var active bool
			if err := rows.Scan(&id, &email, &name, &active); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load users.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{"id": id, "email": email, "display_name": name, "is_active": active})
		}
		response.OK(w, out, "OK")
	}
}

func portalNotices(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Portal token required.", "ERR_UNAUTHORIZED")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select id, title, created_at::text
			from public.hr_portal_notices
			where tenant_id = $1 and partner_id = $2
			order by id desc limit 50`, pu.TenantID, pu.PartnerID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load notices.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id int64
			var title, created string
			if err := rows.Scan(&id, &title, &created); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load notices.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{"id": id, "title": title, "created_at": created})
		}
		response.OK(w, out, "OK")
	}
}

func portalActivity(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Portal token required.", "ERR_UNAUTHORIZED")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select a.id, u.display_name, a.action, coalesce(a.target_id, 0), a.created_at::text
			from public.hr_portal_activity a
			join public.portal_users u on u.id = a.portal_user_id
			where a.tenant_id = $1 and a.partner_id = $2
			order by a.id desc limit 50`, pu.TenantID, pu.PartnerID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load activity.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id, target int64
			var name, action, created string
			if err := rows.Scan(&id, &name, &action, &target, &created); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load activity.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{"id": id, "display_name": name, "action": action, "target_id": target, "created_at": created})
		}
		response.OK(w, out, "OK")
	}
}

func portalLeave(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Portal token required.", "ERR_UNAUTHORIZED")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select lr.id, e.full_name, lr.date_from::text, lr.date_to::text, lr.days::float8, lr.status, lr.client_decision
			from public.hr_leave_requests lr
			join public.hr_employees e on e.id = lr.employee_id and e.tenant_id = lr.tenant_id
			where lr.tenant_id = $1 and lr.status = 'submitted'
			  and exists (
			    select 1 from public.hr_assignments a
			    join public.hr_client_sites s on s.id = a.site_id and s.tenant_id = a.tenant_id
			    join public.hr_clients c on c.id = s.client_id and c.tenant_id = a.tenant_id
			    where a.tenant_id = lr.tenant_id and a.employee_id = lr.employee_id and c.partner_id = $2
			      and a.start_date <= lr.date_from and (a.end_date is null or a.end_date >= lr.date_from)
			  )
			order by lr.id desc limit 100`, pu.TenantID, pu.PartnerID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load leave.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id int64
			var name, from, to, status, decision string
			var days float64
			if err := rows.Scan(&id, &name, &from, &to, &days, &status, &decision); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load leave.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{
				"id": id, "employee_name": name, "date_from": from, "date_to": to,
				"days": days, "status": status, "client_decision": decision,
			})
		}
		response.OK(w, out, "OK")
	}
}

func portalLeaveDecision(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Portal token required.", "ERR_UNAUTHORIZED")
			return
		}
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body struct {
			Decision string `json:"decision"`
			Note     string `json:"note"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || (body.Decision != "accepted" && body.Decision != "refused") {
			response.Validation(w, map[string]string{"decision": "Choose accepted or refused."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the decision.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		tag, err := tx.Exec(r.Context(), `
			update public.hr_leave_requests lr
			set client_decision = $3, client_decision_note = $4, updated_at = now()
			where lr.id = $1 and lr.tenant_id = $2 and lr.status = 'submitted'
			  and exists (
			    select 1 from public.hr_assignments a
			    join public.hr_client_sites s on s.id = a.site_id and s.tenant_id = a.tenant_id
			    join public.hr_clients c on c.id = s.client_id and c.tenant_id = a.tenant_id
			    where a.tenant_id = lr.tenant_id and a.employee_id = lr.employee_id and c.partner_id = $5
			      and a.start_date <= lr.date_from and (a.end_date is null or a.end_date >= lr.date_from)
			  )`, id, pu.TenantID, body.Decision, strings.TrimSpace(body.Note), pu.PartnerID)
		if err != nil || tag.RowsAffected() == 0 || recordPortal(r, tx, pu, "leave_decided", id, "Leave decision recorded") != nil {
			response.Err(w, http.StatusNotFound, "Leave request not found.", "ERR_NOT_FOUND")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the decision.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": id, "client_decision": body.Decision, "status": "submitted"}, "Saved.")
	}
}

func portalOwnsSite(r *http.Request, pool *pgxpool.Pool, pu PortalUser, siteID int64) bool {
	var id int64
	err := pool.QueryRow(r.Context(), `
		select s.id from public.hr_client_sites s
		join public.hr_clients c on c.id = s.client_id and c.tenant_id = s.tenant_id
		where s.tenant_id = $1 and s.id = $2 and c.partner_id = $3`, pu.TenantID, siteID, pu.PartnerID).Scan(&id)
	return err == nil
}

func portalEmploys(r *http.Request, pool *pgxpool.Pool, pu PortalUser, employeeID int64) bool {
	var id int64
	err := pool.QueryRow(r.Context(), `
		select a.employee_id from public.hr_assignments a
		join public.hr_client_sites s on s.id = a.site_id and s.tenant_id = a.tenant_id
		join public.hr_clients c on c.id = s.client_id and c.tenant_id = a.tenant_id
		where a.tenant_id = $1 and a.employee_id = $2 and c.partner_id = $3
		limit 1`, pu.TenantID, employeeID, pu.PartnerID).Scan(&id)
	return err == nil
}

func recordPortal(r *http.Request, tx pgx.Tx, pu PortalUser, action string, targetID int64, title string) error {
	if _, err := tx.Exec(r.Context(), `
		insert into public.hr_portal_activity (tenant_id, partner_id, portal_user_id, action, target_id)
		values ($1,$2,$3,$4,$5)`, pu.TenantID, pu.PartnerID, pu.ID, action, targetID); err != nil {
		return err
	}
	_, err := tx.Exec(r.Context(), `
		insert into public.hr_portal_notices (tenant_id, partner_id, title)
		values ($1,$2,$3)`, pu.TenantID, pu.PartnerID, title)
	return err
}
