package services

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth/datascope"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customfields"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const entityJob = "svc_job"

type jobInput struct {
	LocationID            int64
	ServiceTypeID         int64
	PartnerID             *int64
	RequestID             *int64
	SalesOrderID          *int64
	QuotationID           *int64
	Subject               string
	Description           string
	Diagnosis             string
	Priority              string
	OrderDate             string
	CoordinatorEmployeeID *int64
	CustomValues          map[string]any
}

type jobBody struct {
	LocationID            int64          `json:"location_id"`
	ServiceTypeID         int64          `json:"service_type_id"`
	PartnerID             *int64         `json:"partner_id"`
	QuotationID           *int64         `json:"quotation_id"`
	Subject               string         `json:"subject"`
	Description           string         `json:"description"`
	Diagnosis             string         `json:"diagnosis"`
	Priority              string         `json:"priority"`
	OrderDate             string         `json:"order_date"`
	DueAt                 *string        `json:"due_at"`
	CoordinatorEmployeeID *int64         `json:"coordinator_employee_id"`
	RowVersion            int            `json:"row_version"`
	QCPassed              *bool          `json:"qc_passed"`
	CustomerApproved      *bool          `json:"customer_approved"`
	CustomValues          map[string]any `json:"custom_values"`
}

func insertJob(r *http.Request, tx pgx.Tx, pool *pgxpool.Pool, tu auth.TenantUser, in jobInput) (int64, string, error) {
	if err := ensureFoundation(r.Context(), tx, tu.TenantID); err != nil {
		return 0, "", err
	}
	cfg, err := loadTypeConfig(r.Context(), tx, tu.TenantID, in.ServiceTypeID)
	if err != nil {
		return 0, "", errors.New("choose a service type")
	}
	if err := partnerRequired(cfg, in.PartnerID); err != nil {
		return 0, "", err
	}
	if in.CoordinatorEmployeeID != nil {
		if err := employeeInTenant(r.Context(), tx, tu.TenantID, *in.CoordinatorEmployeeID); err != nil {
			return 0, "", errors.New("coordinator must be an employee in this company")
		}
	}
	orderDate, err := parseDate(in.OrderDate)
	if err != nil {
		return 0, "", errors.New("use YYYY-MM-DD for the order date")
	}
	raw, err := json.Marshal(cfg)
	if err != nil {
		return 0, "", err
	}
	dateSeq, docNo, err := allocate(r.Context(), tx, "public.allocate_svc_job_sequences", tu.TenantID, orderDate)
	if err != nil {
		return 0, "", err
	}
	var id int64
	err = tx.QueryRow(r.Context(), `
		insert into public.svc_jobs (
		  tenant_id, location_id, service_type_id, type_config_snapshot, request_id, sales_order_id,
		  quotation_id, partner_id, job_no, order_date, date_seq, subject, description, diagnosis,
		  priority, coordinator_employee_id, created_by_user_id
		) values (
		  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
		) returning id`,
		tu.TenantID, in.LocationID, in.ServiceTypeID, raw, int64OrNil(in.RequestID), int64OrNil(in.SalesOrderID),
		int64OrNil(in.QuotationID), int64OrNil(in.PartnerID), docNo, orderDate, dateSeq,
		in.Subject, in.Description, in.Diagnosis, defaultPriority(in.Priority),
		int64OrNil(in.CoordinatorEmployeeID), tu.AppUserID,
	).Scan(&id)
	if err != nil {
		return 0, "", err
	}
	if cfg.ChecklistTemplateID != nil {
		if err := copyChecklist(r, tx, tu.TenantID, id, *cfg.ChecklistTemplateID); err != nil {
			return 0, "", err
		}
	}
	if cerrs := customfields.ValidateAndSave(r.Context(), tx, tu.TenantID, entityJob, id, in.CustomValues); len(cerrs) > 0 {
		return 0, "", errors.New("custom field validation failed")
	}
	if in.SalesOrderID != nil && *in.SalesOrderID > 0 {
		_, _ = tx.Exec(r.Context(), `
			insert into public.svc_document_links (tenant_id, job_id, doc_type, doc_id, idempotency_key)
			values ($1, $2, 'sales_order', $3, $4)
			on conflict (tenant_id, idempotency_key) do nothing`,
			tu.TenantID, id, *in.SalesOrderID, "so:"+strconv.FormatInt(*in.SalesOrderID, 10))
	}
	_ = pool
	return id, docNo, nil
}

