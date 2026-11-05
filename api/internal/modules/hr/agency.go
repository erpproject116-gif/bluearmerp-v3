package hr

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
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const acceptClientTimeSQL = `
	update public.hr_client_time_submissions
	set status = 'accepted', accepted_hours = $3
	where id = $1 and tenant_id = $2 and status = 'submitted'`

const insertJobOrderSQL = `
	insert into public.hr_job_orders (tenant_id, site_id, pay_rate, bill_rate)
	values ($1, $2, $3, $4) returning id`

func registerAgencyRoutes(r chi.Router, pool *pgxpool.Pool) {
	write := auth.RequirePermission("hr.employees", auth.AccessWrite)
	r.Get("/job-orders", listJobOrders(pool))
	r.With(write).Post("/job-orders", createJobOrder(pool))
	r.Get("/job-postings", listJobPostings(pool))
	r.With(write).Post("/job-postings", createJobPosting(pool))
	r.Get("/manpower-requests", listManpowerRequests(pool))
	r.With(write).Post("/manpower-requests", createManpowerRequest(pool))
	r.With(write).Patch("/manpower-requests/{id}", patchManpowerRequest(pool))
	r.With(write).Post("/manpower-requests/{id}/publish-opening", publishOpeningFromRequest(pool))
	r.Get("/client-time", listClientTime(pool))
	r.With(write).Post("/client-time", createClientTime(pool))
	r.With(write).Post("/client-time/{id}/accept", acceptClientTime(pool))
	r.Get("/client-bills", listClientBills(pool))
	r.With(write).Post("/client-bills", createClientBill(pool))
	r.Get("/portal-access", listClientPortalAccess(pool))
	r.With(write).Post("/clients/{id}/portal-users", createClientPortalUser(pool))
	r.With(write).Post("/clients/{id}/portal-preview", previewClientPortal(pool))
	r.Get("/clearances", listClearances(pool))
	r.With(write).Post("/clearances", createClearance(pool))
	r.With(write).Post("/clearances/{id}/release", releaseClearance(pool))
	r.Get("/compliance-documents", listComplianceDocuments(pool))
	r.With(write).Patch("/employee-documents/{id}/expiry", setDocumentExpiry(pool))
	r.With(write).Patch("/employee-documents/{id}/visibility", setDocumentVisibility(pool))
	r.Get("/government-reports/withholding", listWithholdingReport(pool))
}

func listJobOrders(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select j.id, j.site_id, s.site_name, c.name, j.pay_rate::float8, j.bill_rate::float8
			from public.hr_job_orders j
			join public.hr_client_sites s on s.id = j.site_id and s.tenant_id = j.tenant_id
			join public.hr_clients c on c.id = s.client_id and c.tenant_id = j.tenant_id
			where j.tenant_id = $1
			order by j.id desc`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load job orders.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id, siteID int64
			var site, client string
			var pay, bill float64
			if err := rows.Scan(&id, &siteID, &site, &client, &pay, &bill); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load job orders.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{
				"id": id, "site_id": siteID, "site_name": site, "client_name": client,
				"pay_rate": pay, "bill_rate": bill,
			})
		}
		response.OK(w, out, "OK")
	}
}

func createJobOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		var body struct {
			SiteID   int64   `json:"site_id"`
			PayRate  float64 `json:"pay_rate"`
			BillRate float64 `json:"bill_rate"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON.", "ERR_BAD_REQUEST")
			return
		}
		if body.SiteID == 0 || body.PayRate < 0 || body.BillRate < 0 {
			response.Validation(w, map[string]string{"site_id": "Choose a site and enter both rates."})
			return
		}
		if err := requireSite(r, pool, tu.TenantID, body.SiteID); err != nil {
			writeAgencyErr(w, err)
			return
		}
		var id int64
		err := pool.QueryRow(r.Context(), insertJobOrderSQL, tu.TenantID, body.SiteID, body.PayRate, body.BillRate).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the job order.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Created.")
	}
}

