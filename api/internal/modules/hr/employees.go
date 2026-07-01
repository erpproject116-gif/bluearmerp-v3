package hr

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type Employee struct {
	ID         int64   `json:"id"`
	EmployeeNo string  `json:"employee_no"`
	FullName   string  `json:"full_name"`
	Department string  `json:"department"`
	JobTitle   string  `json:"job_title"`
	HireDate   string  `json:"hire_date"`
	Status     string  `json:"status"`
	BaseSalary float64 `json:"base_salary"`
	UserID     *int64  `json:"user_id,omitempty"`
	Email      string  `json:"email,omitempty"`
	Notes      *string `json:"notes,omitempty"`
}

type employeeBody struct {
	EmployeeNo string  `json:"employee_no"`
	FullName   string  `json:"full_name"`
	Department string  `json:"department"`
	JobTitle   string  `json:"job_title"`
	HireDate   string  `json:"hire_date"`
	Status     string  `json:"status"`
	BaseSalary float64 `json:"base_salary"`
	UserID     *int64  `json:"user_id"`
	Email      *string `json:"email"`
	Notes      *string `json:"notes"`
}

type employeePatch struct {
	FullName   *string  `json:"full_name"`
	Department *string  `json:"department"`
	JobTitle   *string  `json:"job_title"`
	HireDate   *string  `json:"hire_date"`
	Status     *string  `json:"status"`
	BaseSalary *float64 `json:"base_salary"`
	UserID     *int64   `json:"user_id"`
	Email      *string  `json:"email"`
	Notes      *string  `json:"notes"`
}

func registerEmployeeRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/employees", listEmployees(pool))
	r.With(auth.RequirePermission("hr.employees_new", auth.AccessWrite)).Post("/employees", createEmployee(pool))
	r.Get("/employees/{id}", getEmployee(pool))
	r.With(auth.RequirePermission("hr.employees", auth.AccessWrite)).Patch("/employees/{id}", patchEmployee(pool))
}

