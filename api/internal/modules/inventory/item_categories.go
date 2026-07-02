package inventory

import (
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

type ItemCategory struct {
	ID        int64  `json:"id"`
	Code      string `json:"code"`
	Name      string `json:"name"`
	Active    bool   `json:"active"`
	Icon      string `json:"icon,omitempty"`
	Color     string `json:"color,omitempty"`
	SortOrder int    `json:"sort_order"`
}

type itemCategoryBody struct {
	Code      string `json:"code"`
	Name      string `json:"name"`
	Active    *bool  `json:"active"`
	Icon      *string `json:"icon"`
	Color     *string `json:"color"`
	SortOrder *int    `json:"sort_order"`
}

func registerItemCategoryRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("inventory.item_categories", auth.AccessRead)).Get("/item-categories", listItemCategories(pool))
	r.With(auth.RequirePermission("inventory.item_categories", auth.AccessWrite)).Post("/item-categories", createItemCategory(pool))
	r.With(auth.RequirePermission("inventory.item_categories", auth.AccessWrite)).Patch("/item-categories/{id}", updateItemCategory(pool))
}

func listItemCategories(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		activeOnly := strings.TrimSpace(r.URL.Query().Get("active")) != "false"
		q := `
			select id, code, name, active, coalesce(icon, ''), coalesce(color, ''), sort_order
			from public.inv_item_categories
			where tenant_id = $1`
		args := []any{tu.TenantID}
		if activeOnly {
			q += ` and active = true`
		}
		q += ` order by sort_order, name`
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list item categories.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []ItemCategory
		for rows.Next() {
			var row ItemCategory
			if err := rows.Scan(&row.ID, &row.Code, &row.Name, &row.Active, &row.Icon, &row.Color, &row.SortOrder); err != nil {
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
		sortOrder := 0
		if body.SortOrder != nil {
			sortOrder = *body.SortOrder
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.inv_item_categories (tenant_id, code, name, active, icon, color, sort_order)
			values ($1, $2, $3, $4, $5, $6, $7)
			on conflict (tenant_id, code) do update set
			  name = excluded.name,
			  active = excluded.active,
			  icon = excluded.icon,
			  color = excluded.color,
			  sort_order = excluded.sort_order,
			  updated_at = now()
			returning id`,
			tu.TenantID, code, name, active, trimPtr(body.Icon), trimPtr(body.Color), sortOrder).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save item category.", "ERR_INTERNAL")
			return
		}
		row := ItemCategory{ID: id, Code: code, Name: name, Active: active, SortOrder: sortOrder}
		if body.Icon != nil {
			row.Icon = strings.TrimSpace(*body.Icon)
		}
		if body.Color != nil {
			row.Color = strings.TrimSpace(*body.Color)
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.item_category.upsert", "inv_item_category", &id, nil, body)
		response.OK(w, row, "Saved.")
	}
}

func updateItemCategory(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body itemCategoryBody
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
			update public.inv_item_categories
			set name = $1, active = $2, icon = $3, color = $4, sort_order = $5, updated_at = now()
			where id = $6 and tenant_id = $7`,
			name, active, trimPtr(body.Icon), trimPtr(body.Color), sortOrder, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Item category not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.item_category.update", "inv_item_category", &id, nil, body)
		response.OK(w, map[string]any{"id": id}, "Saved.")
	}
}

func trimPtr(s *string) *string {
	if s == nil {
		return nil
	}
	t := strings.TrimSpace(*s)
	if t == "" {
		return nil
	}
	return &t
}