func listManpowerRequests(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select q.id, q.site_id, s.site_name, c.name, q.headcount, q.details, q.status
			from public.hr_manpower_requests q
			join public.hr_client_sites s on s.id = q.site_id and s.tenant_id = q.tenant_id
			join public.hr_clients c on c.id = s.client_id and c.tenant_id = q.tenant_id
			where q.tenant_id = $1
			order by q.id desc`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load manpower requests.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id, siteID int64
			var site, client, details, status string
			var headcount int
			if err := rows.Scan(&id, &siteID, &site, &client, &headcount, &details, &status); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load manpower requests.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{
				"id": id, "site_id": siteID, "site_name": site, "client_name": client,
				"headcount": headcount, "details": details, "status": status,
			})
		}
		response.OK(w, out, "OK")
	}
}

func createManpowerRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		var body struct {
			SiteID    int64  `json:"site_id"`
			Headcount int    `json:"headcount"`
			Details   string `json:"details"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON.", "ERR_BAD_REQUEST")
			return
		}
		if body.SiteID == 0 || body.Headcount < 1 {
			response.Validation(w, map[string]string{"headcount": "Choose a site and a headcount of at least 1."})
			return
		}
		if err := requireSite(r, pool, tu.TenantID, body.SiteID); err != nil {
			writeAgencyErr(w, err)
			return
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.hr_manpower_requests (tenant_id, site_id, headcount, details)
			values ($1,$2,$3,$4) returning id`, tu.TenantID, body.SiteID, body.Headcount, strings.TrimSpace(body.Details)).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the request.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Created.")
	}
}

func patchManpowerRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		var body struct {
			Status string `json:"status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON.", "ERR_BAD_REQUEST")
			return
		}
		if body.Status != "open" && body.Status != "filled" && body.Status != "closed" {
			response.Validation(w, map[string]string{"status": "Choose open, filled, or closed."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.hr_manpower_requests set status = $3
			where id = $1 and tenant_id = $2`, chi.URLParam(r, "id"), tu.TenantID, body.Status)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Request not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"ok": true}, "Updated.")
	}
}

func listClientTime(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select t.id, t.site_id, s.site_name, c.name, t.period_start::text, t.period_end::text,
			       t.status, t.file_name, coalesce(t.accepted_hours::float8, 0)
			from public.hr_client_time_submissions t
			join public.hr_client_sites s on s.id = t.site_id and s.tenant_id = t.tenant_id
			join public.hr_clients c on c.id = s.client_id and c.tenant_id = t.tenant_id
			where t.tenant_id = $1
			order by t.id desc`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load client time.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id, siteID int64
			var site, client, start, end, status, file string
			var hours float64
			if err := rows.Scan(&id, &siteID, &site, &client, &start, &end, &status, &file, &hours); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load client time.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{
				"id": id, "site_id": siteID, "site_name": site, "client_name": client,
				"period_start": start, "period_end": end, "status": status, "file_name": file, "accepted_hours": hours,
			})
		}
		response.OK(w, out, "OK")
	}
}

func createClientTime(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		if err := r.ParseMultipartForm(applicationFileMax); err != nil && r.ParseForm() != nil {
			response.Err(w, http.StatusBadRequest, "Invalid form.", "ERR_VALIDATION")
			return
		}
		siteID, _ := strconv.ParseInt(r.FormValue("site_id"), 10, 64)
		start, end := strings.TrimSpace(r.FormValue("period_start")), strings.TrimSpace(r.FormValue("period_end"))
		if siteID == 0 || start == "" || end == "" || end < start {
			response.Validation(w, map[string]string{"period_start": "Choose a site and a period."})
			return
		}
		if err := requireSite(r, pool, tu.TenantID, siteID); err != nil {
			writeAgencyErr(w, err)
			return
		}
		part, msg := oneUpload(r, "file", false)
		if msg != "" {
			response.Validation(w, map[string]string{"file": msg})
			return
		}
		var name string
		var body []byte
		if part != nil {
			name, body = part.Name, part.Body
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.hr_client_time_submissions
			  (tenant_id, site_id, period_start, period_end, file_name, file_bytes)
			values ($1,$2,$3::date,$4::date,$5,$6) returning id`,
			tu.TenantID, siteID, start, end, name, body).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the submission.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Created.")
	}
}

func acceptClientTime(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		var body struct {
			AcceptedHours float64 `json:"accepted_hours"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.AcceptedHours < 0 {
			response.Validation(w, map[string]string{"accepted_hours": "Enter the accepted hours."})
			return
		}
		tag, err := pool.Exec(r.Context(), acceptClientTimeSQL, chi.URLParam(r, "id"), tu.TenantID, body.AcceptedHours)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Submission not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"ok": true}, "Accepted.")
	}
}

