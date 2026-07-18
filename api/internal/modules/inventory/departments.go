package inventory

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

type Department struct {
	ID             int64  `json:"id"`
	DepartmentCode string `json:"department_code"`
	DepartmentName string `json:"department_name"`
	Status         string         `json:"status"`
	CustomValues   map[string]any `json:"custom_values,omitempty"`
}

type departmentBody struct {
	DepartmentName string         `json:"department_name"`
	Status         string         `json:"status"`
	CustomValues   map[string]any `json:"custom_values"`
}

func registerDepartmentRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/departments/next-code", nextCodeHandler(pool, "department"))
	r.Get("/departments", listDepartments(pool))
	r.Post("/departments", createDepartment(pool))
	r.Patch("/departments/{id}", updateDepartment(pool))
	r.Delete("/departments/{id}", deleteDepartment(pool))
}

func listDepartments(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"department_code": "department_code",
		"department_name": "department_name",
		"status":          "status",
		"created_at":      "created_at",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "department_code", allowed)
		offset := httputil.Offset(p)
		where, args := buildWhere(tu.TenantID, p, "department_name", "department_code", "deleted_at is null")
		q := fmt.Sprintf(`select id, department_code, department_name, status, count(*) over() from public.inv_departments where %s order by %s %s limit $%d offset $%d`,
			where, p.Sort, orderSQL(p.Order), len(args)+1, len(args)+2)
		args = append(args, p.PageSize, offset)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []Department
		var total int64
		for rows.Next() {
			var row Department
			if err := rows.Scan(&row.ID, &row.DepartmentCode, &row.DepartmentName, &row.Status, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []Department{}
		}
		attachListCustom(r.Context(), pool, tu.TenantID, entityDepartment, out, func(d Department) int64 { return d.ID }, func(d *Department, v map[string]any) { d.CustomValues = v })
		response.OKList(w, out, p.Page, p.PageSize, total)
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
		if strings.TrimSpace(body.DepartmentName) == "" {
			response.Validation(w, map[string]string{"department_name": "Department name is required."})
			return
		}
		id, row, err := createWithCode(r.Context(), pool, tu, "department", func(ctx context.Context, tx pgxpoolConn, code string) (int64, Department, error) {
			var row Department
			err := tx.QueryRow(ctx, `insert into public.inv_departments (tenant_id, department_code, department_name, status) values ($1,$2,$3,$4)
				returning id, department_code, department_name, status`, tu.TenantID, code, strings.TrimSpace(body.DepartmentName), defaultStatus(body.Status)).
				Scan(&row.ID, &row.DepartmentCode, &row.DepartmentName, &row.Status)
			return row.ID, row, err
		})
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create.", "ERR_INTERNAL")
			return
		}
		if errs := persistCustom(r.Context(), pool, tu.TenantID, entityDepartment, id, body.CustomValues); errs != nil {
			response.Validation(w, errs)
			return
		}
		row.CustomValues = attachCustom(r.Context(), pool, tu.TenantID, entityDepartment, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.department.create", "inv_department", &id, nil, body)
		response.OK(w, row, "Created.")
	}
}

func updateDepartment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		var body departmentBody
		_ = json.NewDecoder(r.Body).Decode(&body)
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		tag, err := tx.Exec(r.Context(), `update public.inv_departments set department_name=$1, status=$2, updated_at=now() where id=$3 and tenant_id=$4 and deleted_at is null`,
			strings.TrimSpace(body.DepartmentName), defaultStatus(body.Status), id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
			return
		}
		if errs := saveCustom(r.Context(), tx, tu.TenantID, entityDepartment, id, body.CustomValues); errs != nil {
			response.Validation(w, errs)
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.department.update", "inv_department", &id, nil, body)
		response.OK(w, map[string]any{"id": id, "custom_values": attachCustom(r.Context(), pool, tu.TenantID, entityDepartment, id)}, "Updated.")
	}
}

func deleteDepartment(pool *pgxpool.Pool) http.HandlerFunc {
	return softDeleteHandler(pool, "inv_departments", "inventory.department.delete", "inv_department")
}
