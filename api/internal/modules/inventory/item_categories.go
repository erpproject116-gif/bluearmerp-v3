package inventory

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

type ItemCategory struct {
	ID     int64  `json:"id"`
	Code   string `json:"code"`
	Name   string `json:"name"`
	Active bool   `json:"active"`
}

type itemCategoryBody struct {
	Code   string `json:"code"`
	Name   string `json:"name"`
	Active *bool  `json:"active"`
}

func registerItemCategoryRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("inventory.item_categories", auth.AccessRead)).Get("/item-categories", listItemCategories(pool))
	r.With(auth.RequirePermission("inventory.item_categories", auth.AccessWrite)).Post("/item-categories", createItemCategory(pool))
}

func listItemCategories(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		activeOnly := strings.TrimSpace(r.URL.Query().Get("active")) != "false"
		q := `
			select id, code, name, active
			from public.inv_item_categories
			where tenant_id = $1`
		args := []any{tu.TenantID}
		if activeOnly {
			q += ` and active = true`
		}
		q += ` order by name`
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list item categories.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []ItemCategory
		for rows.Next() {
			var row ItemCategory
			if err := rows.Scan(&row.ID, &row.Code, &row.Name, &row.Active); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read item categories.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []ItemCategory{}
		}
		response.OK(w, out, "OK")
	}
}

func createItemCategory(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body itemCategoryBody
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
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.inv_item_categories (tenant_id, code, name, active)
			values ($1, $2, $3, $4)
			on conflict (tenant_id, code) do update set
			  name = excluded.name,
			  active = excluded.active,
			  updated_at = now()
			returning id`,
			tu.TenantID, code, name, active).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save item category.", "ERR_INTERNAL")
			return
		}
		row := ItemCategory{ID: id, Code: code, Name: name, Active: active}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.item_category.upsert", "inv_item_category", &id, nil, body)
		response.OK(w, row, "Saved.")
	}
}