func listClientBills(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select b.id, b.site_id, s.site_name, c.name, b.period_start::text, b.period_end::text, b.total::float8
			from public.hr_client_bills b
			join public.hr_client_sites s on s.id = b.site_id and s.tenant_id = b.tenant_id
			join public.hr_clients c on c.id = s.client_id and c.tenant_id = b.tenant_id
			where b.tenant_id = $1
			order by b.id desc`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load client bills.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id, siteID int64
			var site, client, start, end string
			var total float64
			if err := rows.Scan(&id, &siteID, &site, &client, &start, &end, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load client bills.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{
				"id": id, "site_id": siteID, "site_name": site, "client_name": client,
				"period_start": start, "period_end": end, "total": total,
			})
		}
		response.OK(w, out, "OK")
	}
}

func createClientBill(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		var body struct {
			SubmissionID int64 `json:"submission_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.SubmissionID == 0 {
			response.Validation(w, map[string]string{"submission_id": "Choose an accepted submission."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the bill.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var siteID, partnerID int64
		var start, end string
		var hours, rate float64
		err = tx.QueryRow(r.Context(), `
			select t.site_id, c.partner_id, t.period_start::text, t.period_end::text, t.accepted_hours::float8, j.bill_rate::float8
			from public.hr_client_time_submissions t
			join public.hr_client_sites s on s.id = t.site_id and s.tenant_id = t.tenant_id
			join public.hr_clients c on c.id = s.client_id and c.tenant_id = t.tenant_id
			join public.hr_job_orders j on j.id = (
			  select id from public.hr_job_orders
			  where tenant_id = t.tenant_id and site_id = t.site_id
			  order by id desc limit 1
			)
			where t.id = $1 and t.tenant_id = $2 and t.status = 'accepted' and t.accepted_hours is not null`,
			body.SubmissionID, tu.TenantID).Scan(&siteID, &partnerID, &start, &end, &hours, &rate)
		if errors.Is(err, pgx.ErrNoRows) {
			response.Validation(w, map[string]string{"submission_id": "Accept the time and save a bill rate for the site first."})
			return
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the bill.", "ERR_INTERNAL")
			return
		}

		var locationID, currencyID, taxTypeID int64
		if err := tx.QueryRow(r.Context(), `
			select id from public.inv_locations where tenant_id = $1 and deleted_at is null order by id limit 1`, tu.TenantID).Scan(&locationID); err != nil {
			response.Validation(w, map[string]string{"location_id": "Add a stock location before invoicing."})
			return
		}
		if err := tx.QueryRow(r.Context(), `
			select id from public.quo_currencies
			where tenant_id = $1 and deleted_at is null and status = 'active'
			order by is_default desc, id limit 1`, tu.TenantID).Scan(&currencyID); err != nil {
			response.Validation(w, map[string]string{"currency_id": "Add a currency before invoicing."})
			return
		}
		if err := tx.QueryRow(r.Context(), `
			select id from public.quo_tax_types
			where tenant_id = $1 and deleted_at is null and status = 'active'
			order by id limit 1`, tu.TenantID).Scan(&taxTypeID); err != nil {
			response.Validation(w, map[string]string{"tax_type_id": "Add a tax type before invoicing."})
			return
		}

		total := roundMoney(hours * rate)
		orderDate := end
		var dateSeq int
		var salesNo string
		if err := tx.QueryRow(r.Context(),
			`select date_seq, sales_no from public.allocate_sales_sequences($1, $2::date)`,
			tu.TenantID, orderDate).Scan(&dateSeq, &salesNo); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to allocate sales number.", "ERR_INTERNAL")
			return
		}
		var salesID int64
		err = tx.QueryRow(r.Context(), `
			insert into public.sa_sales (
			  tenant_id, order_date, date_seq, sales_no, tax_type_id, currency_id, partner_id, location_id,
			  progress_status, invoicing_status, subtotal, tax_total, grand_total, notes, created_by_user_id
			) values ($1,$2::date,$3,$4,$5,$6,$7,$8,'unconfirmed',false,$9,0,$9,$10,$11)
			returning id`,
			tu.TenantID, orderDate, dateSeq, salesNo, taxTypeID, currencyID, partnerID, locationID,
			total, "HR client time bill #"+strconv.FormatInt(body.SubmissionID, 10), tu.AppUserID).Scan(&salesID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create sales invoice.", "ERR_INTERNAL")
			return
		}
		if _, err := tx.Exec(r.Context(), `
			insert into public.sa_sales_lines (
			  sales_id, line_no, item_code, item_name, qty, unit_non_vat, non_vat_total,
			  tax_amount, unit_vat_inc, line_total, discount_amount, discounted_unit_non_vat, discounted_unit_vat_inc
			) values ($1,1,'','Manpower services',$2,$3,$4,0,0,$4,0,$3,0)`,
			salesID, hours, rate, total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create sales line.", "ERR_INTERNAL")
			return
		}

		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.hr_client_bills (tenant_id, site_id, submission_id, period_start, period_end, total, sales_id)
			values ($1,$2,$3,$4::date,$5::date,$6,$7) returning id`,
			tu.TenantID, siteID, body.SubmissionID, start, end, total, salesID).Scan(&id)
		if err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" {
				response.Err(w, http.StatusConflict, "This submission is already billed.", "ERR_CONFLICT")
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to save the bill.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the bill.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": id, "total": total, "sales_id": salesID, "sales_no": salesNo}, "Created.")
	}
}

func listClientPortalAccess(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select u.id, c.id, c.name, u.email, u.display_name, u.is_active,
			  coalesce((
			    select '/portal/dashboard?token=' || ml.token
			    from public.portal_magic_links ml
			    where ml.portal_user_id = u.id and ml.expires_at > now()
			    order by ml.expires_at desc
			    limit 1
			  ), '')
			from public.portal_users u
			join public.hr_clients c on c.partner_id = u.partner_id and c.tenant_id = u.tenant_id
			where u.tenant_id = $1
			order by c.name, u.email`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load portal access.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id, clientID int64
			var client, email, name, loginURL string
			var active bool
			if err := rows.Scan(&id, &clientID, &client, &email, &name, &active, &loginURL); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load portal access.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{
				"id": id, "client_id": clientID, "client_name": client, "email": email, "display_name": name, "is_active": active,
				"login_url": loginURL,
			})
		}
		response.OK(w, out, "OK")
	}
}