func copyChecklist(r *http.Request, tx pgx.Tx, tenantID, jobID, templateID int64) error {
	var raw []byte
	err := tx.QueryRow(r.Context(), `
		select items from public.svc_checklist_templates
		where id = $1 and tenant_id = $2`, templateID, tenantID).Scan(&raw)
	if err != nil {
		return err
	}
	var items []struct {
		Key   string `json:"key"`
		Label string `json:"label"`
	}
	if err := json.Unmarshal(raw, &items); err != nil {
		return err
	}
	for _, item := range items {
		if _, err := tx.Exec(r.Context(), `
			insert into public.svc_checklist_results (tenant_id, job_id, template_id, item_key, label)
			values ($1, $2, $3, $4, $5)
			on conflict (job_id, item_key) do nothing`,
			tenantID, jobID, templateID, item.Key, item.Label); err != nil {
			return err
		}
	}
	return nil
}

func listJobs(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		page, per := pageParams(r)
		args := []any{tu.TenantID}
		where := "where j.tenant_id = $1 and j.deleted_at is null"
		n := 2
		if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
			where += " and (j.job_no ilike $" + strconv.Itoa(n) + " or j.subject ilike $" + strconv.Itoa(n) + ")"
			args = append(args, "%"+q+"%")
			n++
		}
		if st := strings.TrimSpace(r.URL.Query().Get("operational_status")); st != "" {
			where += " and j.operational_status = $" + strconv.Itoa(n)
			args = append(args, st)
			n++
		}
		if so := strings.TrimSpace(r.URL.Query().Get("sales_order_id")); so != "" {
			soID, err := strconv.ParseInt(so, 10, 64)
			if err != nil {
				response.Validation(w, map[string]string{"sales_order_id": "Invalid sales order."})
				return
			}
			where += " and j.sales_order_id = $" + strconv.Itoa(n)
			args = append(args, soID)
			n++
		}
		frag, _, err := datascope.ApplyUserScopesSQL(r.Context(), pool, tu, datascope.ListFilter{
			CustomerColumn: "j.partner_id",
			LocationColumn: "j.location_id",
		}, n, &args)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to apply branch scope.", "ERR_INTERNAL")
			return
		}
		where += frag
		var total int64
		if err := pool.QueryRow(r.Context(), `select count(*) from public.svc_jobs j `+where, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list jobs.", "ERR_INTERNAL")
			return
		}
		args = append(args, per, (page-1)*per)
		rows, err := pool.Query(r.Context(), `
			select j.id, j.job_no, j.order_date::text, j.subject, j.operational_status, j.approval_status,
			  j.inventory_posting_status, j.billing_status, j.location_id, j.partner_id, j.sales_order_id,
			  j.row_version, coalesce(p.company_name, '')
			from public.svc_jobs j
			left join public.inv_partners p on p.id = j.partner_id
			`+where+` order by j.updated_at desc
			limit $`+strconv.Itoa(len(args)-1)+` offset $`+strconv.Itoa(len(args)), args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list jobs.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id, locationID int64
			var partnerID, salesOrderID *int64
			var no, date, subject, op, ap, inv, bill, customer string
			var version int
			if err := rows.Scan(&id, &no, &date, &subject, &op, &ap, &inv, &bill, &locationID, &partnerID, &salesOrderID, &version, &customer); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to list jobs.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{
				"id": id, "job_no": no, "order_date": date, "subject": subject,
				"operational_status": op, "approval_status": ap,
				"inventory_posting_status": inv, "billing_status": bill,
				"location_id": locationID, "partner_id": partnerID, "sales_order_id": salesOrderID,
				"row_version": version, "customer_name": customer,
			})
		}
		response.OKList(w, out, page, per, total)
	}
}

