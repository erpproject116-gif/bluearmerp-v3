package hr

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func registerAssignmentRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/assignments", listSiteAssignments(pool))
	r.Get("/workforce", listWorkforce(pool))
	r.With(auth.RequirePermission("hr.employees", auth.AccessWrite)).Post("/assignments", placeAssignmentHandler(pool))
	r.With(auth.RequirePermission("hr.employees", auth.AccessWrite)).Patch("/assignments/{id}", endAssignmentHandler(pool))
}

func listSiteAssignments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select a.id, a.employee_id, e.full_name, e.status, a.site_id, s.site_name, c.name,
			       a.start_date::text, coalesce(a.end_date::text, '')
			from public.hr_assignments a
			join public.hr_employees e on e.id = a.employee_id and e.tenant_id = a.tenant_id
			join public.hr_client_sites s on s.id = a.site_id and s.tenant_id = a.tenant_id
			join public.hr_clients c on c.id = s.client_id and c.tenant_id = a.tenant_id
			where a.tenant_id = $1
			order by a.end_date nulls first, c.name, s.site_name, e.full_name`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load the roster.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id, employeeID, siteID int64
			var name, status, siteName, clientName, start, end string
			if err := rows.Scan(&id, &employeeID, &name, &status, &siteID, &siteName, &clientName, &start, &end); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load the roster.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{
				"id": id, "employee_id": employeeID, "employee_name": name, "employee_status": status,
				"site_id": siteID, "site_name": siteName, "client_name": clientName,
				"start_date": start, "end_date": end,
			})
		}
		response.OK(w, out, "OK")
	}
}

func listWorkforce(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select s.id, c.name, s.site_name,
			  coalesce((
			    select json_agg(json_build_object(
			      'assignment_id', a.id,
			      'employee_id', e.id,
			      'employee_name', e.full_name,
			      'start_date', a.start_date::text
			    ) order by e.full_name)
			    from public.hr_assignments a
			    join public.hr_employees e on e.id = a.employee_id and e.tenant_id = a.tenant_id
			    where a.site_id = s.id and a.tenant_id = s.tenant_id and a.end_date is null
			  ), '[]'::json)
			from public.hr_client_sites s
			join public.hr_clients c on c.id = s.client_id and c.tenant_id = s.tenant_id
			where s.tenant_id = $1
			order by c.name, s.site_name`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load the workforce board.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		sites := []map[string]any{}
		for rows.Next() {
			var id int64
			var clientName, siteName string
			var people []byte
			if err := rows.Scan(&id, &clientName, &siteName, &people); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load the workforce board.", "ERR_INTERNAL")
				return
			}
			var decoded []map[string]any
			if err := json.Unmarshal(people, &decoded); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load the workforce board.", "ERR_INTERNAL")
				return
			}
			if decoded == nil {
				decoded = []map[string]any{}
			}
			sites = append(sites, map[string]any{
				"id": id, "client_name": clientName, "site_name": siteName, "people": decoded,
			})
		}
		rows.Close()
		unassigned, err := pool.Query(r.Context(), `
			select e.id, e.full_name
			from public.hr_employees e
			where e.tenant_id = $1 and e.status = 'active'
			  and not exists (
			    select 1 from public.hr_assignments a
			    where a.tenant_id = e.tenant_id and a.employee_id = e.id and a.end_date is null
			  )
			order by e.full_name`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load the workforce board.", "ERR_INTERNAL")
			return
		}
		defer unassigned.Close()
		bench := []map[string]any{}
		for unassigned.Next() {
			var id int64
			var name string
			if err := unassigned.Scan(&id, &name); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load the workforce board.", "ERR_INTERNAL")
				return
			}
			bench = append(bench, map[string]any{"employee_id": id, "employee_name": name})
		}
		if sites == nil {
			sites = []map[string]any{}
		}
		if bench == nil {
			bench = []map[string]any{}
		}
		response.OK(w, map[string]any{"sites": sites, "unassigned": bench}, "OK")
	}
}

func endAssignmentHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		assignmentID, err := parseID(chi.URLParam(r, "id"))
		if err != nil {
			response.Err(w, http.StatusBadRequest, "Assignment not found.", "ERR_BAD_REQUEST")
			return
		}
		var body struct {
			EndDate string `json:"end_date"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil && !errors.Is(err, http.ErrBodyNotAllowed) {
			response.Err(w, http.StatusBadRequest, "Invalid JSON.", "ERR_BAD_REQUEST")
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to end the assignment.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		status, err := endAssignment(r.Context(), tx, tu.TenantID, assignmentID, body.EndDate)
		if err != nil {
			writeAssignmentErr(w, err)
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to end the assignment.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"employee_status": status}, "Updated.")
	}
}

func placeAssignmentHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		var body struct {
			EmployeeID int64  `json:"employee_id"`
			SiteID     int64  `json:"site_id"`
			StartDate  string `json:"start_date"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON.", "ERR_BAD_REQUEST")
			return
		}
		if body.EmployeeID == 0 || body.SiteID == 0 {
			response.Validation(w, map[string]string{"site_id": "Choose an employee and a site."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the assignment.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		status, err := placeAssignment(r.Context(), tx, tu.TenantID, body.EmployeeID, body.SiteID, body.StartDate)
		if err != nil {
			writeAssignmentErr(w, err)
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the assignment.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"employee_status": status}, "Created.")
	}
}