func createClientPortalUser(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		clientID, err := parseID(chi.URLParam(r, "id"))
		if err != nil {
			response.Err(w, http.StatusBadRequest, "Client not found.", "ERR_BAD_REQUEST")
			return
		}
		var body struct {
			Email       string `json:"email"`
			DisplayName string `json:"display_name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON.", "ERR_BAD_REQUEST")
			return
		}
		email := strings.TrimSpace(strings.ToLower(body.Email))
		if email == "" {
			response.Validation(w, map[string]string{"email": "Enter an email."})
			return
		}
		var partnerID int64
		err = pool.QueryRow(r.Context(), `select partner_id from public.hr_clients where id = $1 and tenant_id = $2`, clientID, tu.TenantID).Scan(&partnerID)
		if errors.Is(err, pgx.ErrNoRows) {
			response.Err(w, http.StatusNotFound, "Client not found.", "ERR_NOT_FOUND")
			return
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save portal access.", "ERR_INTERNAL")
			return
		}
		var id int64
		err = pool.QueryRow(r.Context(), `
			insert into public.portal_users (tenant_id, partner_id, email, display_name)
			values ($1,$2,$3,$4) returning id`, tu.TenantID, partnerID, email, strings.TrimSpace(body.DisplayName)).Scan(&id)
		if err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" {
				response.Err(w, http.StatusConflict, "That email already has portal access.", "ERR_CONFLICT")
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to save portal access.", "ERR_INTERNAL")
			return
		}
		loginURL, err := insertPortalMagicLink(r.Context(), pool, id, time.Now().Add(7*24*time.Hour))
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create the portal sign-in link.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": id, "login_url": loginURL}, "Created.")
	}
}

// previewClientPortal issues a short-lived magic link so staff can open the client portal.
// Reuses an active portal user for the client when present; otherwise creates a staff-preview user.
func previewClientPortal(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		clientID, err := parseID(chi.URLParam(r, "id"))
		if err != nil {
			response.Err(w, http.StatusBadRequest, "Client not found.", "ERR_BAD_REQUEST")
			return
		}
		var partnerID int64
		var clientName string
		err = pool.QueryRow(r.Context(), `
			select partner_id, name from public.hr_clients where id = $1 and tenant_id = $2`,
			clientID, tu.TenantID).Scan(&partnerID, &clientName)
		if errors.Is(err, pgx.ErrNoRows) {
			response.Err(w, http.StatusNotFound, "Client not found.", "ERR_NOT_FOUND")
			return
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to open portal preview.", "ERR_INTERNAL")
			return
		}

		var portalUserID int64
		err = pool.QueryRow(r.Context(), `
			select id from public.portal_users
			where tenant_id = $1 and partner_id = $2 and is_active = true
			order by id asc
			limit 1`, tu.TenantID, partnerID).Scan(&portalUserID)
		if errors.Is(err, pgx.ErrNoRows) {
			previewEmail := "staff-preview+client" + strconv.FormatInt(clientID, 10) + "@bluearm.internal"
			display := "Staff preview — " + strings.TrimSpace(clientName)
			err = pool.QueryRow(r.Context(), `
				insert into public.portal_users (tenant_id, partner_id, email, display_name)
				values ($1,$2,$3,$4)
				on conflict (tenant_id, email) do update
				  set partner_id = excluded.partner_id,
				      display_name = excluded.display_name,
				      is_active = true
				returning id`,
				tu.TenantID, partnerID, previewEmail, display).Scan(&portalUserID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to create portal preview user.", "ERR_INTERNAL")
				return
			}
		} else if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to open portal preview.", "ERR_INTERNAL")
			return
		}

		loginURL, err := insertPortalMagicLink(r.Context(), pool, portalUserID, time.Now().Add(2*time.Hour))
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create the portal sign-in link.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"login_url": loginURL, "portal_user_id": portalUserID}, "OK")
	}
}

func insertPortalMagicLink(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, portalUserID int64, expires time.Time) (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	token := hex.EncodeToString(buf)
	var linkID int64
	err := q.QueryRow(ctx, `
		insert into public.portal_magic_links (portal_user_id, token, expires_at)
		values ($1,$2,$3) returning id`, portalUserID, token, expires).Scan(&linkID)
	if err != nil {
		return "", err
	}
	return "/portal/dashboard?token=" + token, nil
}

func listClearances(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select c.id, c.employee_id, e.full_name, e.status, c.status, coalesce(c.pay_period_id, 0)
			from public.hr_clearances c
			join public.hr_employees e on e.id = c.employee_id and e.tenant_id = c.tenant_id
			where c.tenant_id = $1
			order by c.id desc`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load clearances.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id, empID, periodID int64
			var name, employment, status string
			if err := rows.Scan(&id, &empID, &name, &employment, &status, &periodID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load clearances.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{
				"id": id, "employee_id": empID, "employee_name": name, "employee_status": employment,
				"status": status, "pay_period_id": periodID,
			})
		}
		response.OK(w, out, "OK")
	}
}

