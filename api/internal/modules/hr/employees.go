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
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/documentlifecycle"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type Employee struct {
	ID             int64   `json:"id"`
	EmployeeNo     string  `json:"employee_no"`
	FullName       string  `json:"full_name"`
	Department     string  `json:"department"`
	DepartmentID   *int64  `json:"department_id,omitempty"`
	JobTitle       string  `json:"job_title"`
	HireDate       string  `json:"hire_date"`
	Status         string  `json:"status"`
	BaseSalary     float64 `json:"base_salary"`
	UserID         *int64  `json:"user_id,omitempty"`
	Email          string  `json:"email,omitempty"`
	Notes          *string `json:"notes,omitempty"`
	TIN            string  `json:"tin,omitempty"`
	SSSNo          string  `json:"sss_no,omitempty"`
	PhilHealthNo   string  `json:"philhealth_no,omitempty"`
	PagibigNo      string  `json:"pagibig_no,omitempty"`
	TaxStatus      string  `json:"tax_status,omitempty"`
	BankName       string  `json:"bank_name,omitempty"`
	BankAccountNo  string  `json:"bank_account_no,omitempty"`
}

type employeeBody struct {
	EmployeeNo     string  `json:"employee_no"`
	FullName       string  `json:"full_name"`
	Department     string  `json:"department"`
	DepartmentID   *int64  `json:"department_id"`
	JobTitle       string  `json:"job_title"`
	HireDate       string  `json:"hire_date"`
	Status         string  `json:"status"`
	BaseSalary     float64 `json:"base_salary"`
	UserID         *int64  `json:"user_id"`
	Email          *string `json:"email"`
	Notes          *string `json:"notes"`
	TIN            *string `json:"tin"`
	SSSNo          *string `json:"sss_no"`
	PhilHealthNo   *string `json:"philhealth_no"`
	PagibigNo      *string `json:"pagibig_no"`
	TaxStatus      *string `json:"tax_status"`
	BankName       *string `json:"bank_name"`
	BankAccountNo  *string `json:"bank_account_no"`
}

type employeePatch struct {
	FullName       *string  `json:"full_name"`
	Department     *string  `json:"department"`
	DepartmentID   *int64   `json:"department_id"`
	JobTitle       *string  `json:"job_title"`
	HireDate       *string  `json:"hire_date"`
	Status         *string  `json:"status"`
	BaseSalary     *float64 `json:"base_salary"`
	UserID         *int64   `json:"user_id"`
	Email          *string  `json:"email"`
	Notes          *string  `json:"notes"`
	TIN            *string  `json:"tin"`
	SSSNo          *string  `json:"sss_no"`
	PhilHealthNo   *string  `json:"philhealth_no"`
	PagibigNo      *string  `json:"pagibig_no"`
	TaxStatus      *string  `json:"tax_status"`
	BankName       *string  `json:"bank_name"`
	BankAccountNo  *string  `json:"bank_account_no"`
}

func registerEmployeeRoutes(r chi.Router, pool *pgxpool.Pool) {
	registerEmployeeCSVRoutes(r, pool)
	registerDepartmentRoutes(r, pool)
	r.Get("/employees", listEmployees(pool))
	r.With(auth.RequirePermission("hr.employees_new", auth.AccessWrite)).Post("/employees", createEmployee(pool))
	r.With(auth.RequirePermission("hr.employees", auth.AccessWrite)).Post("/employees/actions/bulk-delete", bulkDeleteEmployees(pool))
	r.With(auth.RequirePermission("hr.employees", auth.AccessWrite)).Post("/employees/actions/bulk-restore", bulkRestoreEmployees(pool))
	r.Get("/employees/{id}", getEmployee(pool))
	r.With(auth.RequirePermission("hr.employees", auth.AccessWrite)).Patch("/employees/{id}", patchEmployee(pool))
	r.With(auth.RequirePermission("hr.employees", auth.AccessWrite)).Post("/employees/{id}/actions/delete", deleteEmployee(pool))
	r.With(auth.RequirePermission("hr.employees", auth.AccessWrite)).Post("/employees/{id}/actions/restore", restoreEmployee(pool))
}

