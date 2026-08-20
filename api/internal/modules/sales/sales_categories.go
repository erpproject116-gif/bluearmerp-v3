package sales

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type SalesCategory struct {
	ID        int64  `json:"id"`
	Code      string `json:"code"`
	Name      string `json:"name"`
	Active    bool   `json:"active"`
	SortOrder int    `json:"sort_order"`
}

type salesCategoryBody struct {
	Code      string `json:"code"`
	Name      string `json:"name"`
	Active    *bool  `json:"active"`
	SortOrder *int   `json:"sort_order"`
}

func registerSalesCategoryRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("sales.sales_categories", auth.AccessRead)).Get("/categories", listSalesCategories(pool))
	r.With(auth.RequirePermission("sales.sales_categories", auth.AccessWrite)).Post("/categories", createSalesCategory(pool))
	r.With(auth.RequirePermission("sales.sales_categories", auth.AccessWrite)).Patch("/categories/{id}", updateSalesCategory(pool))
}

func listSalesCategories(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		activeOnly := strings.TrimSpace(r.URL.Query().Get("active")) != "false"
		q := `
			select id, code, name, active, sort_order
			from public.sa_sales_categories
			where tenant_id = $1`
		args := []any{tu.TenantID}
		if activeOnly {
			q += ` and active = true`
		}
		q += ` order by sort_order, name`
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list sales categories.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []SalesCategory
		for rows.Next() {
			var row SalesCategory
			if err := rows.Scan(&row.ID, &row.Code, &row.Name, &row.Active, &row.SortOrder); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read sales categories.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []SalesCategory{}
		}
		response.OK(w, out, "OK")
	}
}

func createSalesCategory(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body salesCategoryBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		code := strings.TrimSpace(body.Code)
		name := strings.TrimSpace(body.Name)
		if code == "" || name == "" {
			response.Validation(w, map[string]string{"code": "Code and name are required."})
			return
		}
		active := true
		if body.Active != nil {
			active = *body.Active
		}
		sortOrder := 0
		if body.SortOrder != nil {
			sortOrder = *body.SortOrder
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.sa_sales_categories (tenant_id, code, name, active, sort_order)
			values ($1, $2, $3, $4, $5)
			on conflict (tenant_id, code) do update set
			  name = excluded.name,
			  active = excluded.active,
			  sort_order = excluded.sort_order,
			  updated_at = now()
			returning id`,
			tu.TenantID, code, name, active, sortOrder).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save sales category.", "ERR_INTERNAL")
			return
		}
		row := SalesCategory{ID: id, Code: code, Name: name, Active: active, SortOrder: sortOrder}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales.category.upsert", "sa_sales_category", &id, nil, body)
		response.OK(w, row, "Saved.")
	}
}

func updateSalesCategory(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body salesCategoryBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		name := strings.TrimSpace(body.Name)
		if name == "" {
			response.Validation(w, map[string]string{"name": "Name is required."})
			return
		}
		active := true
		if body.Active != nil {
			active = *body.Active
		}
		sortOrder := 0
		if body.SortOrder != nil {
			sortOrder = *body.SortOrder
		}
		tag, err := pool.Exec(r.Context(), `
			update public.sa_sales_categories
			set name = $1, active = $2, sort_order = $3, updated_at = now()
			where id = $4 and tenant_id = $5`,
			name, active, sortOrder, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Sales category not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales.category.update", "sa_sales_category", &id, nil, body)
		response.OK(w, map[string]any{"id": id}, "Saved.")
	}
}

func salesCategoryActive(ctx context.Context, pool *pgxpool.Pool, tenantID int64, code string) bool {
	code = strings.TrimSpace(code)
	if code == "" {
		return true
	}
	var ok bool
	_ = pool.QueryRow(ctx, `
		select exists(
			select 1 from public.sa_sales_categories
			where tenant_id = $1 and code = $2 and active = true
		)`, tenantID, code).Scan(&ok)
	return ok
}
