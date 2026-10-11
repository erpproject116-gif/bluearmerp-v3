package services

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customfields"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth/datascope"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const entityRequest = "svc_request"

type requestBody struct {
	LocationID            int64          `json:"location_id"`
	PartnerID             *int64         `json:"partner_id"`
	ServiceTypeID         int64          `json:"service_type_id"`
	Source                string         `json:"source"`
	Subject               string         `json:"subject"`
	Description           string         `json:"description"`
	Priority              string         `json:"priority"`
	ContactName           string         `json:"contact_name"`
	Phone                 string         `json:"phone"`
	Email                 string         `json:"email"`
	RequestedOn           string         `json:"requested_on"`
	ServiceLocation       string         `json:"service_location"`
	Status                string         `json:"status"`
	CoordinatorEmployeeID *int64         `json:"coordinator_employee_id"`
	OrderDate             string         `json:"order_date"`
	CustomValues          map[string]any `json:"custom_values"`
}

func listRequests(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		page, per := pageParams(r)
		args := []any{tu.TenantID}
		where := "where r.tenant_id = $1 and r.deleted_at is null"
		n := 2
		if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
			where += " and (r.request_no ilike $" + strconv.Itoa(n) + " or r.subject ilike $" + strconv.Itoa(n) + ")"
			args = append(args, "%"+q+"%")
			n++
		}
		if st := strings.TrimSpace(r.URL.Query().Get("status")); st != "" {
			where += " and r.status = $" + strconv.Itoa(n)
			args = append(args, st)
			n++
		}
		frag, _, err := datascope.ApplyUserScopesSQL(r.Context(), pool, tu, datascope.ListFilter{
			CustomerColumn: "r.partner_id",
			LocationColumn: "r.location_id",
		}, n, &args)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to apply branch scope.", "ERR_INTERNAL")
			return
		}
		where += frag
		var total int64
		if err := pool.QueryRow(r.Context(), `select count(*) from public.svc_requests r `+where, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list requests.", "ERR_INTERNAL")
			return
		}
		args = append(args, per, (page-1)*per)
		rows, err := pool.Query(r.Context(), `
			select r.id, r.request_no, r.order_date::text, r.subject, r.status, r.source, r.priority,
			  r.location_id, r.partner_id, r.service_type_id, coalesce(p.company_name, '')
			from public.svc_requests r
			left join public.inv_partners p on p.id = r.partner_id
			`+where+` order by r.order_date desc, r.id desc
			limit $`+strconv.Itoa(len(args)-1)+` offset $`+strconv.Itoa(len(args)), args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list requests.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id, locationID, typeID int64
			var partnerID *int64
			var no, date, subject, status, source, priority, customer string
			if err := rows.Scan(&id, &no, &date, &subject, &status, &source, &priority, &locationID, &partnerID, &typeID, &customer); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to list requests.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{
				"id": id, "request_no": no, "order_date": date, "subject": subject, "status": status,
				"source": source, "priority": priority, "location_id": locationID, "partner_id": partnerID,
				"service_type_id": typeID, "customer_name": customer,
			})
		}
		response.OKList(w, out, page, per, total)
	}
}

func getRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r, "id")
		if !ok {
			return
		}
		row, err := loadRequest(r, pool, tu, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Request not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, row, "OK")
	}
}

func loadRequest(r *http.Request, pool *pgxpool.Pool, tu auth.TenantUser, id int64) (map[string]any, error) {
	var tenantID, locationID, typeID int64
	var partnerID, coordinator *int64
	var no, date, subject, description, status, source, priority, contact, phone, email, loc string
	var requested *string
	err := pool.QueryRow(r.Context(), `
		select tenant_id, location_id, partner_id, service_type_id, request_no, order_date::text,
		  subject, description, status, source, priority, contact_name, phone, email,
		  requested_on::text, service_location, coordinator_employee_id
		from public.svc_requests
		where id = $1 and tenant_id = $2 and deleted_at is null`, id, tu.TenantID).Scan(
		&tenantID, &locationID, &partnerID, &typeID, &no, &date, &subject, &description, &status,
		&source, &priority, &contact, &phone, &email, &requested, &loc, &coordinator)
	if err != nil {
		return nil, err
	}
	if err := denyCrossTenant(tenantID, tu.TenantID); err != nil {
		return nil, err
	}
	vals, _ := customfields.LoadValues(r.Context(), pool, tu.TenantID, entityRequest, id)
	return map[string]any{
		"id": id, "location_id": locationID, "partner_id": partnerID, "service_type_id": typeID,
		"request_no": no, "order_date": date, "subject": subject, "description": description,
		"status": status, "source": source, "priority": priority, "contact_name": contact,
		"phone": phone, "email": email, "requested_on": requested, "service_location": loc,
		"coordinator_employee_id": coordinator, "custom_values": vals,
	}, nil
}

func createRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		var body requestBody
		if !decodeJSON(w, r, &body) {
			return
		}
		if err := assertLocation(r.Context(), pool, tu, body.LocationID); err != nil {
			branchDenied(w, err)
			return
		}
		orderDate, err := parseDate(body.OrderDate)
		if err != nil {
			response.Validation(w, map[string]string{"order_date": "Use YYYY-MM-DD."})
			return
		}
		source := body.Source
		if source == "" {
			source = "manual"
		}
		switch source {
		case "walk_in", "phone", "email", "portal", "manual":
		default:
			response.Validation(w, map[string]string{"source": "Unknown request source."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the request.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		if err := ensureFoundation(r.Context(), tx, tu.TenantID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to prepare services.", "ERR_INTERNAL")
			return
		}
		cfg, err := loadTypeConfig(r.Context(), tx, tu.TenantID, body.ServiceTypeID)
		if err != nil {
			response.Validation(w, map[string]string{"service_type_id": "Choose a service type."})
			return
		}
		if err := partnerRequired(cfg, body.PartnerID); err != nil {
			response.Validation(w, map[string]string{"partner_id": err.Error()})
			return
		}
		if body.CoordinatorEmployeeID != nil {
			if err := employeeInTenant(r.Context(), tx, tu.TenantID, *body.CoordinatorEmployeeID); err != nil {
				response.Validation(w, map[string]string{"coordinator_employee_id": "Technician must be an employee in this company."})
				return
			}
		}
		dateSeq, docNo, err := allocate(r.Context(), tx, "public.allocate_svc_request_sequences", tu.TenantID, orderDate)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to number the request.", "ERR_INTERNAL")
			return
		}
		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.svc_requests (
			  tenant_id, location_id, partner_id, service_type_id, request_no, order_date, date_seq,
			  source, subject, description, priority, contact_name, phone, email, requested_on,
			  service_location, coordinator_employee_id, created_by_user_id
			) values (
			  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, nullif($15,'')::date, $16, $17, $18
			) returning id`,
			tu.TenantID, body.LocationID, int64OrNil(body.PartnerID), body.ServiceTypeID, docNo, orderDate, dateSeq,
			source, body.Subject, body.Description, defaultPriority(body.Priority), body.ContactName, body.Phone, body.Email,
			body.RequestedOn, body.ServiceLocation, int64OrNil(body.CoordinatorEmployeeID), tu.AppUserID,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the request.", "ERR_INTERNAL")
			return
		}
		if cerrs := customfields.ValidateAndSave(r.Context(), tx, tu.TenantID, entityRequest, id, body.CustomValues); len(cerrs) > 0 {
			response.Validation(w, cerrs)
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the request.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": id, "request_no": docNo}, "Created.")
	}
}

func patchRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r, "id")
		if !ok {
			return
		}
		var body requestBody
		if !decodeJSON(w, r, &body) {
			return
		}
		var from string
		err := pool.QueryRow(r.Context(), `
			select status from public.svc_requests where id = $1 and tenant_id = $2 and deleted_at is null`,
			id, tu.TenantID).Scan(&from)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Request not found.", "ERR_NOT_FOUND")
			return
		}
		status := body.Status
		if status == "" {
			status = from
		}
		if status == "converted" && from != "converted" {
			response.Validation(w, map[string]string{"status": "Use convert to create the job."})
			return
		}
		if status != from {
			okMove, err := transitionAllowed(r.Context(), pool, tu.TenantID, from, status)
			if err != nil || !okMove {
				response.Validation(w, map[string]string{"status": "That status change is not allowed."})
				return
			}
		}
		tag, err := pool.Exec(r.Context(), `
			update public.svc_requests set
			  subject = $3, description = $4, priority = $5, contact_name = $6, phone = $7, email = $8,
			  service_location = $9, status = $10, updated_at = now()
			where id = $1 and tenant_id = $2 and deleted_at is null`,
			id, tu.TenantID, body.Subject, body.Description, defaultPriority(body.Priority),
			body.ContactName, body.Phone, body.Email, body.ServiceLocation, status)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusInternalServerError, "Failed to update the request.", "ERR_INTERNAL")
			return
		}
		if status != from {
			_ = insertEvent(r.Context(), pool, tu.TenantID, "svc_request", id, "status", from, status, tu.AppUserID, "")
		}
		response.OK(w, map[string]any{"id": id, "status": status}, "Saved.")
	}
}

func deleteRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r, "id")
		if !ok {
			return
		}
		var status string
		err := pool.QueryRow(r.Context(), `
			select status from public.svc_requests where id = $1 and tenant_id = $2 and deleted_at is null`,
			id, tu.TenantID).Scan(&status)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Request not found.", "ERR_NOT_FOUND")
			return
		}
		if err := canSoftDeleteDraft(status); err != nil {
			response.Err(w, http.StatusConflict, "Only a new request with no job can be deleted.", "ERR_CONFLICT")
			return
		}
		_, err = pool.Exec(r.Context(), `
			update public.svc_requests set deleted_at = now(), updated_at = now()
			where id = $1 and tenant_id = $2`, id, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to delete the request.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Deleted.")
	}
}

func convertRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r, "id")
		if !ok {
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to convert the request.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		var tenantID, locationID, typeID int64
		var partnerID *int64
		var status, subject, description string
		err = tx.QueryRow(r.Context(), `
			select tenant_id, location_id, partner_id, service_type_id, status, subject, description
			from public.svc_requests
			where id = $1 and tenant_id = $2 and deleted_at is null
			for update`, id, tu.TenantID).Scan(&tenantID, &locationID, &partnerID, &typeID, &status, &subject, &description)
		if err != nil || denyCrossTenant(tenantID, tu.TenantID) != nil {
			response.Err(w, http.StatusNotFound, "Request not found.", "ERR_NOT_FOUND")
			return
		}
		var existing int64
		_ = tx.QueryRow(r.Context(), `
			select id from public.svc_jobs
			where tenant_id = $1 and request_id = $2 and deleted_at is null`, tu.TenantID, id).Scan(&existing)
		jobID, create := existingOrCreate(existing)
		if !create {
			var jobNo string
			_ = tx.QueryRow(r.Context(), `select job_no from public.svc_jobs where id = $1 and tenant_id = $2`, jobID, tu.TenantID).Scan(&jobNo)
			if err := tx.Commit(r.Context()); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to convert the request.", "ERR_INTERNAL")
				return
			}
			response.OK(w, map[string]any{"id": jobID, "job_no": jobNo, "created": false}, "Existing job returned.")
			return
		}
		if status == "cancelled" || status == "rejected" || status == "duplicate" {
			response.Validation(w, map[string]string{"status": "This request cannot be converted."})
			return
		}
		created, jobNo, err := insertJob(r, tx, pool, tu, jobInput{
			LocationID: locationID, ServiceTypeID: typeID, PartnerID: partnerID,
			RequestID: &id, Subject: subject, Description: description,
		})
		if err != nil {
			response.Validation(w, map[string]string{"request": err.Error()})
			return
		}
		if _, err := tx.Exec(r.Context(), `
			update public.svc_requests set status = 'converted', updated_at = now()
			where id = $1 and tenant_id = $2`, id, tu.TenantID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to convert the request.", "ERR_INTERNAL")
			return
		}
		_ = insertEvent(r.Context(), tx, tu.TenantID, "svc_request", id, "convert", status, "converted", tu.AppUserID, "")
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to convert the request.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": created, "job_no": jobNo, "created": true}, "Job created.")
	}
}

func defaultPriority(p string) string {
	if strings.TrimSpace(p) == "" {
		return "normal"
	}
	return p
}