func listEmployees(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"employee_no": "e.employee_no", "full_name": "e.full_name", "status": "e.status", "hire_date": "e.hire_date",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "full_name", allowed)
		offset := httputil.Offset(p)
		lifecycle, err := documentlifecycle.Parse(r.URL.Query().Get("lifecycle"))
		if err != nil {
			response.Validation(w, map[string]string{"lifecycle": err.Error()})
			return
		}
		pred := "e.deleted_at is null"
		switch lifecycle {
		case documentlifecycle.Deleted:
			pred = "e.deleted_at is not null"
		case documentlifecycle.All:
			pred = "true"
		}
		where := "e.tenant_id = $1 and " + pred
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
			select e.id, e.employee_no, e.full_name, e.department, e.department_id, e.job_title, e.hire_date::text,
			  e.status, e.base_salary::float8, e.user_id, coalesce(e.email,''), e.notes,
			  coalesce(e.tin,''), coalesce(e.sss_no,''), coalesce(e.philhealth_no,''), coalesce(e.pagibig_no,''),
			  coalesce(e.tax_status,'S'), coalesce(e.bank_name,''), coalesce(e.bank_account_no,''), count(*) over()
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
			if err := rows.Scan(&row.ID, &row.EmployeeNo, &row.FullName, &row.Department, &row.DepartmentID, &row.JobTitle, &row.HireDate,
				&row.Status, &row.BaseSalary, &row.UserID, &row.Email, &notes,
				&row.TIN, &row.SSSNo, &row.PhilHealthNo, &row.PagibigNo, &row.TaxStatus,
				&row.BankName, &row.BankAccountNo, &total); err != nil {
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
		deptName, err := resolveDepartmentName(r.Context(), pool, tu.TenantID, body.DepartmentID, body.Department)
		if err != nil {
			response.Validation(w, map[string]string{"department_id": "Invalid department."})
			return
		}
		var id int64
		err = pool.QueryRow(r.Context(), `
			insert into public.hr_employees (
			  tenant_id, employee_no, full_name, department, department_id, job_title, hire_date, status, base_salary, user_id, email, notes,
			  tin, sss_no, philhealth_no, pagibig_no, tax_status, bank_name, bank_account_no
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) returning id`,
			tu.TenantID, strings.TrimSpace(body.EmployeeNo), strings.TrimSpace(body.FullName),
			deptName, body.DepartmentID, strings.TrimSpace(body.JobTitle), hireDate,
			normalizeEmployeeStatus(body.Status), body.BaseSalary, body.UserID, body.Email, body.Notes,
			strPtrVal(body.TIN), strPtrVal(body.SSSNo), strPtrVal(body.PhilHealthNo), strPtrVal(body.PagibigNo),
			normalizeTaxStatus(strPtrVal(body.TaxStatus)), strPtrVal(body.BankName), strPtrVal(body.BankAccountNo),
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create employee.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "hr.employee.create", "hr_employee", &id, nil, body)
		status := normalizeEmployeeStatus(body.Status)
		if status == "active" {
			_, _ = spawnHireOnboarding(r.Context(), pool, tu.TenantID, id, nil)
		}
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
		if body.Department != nil || body.DepartmentID != nil {
			deptName := ""
			if body.Department != nil {
				deptName = *body.Department
			}
			resolved, err := resolveDepartmentName(r.Context(), pool, tu.TenantID, body.DepartmentID, deptName)
			if err != nil {
				response.Validation(w, map[string]string{"department_id": "Invalid department."})
				return
			}
			sets = append(sets, fmt.Sprintf("department = $%d", n))
			args = append(args, resolved)
			n++
			sets = append(sets, fmt.Sprintf("department_id = $%d", n))
			args = append(args, body.DepartmentID)
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
			if *body.UserID <= 0 {
				sets = append(sets, "user_id = null")
			} else {
				sets = append(sets, fmt.Sprintf("user_id = $%d", n))
				args = append(args, *body.UserID)
				n++
			}
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
		if body.TIN != nil {
			sets = append(sets, fmt.Sprintf("tin = $%d", n))
			args = append(args, strings.TrimSpace(*body.TIN))
			n++
		}
		if body.SSSNo != nil {
			sets = append(sets, fmt.Sprintf("sss_no = $%d", n))
			args = append(args, strings.TrimSpace(*body.SSSNo))
			n++
		}
		if body.PhilHealthNo != nil {
			sets = append(sets, fmt.Sprintf("philhealth_no = $%d", n))
			args = append(args, strings.TrimSpace(*body.PhilHealthNo))
			n++
		}
		if body.PagibigNo != nil {
			sets = append(sets, fmt.Sprintf("pagibig_no = $%d", n))
			args = append(args, strings.TrimSpace(*body.PagibigNo))
			n++
		}
		if body.TaxStatus != nil {
			sets = append(sets, fmt.Sprintf("tax_status = $%d", n))
			args = append(args, normalizeTaxStatus(*body.TaxStatus))
			n++
		}
		if body.BankName != nil {
			sets = append(sets, fmt.Sprintf("bank_name = $%d", n))
			args = append(args, strings.TrimSpace(*body.BankName))
			n++
		}
		if body.BankAccountNo != nil {
			sets = append(sets, fmt.Sprintf("bank_account_no = $%d", n))
			args = append(args, strings.TrimSpace(*body.BankAccountNo))
			n++
		}
		q := fmt.Sprintf(`update public.hr_employees set %s where id = $1 and tenant_id = $2 and deleted_at is null`, strings.Join(sets, ", "))
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

type employeeActionBody struct {
	Reason string  `json:"reason"`
	IDs    []int64 `json:"ids"`
}

type employeeBulkItem struct {
	ID     int64  `json:"id"`
	OK     bool   `json:"ok"`
	Reason string `json:"reason,omitempty"`
}

type employeeBulkOutcome struct {
	Results  []employeeBulkItem `json:"results"`
	Deleted  int                `json:"deleted,omitempty"`
	Restored int                `json:"restored,omitempty"`
	Skipped  int                `json:"skipped"`
}

func deleteEmployee(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := parseID(chi.URLParam(r, "id"))
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		reason, ok := readEmployeeReason(w, r)
		if !ok {
			return
		}
		if msg := applyEmployeeDelete(r.Context(), pool, tu, id, reason); msg != "" {
			if msg == "not_found" {
				response.Err(w, http.StatusNotFound, "Employee not found.", "ERR_NOT_FOUND")
				return
			}
			if msg == "already" {
				response.Err(w, http.StatusConflict, "Employee is already deleted.", "ERR_LIFECYCLE_STATE")
				return
			}
			response.Err(w, http.StatusConflict, msg, "ERR_DEPENDENCY_BLOCKED")
			return
		}
		response.OK(w, map[string]any{"id": id, "lifecycle": documentlifecycle.Deleted}, "Deleted.")
	}
}

func restoreEmployee(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := parseID(chi.URLParam(r, "id"))
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		reason, ok := readEmployeeReason(w, r)
		if !ok {
			return
		}
		if msg := applyEmployeeRestore(r.Context(), pool, tu, id, reason); msg != "" {
			if msg == "not_found" {
				response.Err(w, http.StatusNotFound, "Employee not found.", "ERR_NOT_FOUND")
				return
			}
			response.Err(w, http.StatusConflict, msg, "ERR_LIFECYCLE_STATE")
			return
		}
		response.OK(w, map[string]any{"id": id, "lifecycle": documentlifecycle.Active}, "Restored.")
	}
}