func getJob(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r, "id")
		if !ok {
			return
		}
		row, err := loadJob(r, pool, tu, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Job not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, row, "OK")
	}
}

func loadJob(r *http.Request, pool *pgxpool.Pool, tu auth.TenantUser, id int64) (map[string]any, error) {
	var tenantID, locationID, typeID int64
	var partnerID, requestID, salesOrderID, quotationID, coordinator *int64
	var no, date, subject, description, diagnosis, priority, op, ap, inv, bill string
	var qc, customerApproved bool
	var version int
	var snapshot []byte
	var due *time.Time
	err := pool.QueryRow(r.Context(), `
		select tenant_id, location_id, service_type_id, type_config_snapshot, request_id, sales_order_id,
		  quotation_id, partner_id, job_no, order_date::text, subject, description, diagnosis, priority,
		  operational_status, approval_status, inventory_posting_status, billing_status,
		  qc_passed, customer_approved, due_at, coordinator_employee_id, row_version
		from public.svc_jobs
		where id = $1 and tenant_id = $2 and deleted_at is null`, id, tu.TenantID).Scan(
		&tenantID, &locationID, &typeID, &snapshot, &requestID, &salesOrderID, &quotationID, &partnerID,
		&no, &date, &subject, &description, &diagnosis, &priority, &op, &ap, &inv, &bill,
		&qc, &customerApproved, &due, &coordinator, &version)
	if err != nil {
		return nil, err
	}
	if err := denyCrossTenant(tenantID, tu.TenantID); err != nil {
		return nil, err
	}
	var cfg any
	_ = json.Unmarshal(snapshot, &cfg)
	vals, _ := customfields.LoadValues(r.Context(), pool, tu.TenantID, entityJob, id)
	return map[string]any{
		"id": id, "location_id": locationID, "service_type_id": typeID, "type_config_snapshot": cfg,
		"request_id": requestID, "sales_order_id": salesOrderID, "quotation_id": quotationID,
		"partner_id": partnerID, "job_no": no, "order_date": date, "subject": subject,
		"description": description, "diagnosis": diagnosis, "priority": priority,
		"operational_status": op, "approval_status": ap, "inventory_posting_status": inv,
		"billing_status": bill, "qc_passed": qc, "customer_approved": customerApproved,
		"due_at": due, "coordinator_employee_id": coordinator, "row_version": version,
		"custom_values": vals,
	}, nil
}

func createJob(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		var body jobBody
		if !decodeJSON(w, r, &body) {
			return
		}
		if err := assertLocation(r.Context(), pool, tu, body.LocationID); err != nil {
			branchDenied(w, err)
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the job.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		id, jobNo, err := insertJob(r, tx, pool, tu, jobInput{
			LocationID: body.LocationID, ServiceTypeID: body.ServiceTypeID, PartnerID: body.PartnerID,
			QuotationID: body.QuotationID, Subject: body.Subject, Description: body.Description,
			Diagnosis: body.Diagnosis, Priority: body.Priority, OrderDate: body.OrderDate,
			CoordinatorEmployeeID: body.CoordinatorEmployeeID, CustomValues: body.CustomValues,
		})
		if err != nil {
			response.Validation(w, map[string]string{"job": err.Error()})
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the job.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": id, "job_no": jobNo}, "Created.")
	}
}

func patchJob(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r, "id")
		if !ok {
			return
		}
		var body jobBody
		if !decodeJSON(w, r, &body) {
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update the job.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		tag, err := tx.Exec(r.Context(), `
			update public.svc_jobs set
			  subject = $3, description = $4, diagnosis = $5, priority = $6,
			  qc_passed = coalesce($7, qc_passed),
			  customer_approved = coalesce($8, customer_approved),
			  row_version = row_version + 1, updated_at = now()
			where id = $1 and tenant_id = $2 and deleted_at is null and row_version = $9`,
			id, tu.TenantID, body.Subject, body.Description, body.Diagnosis, defaultPriority(body.Priority),
			body.QCPassed, body.CustomerApproved, body.RowVersion)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update the job.", "ERR_INTERNAL")
			return
		}
		if tag.RowsAffected() == 0 {
			conflict(w)
			return
		}
		if cerrs := customfields.ValidateAndSave(r.Context(), tx, tu.TenantID, entityJob, id, body.CustomValues); len(cerrs) > 0 {
			response.Validation(w, cerrs)
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update the job.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Saved.")
	}
}