func createClearance(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		var body struct {
			EmployeeID int64 `json:"employee_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.EmployeeID == 0 {
			response.Validation(w, map[string]string{"employee_id": "Choose an employee."})
			return
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.hr_clearances (tenant_id, employee_id)
			select $1, e.id from public.hr_employees e where e.id = $2 and e.tenant_id = $1
			returning id`, tu.TenantID, body.EmployeeID).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Employee not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Created.")
	}
}

func releaseClearance(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		clearanceID, err := parseID(chi.URLParam(r, "id"))
		if err != nil {
			response.Err(w, http.StatusBadRequest, "Clearance not found.", "ERR_BAD_REQUEST")
			return
		}
		var employeeID int64
		var status string
		err = pool.QueryRow(r.Context(), `
			select employee_id, status from public.hr_clearances where id = $1 and tenant_id = $2`, clearanceID, tu.TenantID).Scan(&employeeID, &status)
		if errors.Is(err, pgx.ErrNoRows) {
			response.Err(w, http.StatusNotFound, "Clearance not found.", "ERR_NOT_FOUND")
			return
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to release final pay.", "ERR_INTERNAL")
			return
		}
		if status == "released" {
			response.Err(w, http.StatusConflict, "This clearance is already released.", "ERR_CONFLICT")
			return
		}
		result, err := postFinalPay(r.Context(), pool, tu, specialRunBody{EmployeeID: &employeeID, PeriodLabel: "Clearance"})
		if err != nil {
			var ferr *finalPayFailure
			if errors.As(err, &ferr) && ferr.Fields != nil {
				response.Validation(w, ferr.Fields)
				return
			}
			if ferr != nil {
				response.Err(w, ferr.Status, ferr.Message, ferr.Code)
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to release final pay.", "ERR_INTERNAL")
			return
		}
		_, _ = pool.Exec(r.Context(), `
			update public.hr_clearances set status = 'released', pay_period_id = $3
			where id = $1 and tenant_id = $2`, clearanceID, tu.TenantID, result.PayPeriodID)
		response.OK(w, map[string]any{"pay_period_id": result.PayPeriodID}, "Released.")
	}
}

