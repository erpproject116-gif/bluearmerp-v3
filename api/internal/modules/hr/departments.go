package hr

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type Department struct {
	ID             int64  `json:"id"`
	DepartmentCode string `json:"department_code"`
	DepartmentName string `json:"department_name"`
	Status         string `json:"status"`
}

type departmentBody struct {
	DepartmentCode string `json:"department_code"`
	DepartmentName string `json:"department_name"`
	Status         string `json:"status"`
}

func registerDepartmentRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/departments", listDepartments(pool))
	r.With(auth.RequirePermission("hr.employees", auth.AccessWrite)).Post("/departments", createDepartment(pool))
}

func listDepartments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, department_code, department_name, status
			from public.hr_departments
			where tenant_id = $1
			order by department_name`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list departments.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []Department{}
		for rows.Next() {
			var row Department
			if err := rows.Scan(&row.ID, &row.DepartmentCode, &row.DepartmentName, &row.Status); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read departments.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		response.OK(w, out, "OK")
	}
}

func createDepartment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body departmentBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		name := strings.TrimSpace(body.DepartmentName)
		code := strings.TrimSpace(body.DepartmentCode)
		if name == "" {
			response.Validation(w, map[string]string{"department_name": "Required."})
			return
		}
		if code == "" {
			code = slugCode(name)
		}
		status := strings.TrimSpace(body.Status)
		if status == "" {
			status = "active"
		}
		if status != "active" && status != "inactive" {
			response.Validation(w, map[string]string{"status": "Must be active or inactive."})
			return
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.hr_departments (tenant_id, department_code, department_name, status)
			values ($1,$2,$3,$4)
			on conflict (tenant_id, department_code) do update
			  set department_name = excluded.department_name,
			      status = excluded.status,
			      updated_at = now()
			returning id`,
			tu.TenantID, code, name, status,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save department.", "ERR_INTERNAL")
			return
		}
		response.OK(w, Department{ID: id, DepartmentCode: code, DepartmentName: name, Status: status}, "Saved.")
	}
}

func slugCode(name string) string {
	var b strings.Builder
	prevDash := false
	for _, r := range strings.ToLower(strings.TrimSpace(name)) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			prevDash = false
			continue
		}
		if !prevDash {
			b.WriteByte('-')
			prevDash = true
		}
	}
	s := strings.Trim(b.String(), "-")
	if s == "" {
		return "dept"
	}
	if len(s) > 40 {
		return s[:40]
	}
	return s
}
