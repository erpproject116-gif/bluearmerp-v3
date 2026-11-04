package hr

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

var problemCategories = map[string]struct{}{
	"attendance": {}, "performance": {}, "workplace_conflict": {}, "payroll": {}, "employee_complaint": {},
	"sick_leave": {}, "client_complaint": {}, "transfer": {}, "safety": {}, "other": {},
}

var problemStatuses = map[string]struct{}{
	"new": {}, "assigned": {}, "under_review": {}, "awaiting_response": {}, "action_required": {}, "resolved": {}, "closed": {},
}

var requestKinds = map[string]struct{}{
	"loan": {}, "salary_advance": {}, "pay_question": {}, "certificate": {}, "resignation": {},
}

func registerRelationRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/workplace-problems", listWorkplaceProblems(pool))
	r.With(auth.RequirePermission("hr.employees", auth.AccessWrite)).Post("/workplace-problems", createWorkplaceProblem(pool))
	r.With(auth.RequirePermission("hr.employees", auth.AccessWrite)).Patch("/workplace-problems/{id}", patchWorkplaceProblem(pool))
	r.With(auth.RequirePermission("hr.employees", auth.AccessWrite)).Post("/workplace-problems/{id}/files", addWorkplaceProblemFile(pool))
	r.Get("/worker-requests", listWorkerRequests(pool))
	r.With(auth.RequirePermission("hr.employees", auth.AccessWrite)).Patch("/worker-requests/{id}", closeWorkerRequest(pool))
	r.Get("/client-violations", listClientViolations(pool))
	r.With(auth.RequirePermission("hr.employees", auth.AccessWrite)).Post("/client-violations", createClientViolation(pool))
}

func registerESSRequestRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/ess/requests", essListRequests(pool))
	r.Post("/ess/requests", essCreateRequest(pool))
}

func listWorkplaceProblems(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		seePrivate := tu.IsTenantOwner || tu.HasPermission("hr.employees", auth.AccessWrite)
		rows, err := pool.Query(r.Context(), `
			select p.id, p.case_no, p.employee_id, e.full_name, p.category, p.priority, p.status, p.is_private,
			       p.description, coalesce(p.owner_user_id, 0), p.next_action, coalesce(p.target_date::text, ''),
			       (p.target_date is not null and p.target_date < current_date and p.status not in ('resolved','closed'))
			from public.hr_workplace_problems p
			join public.hr_employees e on e.id = p.employee_id
			where p.tenant_id = $1
			  and ($2::bool or p.is_private = false or p.owner_user_id = $3)
			order by p.created_at desc
			limit 300`, tu.TenantID, seePrivate, tu.AppUserID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load workplace problems.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id, empID, owner int64
			var caseNo, name, category, priority, status, description, nextAction, target string
			var private, late bool
			if err := rows.Scan(&id, &caseNo, &empID, &name, &category, &priority, &status, &private, &description, &owner, &nextAction, &target, &late); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load workplace problems.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{
				"id": id, "case_no": caseNo, "employee_id": empID, "employee_name": name, "category": category,
				"priority": priority, "status": status, "is_private": private, "description": description,
				"owner_user_id": owner, "next_action": nextAction, "target_date": target, "late": late,
			})
		}
		response.OK(w, out, "OK")
	}
}

func createWorkplaceProblem(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body struct {
			EmployeeID  int64  `json:"employee_id"`
			Category    string `json:"category"`
			Priority    string `json:"priority"`
			IsPrivate   bool   `json:"is_private"`
			Description string `json:"description"`
			OwnerUserID int64  `json:"owner_user_id"`
			NextAction  string `json:"next_action"`
			TargetDate  string `json:"target_date"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON.", "ERR_BAD_REQUEST")
			return
		}
		if _, ok := problemCategories[body.Category]; !ok || body.EmployeeID <= 0 || strings.TrimSpace(body.Description) == "" {
			response.Validation(w, map[string]string{"description": "Employee, category, and description are required."})
			return
		}
		if body.Priority == "" {
			body.Priority = "medium"
		}
		var id int64
		var caseNo string
		err := pool.QueryRow(r.Context(), `
			with next_no as (
			  select 'WP-' || lpad((count(*) + 1)::text, 4, '0') as case_no
			  from public.hr_workplace_problems where tenant_id = $1
			)
			insert into public.hr_workplace_problems
			  (tenant_id, case_no, employee_id, category, priority, is_private, description, owner_user_id, next_action, target_date, status)
			select $1, next_no.case_no, e.id, $3, $4, $5, $6, nullif($7,0), $8, nullif($9,'')::date,
			       case when $7 > 0 then 'assigned' else 'new' end
			from public.hr_employees e, next_no
			where e.id = $2 and e.tenant_id = $1 and e.deleted_at is null
			returning id, case_no`,
			tu.TenantID, body.EmployeeID, body.Category, body.Priority, body.IsPrivate, strings.TrimSpace(body.Description), body.OwnerUserID, body.NextAction, body.TargetDate,
		).Scan(&id, &caseNo)
		if err != nil {
			response.Err(w, http.StatusBadRequest, "Could not save the workplace problem.", "ERR_VALIDATION")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "hr.workplace_problem.create", "hr_workplace_problem", &id, nil, body)
		response.OK(w, map[string]any{"id": id, "case_no": caseNo}, "Created.")
	}
}

func addWorkplaceProblemFile(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if err := r.ParseMultipartForm(applicationFileMax); err != nil {
			response.Err(w, http.StatusBadRequest, "Could not read the file.", "ERR_VALIDATION")
			return
		}
		part, msg := oneUpload(r, "file", false)
		if msg != "" || part == nil {
			response.Validation(w, map[string]string{"file": msgOr(msg, "Choose a file.")})
			return
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.hr_workplace_problem_files (tenant_id, problem_id, file_name, mime_type, file_bytes)
			select $1, p.id, $3, $4, $5 from public.hr_workplace_problems p
			where p.id = $2 and p.tenant_id = $1
			returning id`, tu.TenantID, chi.URLParam(r, "id"), part.Name, part.MIME, part.Body).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Workplace problem not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Created.")
	}
}