func listComplianceDocuments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select d.id, d.employee_id, e.full_name, d.doc_type, d.title, coalesce(d.expires_on::text, ''),
			       (d.expires_on is not null and d.expires_on < current_date), d.client_visible
			from public.hr_employee_documents d
			join public.hr_employees e on e.id = d.employee_id and e.tenant_id = d.tenant_id
			where d.tenant_id = $1
			order by d.expires_on nulls last, e.full_name
			limit 300`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load documents.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id, empID int64
			var name, docType, title, expires string
			var late, visible bool
			if err := rows.Scan(&id, &empID, &name, &docType, &title, &expires, &late, &visible); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load documents.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{
				"id": id, "employee_id": empID, "employee_name": name, "doc_type": docType,
				"title": title, "expires_on": expires, "late": late, "client_visible": visible,
			})
		}
		response.OK(w, out, "OK")
	}
}

func setDocumentExpiry(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		var body struct {
			ExpiresOn string `json:"expires_on"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON.", "ERR_BAD_REQUEST")
			return
		}
		expires := strings.TrimSpace(body.ExpiresOn)
		tag, err := pool.Exec(r.Context(), `
			update public.hr_employee_documents
			set expires_on = nullif($3, '')::date, updated_at = now()
			where id = $1 and tenant_id = $2`, chi.URLParam(r, "id"), tu.TenantID, expires)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Document not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"ok": true}, "Updated.")
	}
}

func setDocumentVisibility(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		var body struct {
			ClientVisible bool `json:"client_visible"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON.", "ERR_BAD_REQUEST")
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.hr_employee_documents
			set client_visible = $3, updated_at = now()
			where id = $1 and tenant_id = $2`, chi.URLParam(r, "id"), tu.TenantID, body.ClientVisible)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Document not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"client_visible": body.ClientVisible}, "Updated.")
	}
}

