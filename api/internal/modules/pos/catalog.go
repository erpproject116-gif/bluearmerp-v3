package pos

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type CatalogCategory struct {
	ID        int64  `json:"id"`
	Code      string `json:"code"`
	Name      string `json:"name"`
	Icon      string `json:"icon,omitempty"`
	Color     string `json:"color,omitempty"`
	SortOrder int    `json:"sort_order"`
}

type CatalogItem struct {
	ID             int64   `json:"id"`
	ItemCode       string  `json:"item_code"`
	ItemName       string  `json:"item_name"`
	Price          float64 `json:"price"`
	ImageURL       string  `json:"image_url,omitempty"`
	ItemCategoryID *int64  `json:"item_category_id,omitempty"`
	TrackInventory bool    `json:"track_inventory_qty"`
	HasModifiers   bool    `json:"has_modifiers"`
}

func registerCatalogRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/catalog/categories", listCatalogCategories(pool))
	r.Get("/catalog/items", listCatalogItems(pool))
}

func listCatalogCategories(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, code, name, coalesce(icon, ''), coalesce(color, ''), sort_order
			from public.inv_item_categories
			where tenant_id = $1 and active = true
			order by sort_order, name`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load categories.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []CatalogCategory
		for rows.Next() {
			var c CatalogCategory
			if err := rows.Scan(&c.ID, &c.Code, &c.Name, &c.Icon, &c.Color, &c.SortOrder); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read categories.", "ERR_INTERNAL")
				return
			}
			out = append(out, c)
		}
		if out == nil {
			out = []CatalogCategory{}
		}
		response.OK(w, out, "OK")
	}
}

func listCatalogItems(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		where := "tenant_id = $1 and deleted_at is null and status = 'active'"
		args := []any{tu.TenantID}
		n := 2
		if raw := strings.TrimSpace(r.URL.Query().Get("category_id")); raw != "" {
			if cid, err := strconv.ParseInt(raw, 10, 64); err == nil && cid > 0 {
				where += fmt.Sprintf(" and item_category_id = $%d", n)
				args = append(args, cid)
				n++
			}
		}
		if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
			where += fmt.Sprintf(" and (item_name ilike $%d or item_code ilike $%d)", n, n)
			args = append(args, "%"+q+"%")
			n++
		}
		query := fmt.Sprintf(`
			select i.id, i.item_code, i.item_name, i.sales_price::float8, i.image_path, i.item_category_id, i.track_inventory_qty,
			  exists(
			    select 1 from public.pos_modifier_groups g
			    join public.pos_modifiers m on m.group_id = g.id and m.active = true
			    where g.tenant_id = i.tenant_id and g.active = true
			      and ((g.scope = 'item' and g.item_id = i.id)
			        or (g.scope = 'category' and g.category_id is not distinct from i.item_category_id))
			  ) as has_modifiers
			from public.inv_items i
			where %s
			order by i.item_name
			limit 500`, strings.ReplaceAll(where, "tenant_id", "i.tenant_id"))
		rows, err := pool.Query(r.Context(), query, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load items.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []CatalogItem
		for rows.Next() {
			var it CatalogItem
			var imagePath *string
			if err := rows.Scan(&it.ID, &it.ItemCode, &it.ItemName, &it.Price, &imagePath, &it.ItemCategoryID, &it.TrackInventory, &it.HasModifiers); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read items.", "ERR_INTERNAL")
				return
			}
			if imagePath != nil && strings.TrimSpace(*imagePath) != "" {
				it.ImageURL = fmt.Sprintf("/api/v1/inventory/items/%d/image", it.ID)
			}
			out = append(out, it)
		}
		if out == nil {
			out = []CatalogItem{}
		}
		response.OK(w, out, "OK")
	}
}