func patchJobStatus(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r, "id")
		if !ok {
			return
		}
		var body struct {
			OperationalStatus string `json:"operational_status"`
			ApprovalStatus    string `json:"approval_status"`
			RowVersion        int    `json:"row_version"`
			Reason            string `json:"reason"`
		}
		if !decodeJSON(w, r, &body) {
			return
		}
		if err := validateStatusPatch(body.ApprovalStatus, body.OperationalStatus); err != nil {
			response.Validation(w, map[string]string{"approval_status": "Confirm the job with the confirm action. Status update cannot approve it."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update status.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		var from string
		var version int
		err = tx.QueryRow(r.Context(), `
			select operational_status, row_version from public.svc_jobs
			where id = $1 and tenant_id = $2 and deleted_at is null
			for update`, id, tu.TenantID).Scan(&from, &version)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Job not found.", "ERR_NOT_FOUND")
			return
		}
		if version != body.RowVersion {
			conflict(w)
			return
		}
		to := strings.TrimSpace(body.OperationalStatus)
		if to == "" || to == from {
			response.OK(w, map[string]any{"id": id, "operational_status": from}, "No change.")
			return
		}
		allowed, err := transitionAllowed(r.Context(), tx, tu.TenantID, from, to)
		if err != nil || !allowed {
			response.Validation(w, map[string]string{"operational_status": "That status change is not allowed."})
			return
		}
		tag, err := tx.Exec(r.Context(), `
			update public.svc_jobs
			set operational_status = $3, row_version = row_version + 1, updated_at = now()
			where id = $1 and tenant_id = $2 and row_version = $4`, id, tu.TenantID, to, version)
		if err != nil || tag.RowsAffected() == 0 {
			conflict(w)
			return
		}
		if err := insertEvent(r.Context(), tx, tu.TenantID, "svc_job", id, "status", from, to, tu.AppUserID, body.Reason); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to record status history.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update status.", "ERR_INTERNAL")
			return
		}
		if to == "cancelled" {
			_ = auditSync(r.Context(), pool, tu.TenantID, tu.AppUserID, "services.job.cancel", "svc_job", id,
				map[string]any{"operational_status": from}, map[string]any{"operational_status": to, "reason": body.Reason})
		}
		response.OK(w, map[string]any{"id": id, "operational_status": to}, "Updated.")
	}
}