func msgOr(msg, fallback string) string {
	if msg != "" {
		return msg
	}
	return fallback
}

func patchWorkplaceProblem(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body struct {
			Status      *string `json:"status"`
			OwnerUserID *int64  `json:"owner_user_id"`
			NextAction  *string `json:"next_action"`
			TargetDate  *string `json:"target_date"`
			Priority    *string `json:"priority"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON.", "ERR_BAD_REQUEST")
			return
		}
		if body.Status != nil {
			if _, ok := problemStatuses[*body.Status]; !ok {
				response.Validation(w, map[string]string{"status": "Unknown status."})
				return
			}
		}
		idRaw := chi.URLParam(r, "id")
		tag, err := pool.Exec(r.Context(), `
			update public.hr_workplace_problems set
			  status = coalesce($3, status),
			  owner_user_id = coalesce($4, owner_user_id),
			  next_action = coalesce($5, next_action),
			  target_date = case when $6::text is null then target_date else nullif($6,'')::date end,
			  priority = coalesce($7, priority),
			  updated_at = now()
			where id = $1 and tenant_id = $2`, idRaw, tu.TenantID, body.Status, body.OwnerUserID, body.NextAction, body.TargetDate, body.Priority)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Workplace problem not found.", "ERR_NOT_FOUND")
			return
		}
		id, _ := parseID(idRaw)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "hr.workplace_problem.update", "hr_workplace_problem", &id, nil, body)
		response.OK(w, map[string]any{"ok": true}, "Updated.")
	}
}

func listWorkerRequests(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		kind := strings.TrimSpace(r.URL.Query().Get("kind"))
		status := strings.TrimSpace(r.URL.Query().Get("status"))
		if status != "" && status != "pending" && status != "closed" {
			response.Validation(w, map[string]string{"status": "Status must be pending or closed."})
			return
		}
		rows, err := pool.Query(r.Context(), `
			select q.id, q.employee_id, e.full_name, q.kind, q.status, q.details, q.created_at::text
			from public.hr_worker_requests q
			join public.hr_employees e on e.id = q.employee_id
			where q.tenant_id = $1 and ($2 = '' or q.kind = $2) and ($3 = '' or q.status = $3)
			order by q.created_at desc limit 300`, tu.TenantID, kind, status)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load requests.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		response.OK(w, scanRequests(rows), "OK")
	}
}

func closeWorkerRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		tag, err := pool.Exec(r.Context(), `
			update public.hr_worker_requests set status = 'closed'
			where id = $1 and tenant_id = $2 and status = 'pending'`, chi.URLParam(r, "id"), tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Request not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"ok": true}, "Closed.")
	}
}

func essListRequests(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		empID, ok := essLinkedEmployeeID(w, r, pool)
		if !ok {
			return
		}
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select q.id, q.employee_id, e.full_name, q.kind, q.status, q.details, q.created_at::text
			from public.hr_worker_requests q
			join public.hr_employees e on e.id = q.employee_id
			where q.tenant_id = $1 and q.employee_id = $2
			order by q.created_at desc`, tu.TenantID, empID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load requests.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		response.OK(w, scanRequests(rows), "OK")
	}
}

func essCreateRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		empID, ok := essLinkedEmployeeID(w, r, pool)
		if !ok {
			return
		}
		tu, _ := auth.FromContext(r.Context())
		var body struct {
			Kind    string `json:"kind"`
			Details string `json:"details"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON.", "ERR_BAD_REQUEST")
			return
		}
		if _, known := requestKinds[body.Kind]; !known {
			response.Validation(w, map[string]string{"kind": "Choose loan, salary advance, pay question, certificate, or resignation."})
			return
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.hr_worker_requests (tenant_id, employee_id, kind, details)
			values ($1,$2,$3,$4) returning id`, tu.TenantID, empID, body.Kind, strings.TrimSpace(body.Details)).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Could not save the request.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "hr.worker_request.create", "hr_worker_request", &id, nil, body)
		response.OK(w, map[string]any{"id": id, "status": "pending"}, "Created.")
	}
}