func listJobPostings(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select p.id, p.site_id, s.site_name, c.name, p.title, p.headcount, p.status, p.manpower_request_id
			from public.hr_job_postings p
			join public.hr_client_sites s on s.id = p.site_id and s.tenant_id = p.tenant_id
			join public.hr_clients c on c.id = s.client_id and c.tenant_id = p.tenant_id
			where p.tenant_id = $1
			order by p.id desc limit 200`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load postings.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id, siteID int64
			var site, client, title, status string
			var head int
			var reqID *int64
			if err := rows.Scan(&id, &siteID, &site, &client, &title, &head, &status, &reqID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load postings.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{
				"id": id, "site_id": siteID, "site_name": site, "client_name": client, "title": title,
				"headcount": head, "status": status, "manpower_request_id": reqID,
			})
		}
		response.OK(w, out, "OK")
	}
}

func createJobPosting(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		var body struct {
			SiteID             int64  `json:"site_id"`
			Title              string `json:"title"`
			Headcount          int    `json:"headcount"`
			ManpowerRequestID  int64  `json:"manpower_request_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.SiteID == 0 || strings.TrimSpace(body.Title) == "" || body.Headcount < 1 {
			response.Validation(w, map[string]string{"title": "Choose a site, a title, and a headcount."})
			return
		}
		if err := requireSite(r, pool, tu.TenantID, body.SiteID); err != nil {
			writeAgencyErr(w, err)
			return
		}
		var reqArg any
		if body.ManpowerRequestID > 0 {
			var reqSite int64
			err := pool.QueryRow(r.Context(), `
				select site_id from public.hr_manpower_requests where id = $1 and tenant_id = $2`,
				body.ManpowerRequestID, tu.TenantID).Scan(&reqSite)
			if err != nil || reqSite != body.SiteID {
				response.Validation(w, map[string]string{"manpower_request_id": "Request must belong to the same site."})
				return
			}
			reqArg = body.ManpowerRequestID
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.hr_job_postings (tenant_id, site_id, title, headcount, manpower_request_id)
			values ($1,$2,$3,$4,$5) returning id`, tu.TenantID, body.SiteID, strings.TrimSpace(body.Title), body.Headcount, reqArg).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the posting.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Created.")
	}
}

func publishOpeningFromRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		reqID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || reqID <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid request."})
			return
		}
		var body struct {
			Title string `json:"title"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		var siteID int64
		var headcount int
		var details string
		err = pool.QueryRow(r.Context(), `
			select site_id, headcount, details from public.hr_manpower_requests
			where id = $1 and tenant_id = $2`, reqID, tu.TenantID).Scan(&siteID, &headcount, &details)
		if errors.Is(err, pgx.ErrNoRows) {
			response.Err(w, http.StatusNotFound, "Request not found.", "ERR_NOT_FOUND")
			return
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load request.", "ERR_INTERNAL")
			return
		}
		title := strings.TrimSpace(body.Title)
		if title == "" {
			title = strings.TrimSpace(details)
		}
		if title == "" {
			title = "Open role"
		}
		if headcount < 1 {
			headcount = 1
		}
		var id int64
		err = pool.QueryRow(r.Context(), `
			insert into public.hr_job_postings (tenant_id, site_id, title, headcount, manpower_request_id)
			values ($1,$2,$3,$4,$5) returning id`, tu.TenantID, siteID, title, headcount, reqID).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to publish opening.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": id, "manpower_request_id": reqID, "site_id": siteID}, "Opening published.")
	}
}

func listWithholdingReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		year, _ := strconv.Atoi(r.URL.Query().Get("year"))
		if year < 2000 || year > 2100 {
			response.Validation(w, map[string]string{"year": "Enter a year."})
			return
		}
		rows, err := pool.Query(r.Context(), `
			select e.employee_no, e.full_name, coalesce(e.tin, ''), coalesce(sum(pl.amount), 0)::float8
			from public.hr_employees e
			left join public.hr_payslips ps on ps.employee_id = e.id and ps.tenant_id = e.tenant_id
			left join public.hr_pay_periods pp on pp.id = ps.pay_period_id
			  and pp.period_start >= make_date($2, 1, 1) and pp.period_end <= make_date($2, 12, 31)
			left join public.hr_payslip_lines pl on pl.payslip_id = ps.id and pl.line_code = 'WHT'
			where e.tenant_id = $1
			group by e.id, e.employee_no, e.full_name, e.tin
			order by e.full_name`, tu.TenantID, year)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load the withholding report.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var no, name, tin string
			var amount float64
			if err := rows.Scan(&no, &name, &tin, &amount); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load the withholding report.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{"employee_no": no, "employee_name": name, "tin": tin, "withholding": amount})
		}
		response.OK(w, out, "OK")
	}
}

var errAgencySite = errors.New("site")

func requireSite(r *http.Request, pool *pgxpool.Pool, tenantID, siteID int64) error {
	var id int64
	err := pool.QueryRow(r.Context(), `select id from public.hr_client_sites where id = $1 and tenant_id = $2`, siteID, tenantID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return errAgencySite
	}
	return err
}

func writeAgencyErr(w http.ResponseWriter, err error) {
	if errors.Is(err, errAgencySite) {
		response.Validation(w, map[string]string{"site_id": "Choose a site."})
		return
	}
	response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
}