func confirmJob(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r, "id")
		if !ok {
			return
		}
		var body struct {
			RowVersion int `json:"row_version"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to confirm the job.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		var approval, diagnosis, op string
		var version int
		var snapshot []byte
		var qc, customerApproved bool
		err = tx.QueryRow(r.Context(), `
			select approval_status, operational_status, diagnosis, qc_passed, customer_approved,
			  type_config_snapshot, row_version
			from public.svc_jobs
			where id = $1 and tenant_id = $2 and deleted_at is null
			for update`, id, tu.TenantID).Scan(&approval, &op, &diagnosis, &qc, &customerApproved, &snapshot, &version)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Job not found.", "ERR_NOT_FOUND")
			return
		}
		if body.RowVersion > 0 && body.RowVersion != version {
			conflict(w)
			return
		}
		if approval == "approved" {
			if err := tx.Commit(r.Context()); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to confirm the job.", "ERR_INTERNAL")
				return
			}
			response.OK(w, map[string]any{"id": id, "approval_status": "approved", "created": false}, "Already confirmed.")
			return
		}
		var cfg TypeConfig
		_ = json.Unmarshal(snapshot, &cfg)
		if cfg.DiagnosisRequired && strings.TrimSpace(diagnosis) == "" {
			response.Validation(w, map[string]string{"diagnosis": "Diagnosis is required before confirmation."})
			return
		}
		if cfg.QualityCheckRequired && !qc {
			response.Validation(w, map[string]string{"qc_passed": "Quality check is required before confirmation."})
			return
		}
		if cfg.CustomerApprovalRequired && !customerApproved {
			response.Validation(w, map[string]string{"customer_approved": "Customer approval is required before confirmation."})
			return
		}
		if cfg.TechnicianRequired {
			var n int
			_ = tx.QueryRow(r.Context(), `select count(*) from public.svc_assignments where job_id = $1 and tenant_id = $2`, id, tu.TenantID).Scan(&n)
			if n == 0 {
				response.Validation(w, map[string]string{"assignments": "Assign a technician before confirmation."})
				return
			}
		}
		var openItems int
		_ = tx.QueryRow(r.Context(), `
			select count(*) from public.svc_checklist_results
			where job_id = $1 and tenant_id = $2 and is_done = false`, id, tu.TenantID).Scan(&openItems)
		if openItems > 0 {
			response.Validation(w, map[string]string{"checklist": "Finish the checklist before confirmation."})
			return
		}
		if cfg.LoadSlipRequired {
			var slips int
			_ = tx.QueryRow(r.Context(), `
				select count(*) from public.svc_load_slips
				where job_id = $1 and tenant_id = $2 and deleted_at is null and status <> 'cancelled'`, id, tu.TenantID).Scan(&slips)
			if slips == 0 {
				response.Validation(w, map[string]string{"load_slip": "A service release slip is required before confirmation."})
				return
			}
		}
		tag, err := tx.Exec(r.Context(), `
			update public.svc_jobs
			set approval_status = 'approved', row_version = row_version + 1, updated_at = now()
			where id = $1 and tenant_id = $2 and approval_status <> 'approved'`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() != 1 {
			response.Err(w, http.StatusInternalServerError, "Failed to confirm the job.", "ERR_INTERNAL")
			return
		}
		if err := insertEvent(r.Context(), tx, tu.TenantID, "svc_job", id, "confirm", approval, "approved", tu.AppUserID, ""); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to record confirmation.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to confirm the job.", "ERR_INTERNAL")
			return
		}
		_ = auditSync(r.Context(), pool, tu.TenantID, tu.AppUserID, "services.job.confirm", "svc_job", id,
			map[string]any{"approval_status": approval, "operational_status": op},
			map[string]any{"approval_status": "approved", "inventory_posting_status": "not_applicable", "billing_status": "not_applicable"})
		response.OK(w, map[string]any{
			"id": id, "approval_status": "approved",
			"inventory_posting_status": "not_applicable", "billing_status": "not_applicable",
		}, "Confirmed. No inventory or accounting documents were created.")
	}
}

func reopenJob(pool *pgxpool.Pool) http.HandlerFunc {
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
			response.Err(w, http.StatusInternalServerError, "Failed to reopen the job.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		var op, approval string
		err = tx.QueryRow(r.Context(), `
			select operational_status, approval_status from public.svc_jobs
			where id = $1 and tenant_id = $2 and deleted_at is null for update`, id, tu.TenantID).Scan(&op, &approval)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Job not found.", "ERR_NOT_FOUND")
			return
		}
		_, err = tx.Exec(r.Context(), `
			update public.svc_jobs
			set operational_status = 'in_progress', approval_status = 'pending',
			    row_version = row_version + 1, updated_at = now()
			where id = $1 and tenant_id = $2`, id, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to reopen the job.", "ERR_INTERNAL")
			return
		}
		_ = insertEvent(r.Context(), tx, tu.TenantID, "svc_job", id, "reopen", op, "in_progress", tu.AppUserID, "")
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to reopen the job.", "ERR_INTERNAL")
			return
		}
		_ = auditSync(r.Context(), pool, tu.TenantID, tu.AppUserID, "services.job.reopen", "svc_job", id,
			map[string]any{"operational_status": op, "approval_status": approval},
			map[string]any{"operational_status": "in_progress", "approval_status": "pending"})
		response.OK(w, map[string]any{"id": id, "operational_status": "in_progress", "approval_status": "pending"}, "Reopened.")
	}
}

func deleteJob(pool *pgxpool.Pool) http.HandlerFunc {
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
			select operational_status from public.svc_jobs
			where id = $1 and tenant_id = $2 and deleted_at is null`, id, tu.TenantID).Scan(&status)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Job not found.", "ERR_NOT_FOUND")
			return
		}
		if err := canSoftDeleteDraft(status); err != nil {
			response.Err(w, http.StatusConflict, "Only draft jobs can be deleted.", "ERR_CONFLICT")
			return
		}
		_, err = pool.Exec(r.Context(), `
			update public.svc_jobs set deleted_at = now(), updated_at = now()
			where id = $1 and tenant_id = $2`, id, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to delete the job.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Deleted.")
	}
}

func jobFromSalesOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		soID, ok := pathID(w, r, "salesOrderId")
		if !ok {
			return
		}
		var body struct {
			ServiceTypeID int64  `json:"service_type_id"`
			Subject       string `json:"subject"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create the job.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		var locationID, partnerID int64
		var quotationID *int64
		var soNo string
		err = tx.QueryRow(r.Context(), `
			select location_id, partner_id, source_quotation_id, sales_order_no
			from public.so_sales_orders
			where id = $1 and tenant_id = $2 and deleted_at is null
			for update`, soID, tu.TenantID).Scan(&locationID, &partnerID, &quotationID, &soNo)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Sales order not found.", "ERR_NOT_FOUND")
			return
		}
		var existing int64
		var existingNo string
		err = tx.QueryRow(r.Context(), `
			select id, job_no from public.svc_jobs
			where tenant_id = $1 and sales_order_id = $2 and deleted_at is null`, tu.TenantID, soID).Scan(&existing, &existingNo)
		jobID, create := existingOrCreate(existing)
		if !create {
			if err := tx.Commit(r.Context()); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to create the job.", "ERR_INTERNAL")
				return
			}
			response.OK(w, map[string]any{"id": jobID, "job_no": existingNo, "created": false}, "Existing job returned.")
			return
		}
		if body.ServiceTypeID <= 0 {
			response.Validation(w, map[string]string{"service_type_id": "Choose a service type."})
			return
		}
		subject := strings.TrimSpace(body.Subject)
		if subject == "" {
			subject = "Service for " + soNo
		}
		created, jobNo, err := insertJob(r, tx, pool, tu, jobInput{
			LocationID: locationID, ServiceTypeID: body.ServiceTypeID, PartnerID: &partnerID,
			SalesOrderID: &soID, QuotationID: quotationID, Subject: subject,
			Description: "Generated from sales order " + soNo,
		})
		if err != nil {
			response.Validation(w, map[string]string{"job": err.Error()})
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create the job.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": created, "job_no": jobNo, "created": true}, "Job created.")
	}
}