func bulkDeleteEmployees(pool *pgxpool.Pool) http.HandlerFunc {
	return employeeBulkHandler(pool, "delete")
}

func bulkRestoreEmployees(pool *pgxpool.Pool) http.HandlerFunc {
	return employeeBulkHandler(pool, "restore")
}

func employeeBulkHandler(pool *pgxpool.Pool, mode string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body employeeActionBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		reason := strings.TrimSpace(body.Reason)
		if reason == "" {
			response.Validation(w, map[string]string{"reason": "Reason is required."})
			return
		}
		if len(reason) > 2000 {
			response.Validation(w, map[string]string{"reason": "Reason must not exceed 2000 characters."})
			return
		}
		if len(body.IDs) == 0 {
			response.Validation(w, map[string]string{"ids": "At least one id is required."})
			return
		}
		if len(body.IDs) > 500 {
			response.Validation(w, map[string]string{"ids": "At most 500 ids per request."})
			return
		}
		results := make([]employeeBulkItem, 0, len(body.IDs))
		for _, id := range body.IDs {
			if id <= 0 {
				results = append(results, employeeBulkItem{ID: id, OK: false, Reason: "Invalid id."})
				continue
			}
			var msg string
			if mode == "delete" {
				msg = applyEmployeeDelete(r.Context(), pool, tu, id, reason)
			} else {
				msg = applyEmployeeRestore(r.Context(), pool, tu, id, reason)
			}
			if msg == "" {
				results = append(results, employeeBulkItem{ID: id, OK: true})
				continue
			}
			human := msg
			switch msg {
			case "not_found":
				human = "Employee not found."
			case "already":
				if mode == "delete" {
					human = "Employee is already deleted."
				} else {
					human = "Employee is already active."
				}
			}
			results = append(results, employeeBulkItem{ID: id, OK: false, Reason: human})
		}
		out := employeeBulkOutcome{Results: results}
		for _, item := range results {
			if item.OK {
				if mode == "delete" {
					out.Deleted++
				} else {
					out.Restored++
				}
			} else {
				out.Skipped++
			}
		}
		response.OK(w, out, "OK")
	}
}

func readEmployeeReason(w http.ResponseWriter, r *http.Request) (string, bool) {
	var body employeeActionBody
	_ = json.NewDecoder(r.Body).Decode(&body)
	reason := strings.TrimSpace(body.Reason)
	if reason == "" {
		response.Validation(w, map[string]string{"reason": "Reason is required."})
		return "", false
	}
	if len(reason) > 2000 {
		response.Validation(w, map[string]string{"reason": "Reason must not exceed 2000 characters."})
		return "", false
	}
	return reason, true
}