func listClientViolations(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select v.id, v.employee_id, e.full_name, v.description, v.status, v.created_at::text
			from public.hr_client_violation_reports v
			join public.hr_employees e on e.id = v.employee_id
			where v.tenant_id = $1
			order by v.created_at desc limit 200`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load violation reports.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id, empID int64
			var name, description, status, created string
			_ = rows.Scan(&id, &empID, &name, &description, &status, &created)
			out = append(out, map[string]any{
				"id": id, "employee_id": empID, "employee_name": name, "description": description, "status": status, "created_at": created,
			})
		}
		response.OK(w, out, "OK")
	}
}

func createClientViolation(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body struct {
			EmployeeID  int64  `json:"employee_id"`
			Description string `json:"description"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.EmployeeID <= 0 || strings.TrimSpace(body.Description) == "" {
			response.Validation(w, map[string]string{"description": "Employee and description are required."})
			return
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.hr_client_violation_reports (tenant_id, employee_id, description)
			select $1, e.id, $3 from public.hr_employees e
			where e.id = $2 and e.tenant_id = $1 and e.deleted_at is null
			returning id`, tu.TenantID, body.EmployeeID, strings.TrimSpace(body.Description)).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusBadRequest, "Could not save the violation report.", "ERR_VALIDATION")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "hr.client_violation.create", "hr_client_violation_report", &id, nil, body)
		response.OK(w, map[string]any{"id": id, "status": "waiting"}, "Created.")
	}
}

type requestScanner interface {
	Next() bool
	Scan(dest ...any) error
}

func scanRequests(rows requestScanner) []map[string]any {
	out := []map[string]any{}
	for rows.Next() {
		var id, empID int64
		var name, kind, status, details, created string
		_ = rows.Scan(&id, &empID, &name, &kind, &status, &details, &created)
		out = append(out, map[string]any{
			"id": id, "employee_id": empID, "employee_name": name, "kind": kind, "status": status, "details": details, "created_at": created,
		})
	}
	return out
}

func registerClientReviewRoute(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("hr.performance", auth.AccessWrite)).Post("/performance/reviews/client", createClientReview(pool))
}

func createClientReview(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body struct {
			EmployeeID int64              `json:"employee_id"`
			Scores     map[string]float64 `json:"scores"`
			Notes      string             `json:"notes"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON.", "ERR_BAD_REQUEST")
			return
		}
		avg, err := averageFiveScores(body.Scores)
		if err != nil || body.EmployeeID <= 0 {
			response.Validation(w, map[string]string{"scores": "Enter all five scores from 1 to 5."})
			return
		}
		raw, _ := json.Marshal(body.Scores)
		var id int64
		err = pool.QueryRow(r.Context(), `
			insert into public.hr_performance_reviews
			  (tenant_id, employee_id, status, manager_comments, overall_score, scores_json, review_source)
			select $1, e.id, 'manager_done', $3, $4, $5, 'client'
			from public.hr_employees e
			where e.id = $2 and e.tenant_id = $1 and e.deleted_at is null
			returning id`, tu.TenantID, body.EmployeeID, strings.TrimSpace(body.Notes), avg, raw).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusBadRequest, "Could not save the client evaluation.", "ERR_VALIDATION")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "hr.review.client_create", "hr_performance_review", &id, nil, body)
		response.OK(w, map[string]any{"id": id, "overall_score": avg, "review_source": "client"}, "Created.")
	}
}

const extraOverviewSQL = `
select
  (select count(*)::int from public.hr_applications where tenant_id=$1),
  (select count(*)::int from public.hr_workplace_problems where tenant_id=$1 and status not in ('resolved','closed')),
  (select count(*)::int from public.hr_workplace_problems where tenant_id=$1 and status not in ('resolved','closed') and target_date < current_date),
  (select count(*)::int from public.hr_performance_reviews r
     join public.hr_review_cycles c on c.id = r.cycle_id
     where r.tenant_id=$1 and r.review_source='agency' and r.status <> 'acknowledged' and c.period_end < current_date),
  (select count(*)::int from public.hr_workplace_problems where tenant_id=$1 and status='closed' and updated_at >= date_trunc('month', now())),
  (select count(*)::int from public.hr_leave_requests where tenant_id=$1 and status='submitted'),
  (select count(*)::int from public.hr_worker_requests where tenant_id=$1 and kind='loan' and status='pending'),
  (select count(*)::int from public.hr_worker_requests where tenant_id=$1 and kind='pay_question' and status='pending'),
  (select count(*)::int from public.hr_worker_requests where tenant_id=$1 and status='pending')`