var (
	errAssignmentMissing = errors.New("assignment missing")
	errAssignmentDate    = errors.New("assignment date")
	errAssignmentPerson  = errors.New("assignment person")
	errAssignmentSite    = errors.New("assignment site")
)

func endAssignment(ctx context.Context, tx pgx.Tx, tenantID, assignmentID int64, endDate string) (string, error) {
	var employeeID int64
	var start, currentEnd string
	err := tx.QueryRow(ctx, `
		select employee_id, start_date::text, coalesce(end_date::text, '')
		from public.hr_assignments
		where id = $1 and tenant_id = $2`, assignmentID, tenantID).Scan(&employeeID, &start, &currentEnd)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", errAssignmentMissing
	}
	if err != nil {
		return "", err
	}
	if currentEnd != "" {
		return employeeStatus(ctx, tx, tenantID, employeeID)
	}
	endDate = strings.TrimSpace(endDate)
	if endDate == "" {
		if err := tx.QueryRow(ctx, `select current_date::text`).Scan(&endDate); err != nil {
			return "", err
		}
	}
	if endDate < start {
		return "", errAssignmentDate
	}
	tag, err := tx.Exec(ctx, `
		update public.hr_assignments
		set end_date = $3::date
		where id = $1 and tenant_id = $2 and end_date is null`, assignmentID, tenantID, endDate)
	if err != nil {
		return "", err
	}
	if tag.RowsAffected() != 1 {
		return "", errAssignmentMissing
	}
	return employeeStatus(ctx, tx, tenantID, employeeID)
}

func placeAssignment(ctx context.Context, tx pgx.Tx, tenantID, employeeID, siteID int64, startDate string) (string, error) {
	var person int64
	err := tx.QueryRow(ctx, `select id from public.hr_employees where id = $1 and tenant_id = $2`, employeeID, tenantID).Scan(&person)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", errAssignmentPerson
	}
	if err != nil {
		return "", err
	}
	var site int64
	err = tx.QueryRow(ctx, `select id from public.hr_client_sites where id = $1 and tenant_id = $2`, siteID, tenantID).Scan(&site)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", errAssignmentSite
	}
	if err != nil {
		return "", err
	}
	startDate = strings.TrimSpace(startDate)
	if startDate == "" {
		if err := tx.QueryRow(ctx, `select current_date::text`).Scan(&startDate); err != nil {
			return "", err
		}
	}
	var openID, openSite int64
	var openStart string
	err = tx.QueryRow(ctx, `
		select id, site_id, start_date::text
		from public.hr_assignments
		where tenant_id = $1 and employee_id = $2 and end_date is null`, tenantID, employeeID).Scan(&openID, &openSite, &openStart)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	if err == nil {
		if openSite == siteID {
			return employeeStatus(ctx, tx, tenantID, employeeID)
		}
		endOn := startDate
		if endOn < openStart {
			endOn = openStart
		}
		if _, err := endAssignment(ctx, tx, tenantID, openID, endOn); err != nil {
			return "", err
		}
	}
	_, err = tx.Exec(ctx, `
		insert into public.hr_assignments (tenant_id, employee_id, site_id, start_date)
		values ($1, $2, $3, $4::date)`, tenantID, employeeID, siteID, startDate)
	if err != nil {
		return "", err
	}
	return employeeStatus(ctx, tx, tenantID, employeeID)
}

func employeeStatus(ctx context.Context, tx pgx.Tx, tenantID, employeeID int64) (string, error) {
	var status string
	err := tx.QueryRow(ctx, `select status from public.hr_employees where id = $1 and tenant_id = $2`, employeeID, tenantID).Scan(&status)
	return status, err
}

func writeAssignmentErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errAssignmentMissing):
		response.Err(w, http.StatusNotFound, "Assignment not found.", "ERR_NOT_FOUND")
	case errors.Is(err, errAssignmentDate):
		response.Validation(w, map[string]string{"end_date": "End date is before the start date."})
	case errors.Is(err, errAssignmentPerson):
		response.Validation(w, map[string]string{"employee_id": "Choose an employee."})
	case errors.Is(err, errAssignmentSite):
		response.Validation(w, map[string]string{"site_id": "Choose a site."})
	default:
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			response.Err(w, http.StatusConflict, "This employee already has an open site.", "ERR_CONFLICT")
			return
		}
		response.Err(w, http.StatusInternalServerError, "Failed to save the assignment.", "ERR_INTERNAL")
	}
}