func employeeHasPostedPayslips(ctx context.Context, pool *pgxpool.Pool, tenantID, employeeID int64) (bool, error) {
	var n int64
	err := pool.QueryRow(ctx, `
		select count(*) from public.hr_payslips
		where tenant_id = $1 and employee_id = $2 and status = 'posted'`, tenantID, employeeID).Scan(&n)
	return n > 0, err
}

func applyEmployeeDelete(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, id int64, reason string) string {
	var deletedAt any
	err := pool.QueryRow(ctx, `
		select deleted_at from public.hr_employees where id = $1 and tenant_id = $2`, id, tu.TenantID).Scan(&deletedAt)
	if err != nil {
		return "not_found"
	}
	if deletedAt != nil {
		return "already"
	}
	hasPosted, err := employeeHasPostedPayslips(ctx, pool, tu.TenantID, id)
	if err != nil {
		return "Failed to check payroll slips."
	}
	if hasPosted {
		return "Cannot delete employee with posted payroll slips."
	}
	tag, err := pool.Exec(ctx, `
		update public.hr_employees set
		  deleted_at = now(), deleted_by_user_id = $3, delete_reason = $4,
		  updated_at = now(), lifecycle_version = lifecycle_version + 1
		where id = $1 and tenant_id = $2 and deleted_at is null`,
		id, tu.TenantID, tu.AppUserID, reason)
	if err != nil || tag.RowsAffected() != 1 {
		return "Lifecycle state changed concurrently."
	}
	_ = audit.Log(ctx, pool, tu.TenantID, tu.AppUserID, "hr.employee.delete", "hr_employee", &id, nil, map[string]any{"reason": reason})
	return ""
}

func applyEmployeeRestore(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, id int64, reason string) string {
	var deletedAt any
	err := pool.QueryRow(ctx, `
		select deleted_at from public.hr_employees where id = $1 and tenant_id = $2`, id, tu.TenantID).Scan(&deletedAt)
	if err != nil {
		return "not_found"
	}
	if deletedAt == nil {
		return "already"
	}
	tag, err := pool.Exec(ctx, `
		update public.hr_employees set
		  deleted_at = null, restored_at = now(), restored_by_user_id = $3, restore_reason = $4,
		  updated_at = now(), lifecycle_version = lifecycle_version + 1
		where id = $1 and tenant_id = $2 and deleted_at is not null`,
		id, tu.TenantID, tu.AppUserID, reason)
	if err != nil || tag.RowsAffected() != 1 {
		return "Lifecycle state changed concurrently."
	}
	_ = audit.Log(ctx, pool, tu.TenantID, tu.AppUserID, "hr.employee.restore", "hr_employee", &id, nil, map[string]any{"reason": reason})
	return ""
}

func loadEmployee(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (Employee, error) {
	var row Employee
	var notes *string
	err := pool.QueryRow(ctx, `
		select id, employee_no, full_name, department, department_id, job_title, hire_date::text,
		  status, base_salary::float8, user_id, coalesce(email,''), notes,
		  coalesce(tin,''), coalesce(sss_no,''), coalesce(philhealth_no,''), coalesce(pagibig_no,''),
		  coalesce(tax_status,'S'), coalesce(bank_name,''), coalesce(bank_account_no,'')
		from public.hr_employees where id = $1 and tenant_id = $2 and deleted_at is null`, id, tenantID).Scan(
		&row.ID, &row.EmployeeNo, &row.FullName, &row.Department, &row.DepartmentID, &row.JobTitle, &row.HireDate,
		&row.Status, &row.BaseSalary, &row.UserID, &row.Email, &notes,
		&row.TIN, &row.SSSNo, &row.PhilHealthNo, &row.PagibigNo, &row.TaxStatus,
		&row.BankName, &row.BankAccountNo)
	row.Notes = notes
	return row, err
}

func resolveDepartmentName(ctx context.Context, pool *pgxpool.Pool, tenantID int64, departmentID *int64, fallback string) (string, error) {
	if departmentID != nil && *departmentID > 0 {
		var name string
		err := pool.QueryRow(ctx, `
			select department_name from public.hr_departments
			where id = $1 and tenant_id = $2`, *departmentID, tenantID).Scan(&name)
		if err != nil {
			return "", err
		}
		return name, nil
	}
	return strings.TrimSpace(fallback), nil
}

func strPtrVal(p *string) string {
	if p == nil {
		return ""
	}
	return strings.TrimSpace(*p)
}

func normalizeTaxStatus(s string) string {
	s = strings.ToUpper(strings.TrimSpace(s))
	switch s {
	case "S", "ME", "S1", "S2", "S3", "S4", "ME1", "ME2", "ME3", "ME4", "Z":
		return s
	default:
		return "S"
	}
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