func listEmployees(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"employee_no": "e.employee_no", "full_name": "e.full_name", "status": "e.status", "hire_date": "e.hire_date",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "full_name", allowed)
		offset := httputil.Offset(p)
		where := "e.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
			where += fmt.Sprintf(" and (e.employee_no ilike $%d or e.full_name ilike $%d or e.department ilike $%d)", n, n, n)
			args = append(args, "%"+q+"%")
			n++
		}
		if st := strings.TrimSpace(r.URL.Query().Get("status")); st != "" {
			where += fmt.Sprintf(" and e.status = $%d", n)
			args = append(args, st)
			n++
		}
		sortCol := allowed[p.Sort]
		if sortCol == "" {
			sortCol = "e.full_name"
		}
		q := fmt.Sprintf(`
			select e.id, e.employee_no, e.full_name, e.department, e.job_title, e.hire_date::text,
			  e.status, e.base_salary::float8, e.user_id, coalesce(e.email,''), e.notes, count(*) over()
			from public.hr_employees e where %s order by %s %s limit $%d offset $%d`,
			where, sortCol, orderSQL(p.Order), n, n+1)
		args = append(args, p.PageSize, offset)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list employees.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []Employee
		var total int64
		for rows.Next() {
			var row Employee
			var notes *string
			if err := rows.Scan(&row.ID, &row.EmployeeNo, &row.FullName, &row.Department, &row.JobTitle, &row.HireDate,
				&row.Status, &row.BaseSalary, &row.UserID, &row.Email, &notes, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read employee.", "ERR_INTERNAL")
				return
			}
			row.Notes = notes
			out = append(out, row)
		}
		if out == nil {
			out = []Employee{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getEmployee(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := parseID(chi.URLParam(r, "id"))
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		row, err := loadEmployee(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Employee not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, row, "OK")
	}
}

func createEmployee(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body employeeBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateEmployeeBody(body); errs != nil {
			response.Validation(w, errs)
			return
		}
		hireDate, err := parseDate(body.HireDate)
		if err != nil {
			response.Validation(w, map[string]string{"hire_date": "Invalid date."})
			return
		}
		var id int64
		err = pool.QueryRow(r.Context(), `
			insert into public.hr_employees (
			  tenant_id, employee_no, full_name, department, job_title, hire_date, status, base_salary, user_id, email, notes
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
			tu.TenantID, strings.TrimSpace(body.EmployeeNo), strings.TrimSpace(body.FullName),
			strings.TrimSpace(body.Department), strings.TrimSpace(body.JobTitle), hireDate,
			normalizeEmployeeStatus(body.Status), body.BaseSalary, body.UserID, body.Email, body.Notes,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create employee.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "hr.employee.create", "hr_employee", &id, nil, body)
		row, _ := loadEmployee(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Created.")
	}
}

func patchEmployee(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := parseID(chi.URLParam(r, "id"))
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body employeePatch
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		before, _ := loadEmployee(r.Context(), pool, tu.TenantID, id)
		sets := []string{"updated_at = now()"}
		args := []any{id, tu.TenantID}
		n := 3
		if body.FullName != nil {
			sets = append(sets, fmt.Sprintf("full_name = $%d", n))
			args = append(args, strings.TrimSpace(*body.FullName))
			n++
		}
		if body.Department != nil {
			sets = append(sets, fmt.Sprintf("department = $%d", n))
			args = append(args, strings.TrimSpace(*body.Department))
			n++
		}
		if body.JobTitle != nil {
			sets = append(sets, fmt.Sprintf("job_title = $%d", n))
			args = append(args, strings.TrimSpace(*body.JobTitle))
			n++
		}
		if body.HireDate != nil {
			d, err := parseDate(*body.HireDate)
			if err != nil {
				response.Validation(w, map[string]string{"hire_date": "Invalid date."})
				return
			}
			sets = append(sets, fmt.Sprintf("hire_date = $%d", n))
			args = append(args, d)
			n++
		}
		if body.Status != nil {
			sets = append(sets, fmt.Sprintf("status = $%d", n))
			args = append(args, normalizeEmployeeStatus(*body.Status))
			n++
		}
		if body.BaseSalary != nil {
			sets = append(sets, fmt.Sprintf("base_salary = $%d", n))
			args = append(args, *body.BaseSalary)
			n++
		}
		if body.UserID != nil {
			sets = append(sets, fmt.Sprintf("user_id = $%d", n))
			args = append(args, body.UserID)
			n++
		}
		if body.Email != nil {
			sets = append(sets, fmt.Sprintf("email = $%d", n))
			args = append(args, body.Email)
			n++
		}
		if body.Notes != nil {
			sets = append(sets, fmt.Sprintf("notes = $%d", n))
			args = append(args, body.Notes)
			n++
		}
		q := fmt.Sprintf(`update public.hr_employees set %s where id = $1 and tenant_id = $2`, strings.Join(sets, ", "))
		tag, err := pool.Exec(r.Context(), q, args...)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Employee not found.", "ERR_NOT_FOUND")
			return
		}
		row, _ := loadEmployee(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "hr.employee.update", "hr_employee", &id, before, row)
		response.OK(w, row, "Updated.")
	}
}

func loadEmployee(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (Employee, error) {
	var row Employee
	var notes *string
	err := pool.QueryRow(ctx, `
		select id, employee_no, full_name, department, job_title, hire_date::text,
		  status, base_salary::float8, user_id, coalesce(email,''), notes
		from public.hr_employees where id = $1 and tenant_id = $2`, id, tenantID).Scan(
		&row.ID, &row.EmployeeNo, &row.FullName, &row.Department, &row.JobTitle, &row.HireDate,
		&row.Status, &row.BaseSalary, &row.UserID, &row.Email, &notes)
	row.Notes = notes
	return row, err
}

func validateEmployeeBody(body employeeBody) map[string]string {
	errs := map[string]string{}
	if strings.TrimSpace(body.EmployeeNo) == "" {
		errs["employee_no"] = "Employee number is required."
	}
	if strings.TrimSpace(body.FullName) == "" {
		errs["full_name"] = "Full name is required."
	}
	if body.BaseSalary < 0 {
		errs["base_salary"] = "Base salary cannot be negative."
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func normalizeEmployeeStatus(s string) string {
	switch strings.TrimSpace(strings.ToLower(s)) {
	case "inactive", "terminated":
		return strings.TrimSpace(strings.ToLower(s))
	default:
		return "active"
	}
}

func parseID(s string) (int64, error) {
	id, err := strconv.ParseInt(strings.TrimSpace(s), 10, 64)
	if err != nil || id <= 0 {
		return 0, fmt.Errorf("invalid id")
	}
	return id, nil
}
