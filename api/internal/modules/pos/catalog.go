package pos

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const defaultLowStockQty = 5.0
const topSellerCap = 12

type CatalogCategory struct {
	ID        int64  `json:"id"`
	Code      string `json:"code"`
	Name      string `json:"name"`
	Icon      string `json:"icon,omitempty"`
	Color     string `json:"color,omitempty"`
	SortOrder int    `json:"sort_order"`
}

type CatalogItem struct {
	ID             int64    `json:"id"`
	ItemCode       string   `json:"item_code"`
	ItemName       string   `json:"item_name"`
	Price          float64  `json:"price"`
	ImageURL       string   `json:"image_url,omitempty"`
	ItemCategoryID *int64   `json:"item_category_id,omitempty"`
	TrackInventory bool     `json:"track_inventory_qty"`
	TrackSerial    bool     `json:"track_serial"`
	TrackLot       bool     `json:"track_lot"`
	HasModifiers   bool     `json:"has_modifiers"`
	PosVisible     bool     `json:"pos_visible"`
	QtyAvailable   *float64 `json:"qty_available,omitempty"`
	ReorderLevel   *float64 `json:"reorder_level,omitempty"`
	// stock_status: ok | low | sold_out | untracked
	StockStatus string `json:"stock_status,omitempty"`
	IsTopSeller bool   `json:"is_top_seller,omitempty"`
}

func registerCatalogRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/catalog/categories", listCatalogCategories(pool))
	r.Get("/catalog/items", listCatalogItems(pool))
	r.With(auth.RequirePermission("pos.manage", auth.AccessWrite)).
		Patch("/catalog/items/{id}/visibility", patchCatalogItemVisibility(pool))
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
		where := "i.tenant_id = $1 and i.deleted_at is null and i.status = 'active' and coalesce(i.pos_visible, true) = true"
		args := []any{tu.TenantID}
		n := 2
		if raw := strings.TrimSpace(r.URL.Query().Get("category_id")); raw != "" {
			if cid, err := strconv.ParseInt(raw, 10, 64); err == nil && cid > 0 {
				where += fmt.Sprintf(" and i.item_category_id = $%d", n)
				args = append(args, cid)
				n++
			}
		}
		if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
			where += fmt.Sprintf(" and (i.item_name ilike $%d or i.item_code ilike $%d)", n, n)
			args = append(args, "%"+q+"%")
			n++
		}
		var locationID int64
		if raw := strings.TrimSpace(r.URL.Query().Get("location_id")); raw != "" {
			if id, err := strconv.ParseInt(raw, 10, 64); err == nil && id > 0 {
				locationID = id
			}
		}
		query := fmt.Sprintf(`
			select i.id, i.item_code, i.item_name, i.sales_price::float8, i.image_path, i.item_category_id, i.track_inventory_qty,
			  coalesce(i.track_serial, false), coalesce(i.track_lot, false),
			  exists(
			    select 1 from public.pos_modifier_groups g
			    join public.pos_modifiers m on m.group_id = g.id and m.active = true
			    where g.tenant_id = i.tenant_id and g.active = true
			      and ((g.scope = 'item' and g.item_id = i.id)
			        or (g.scope = 'category' and g.category_id is not distinct from i.item_category_id))
			  ) as has_modifiers,
			  coalesce(i.pos_visible, true),
			  i.reorder_level::float8
			from public.inv_items i
			where %s
			order by i.item_name
			limit 500`, where)
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
			var reorder *float64
			if err := rows.Scan(&it.ID, &it.ItemCode, &it.ItemName, &it.Price, &imagePath, &it.ItemCategoryID, &it.TrackInventory, &it.TrackSerial, &it.TrackLot, &it.HasModifiers, &it.PosVisible, &reorder); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read items.", "ERR_INTERNAL")
				return
			}
			it.ReorderLevel = reorder
			if imagePath != nil && strings.TrimSpace(*imagePath) != "" {
				it.ImageURL = fmt.Sprintf("/api/v1/inventory/items/%d/image", it.ID)
			}
			out = append(out, it)
		}
		if out == nil {
			out = []CatalogItem{}
		}
		if locationID > 0 && len(out) > 0 {
			enrichCatalogStock(r.Context(), pool, tu.TenantID, locationID, out)
		} else {
			for i := range out {
				out[i].StockStatus = deriveStockStatus(catalogTracked(out[i]), nil, out[i].ReorderLevel)
			}
		}
		stockFilter := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("stock")))
		if stockFilter != "" && stockFilter != "all" {
			filtered := out[:0]
			for _, it := range out {
				switch stockFilter {
				case "in_stock":
					if it.StockStatus == "ok" || it.StockStatus == "low" || it.StockStatus == "untracked" {
						filtered = append(filtered, it)
					}
				case "low":
					if it.StockStatus == "low" {
						filtered = append(filtered, it)
					}
				case "sold_out":
					if it.StockStatus == "sold_out" {
						filtered = append(filtered, it)
					}
				case "top":
					if it.IsTopSeller {
						filtered = append(filtered, it)
					}
				default:
					filtered = append(filtered, it)
				}
			}
			out = filtered
		}
		response.OK(w, out, "OK")
	}
}

func patchCatalogItemVisibility(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := parseID(chi.URLParam(r, "id"))
		if err != nil {
			response.Err(w, http.StatusNotFound, "Item not found.", "ERR_NOT_FOUND")
			return
		}
		var body struct {
			PosVisible *bool `json:"pos_visible"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.PosVisible == nil {
			response.Validation(w, map[string]string{"pos_visible": "Required boolean."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.inv_items set pos_visible = $3, updated_at = now()
			where id = $1 and tenant_id = $2 and deleted_at is null`,
			id, tu.TenantID, *body.PosVisible)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update visibility.", "ERR_INTERNAL")
			return
		}
		if tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Item not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id, "pos_visible": *body.PosVisible}, "Updated.")
	}
}

func enrichCatalogStock(ctx context.Context, pool *pgxpool.Pool, tenantID, locationID int64, items []CatalogItem) {
	ids := make([]int64, len(items))
	idx := map[int64]int{}
	for i, it := range items {
		ids[i] = it.ID
		idx[it.ID] = i
	}

	balRows, err := pool.Query(ctx, `
		select item_id, qty_on_hand::float8
		from public.inv_item_location_balances
		where tenant_id = $1 and location_id = $2 and item_id = any($3)`,
		tenantID, locationID, ids)
	if err == nil {
		defer balRows.Close()
		for balRows.Next() {
			var iid int64
			var qty float64
			if err := balRows.Scan(&iid, &qty); err != nil {
				continue
			}
			if i, ok := idx[iid]; ok {
				q := roundMoney(qty)
				items[i].QtyAvailable = &q
			}
		}
	}

	serRows, err := pool.Query(ctx, `
		select item_id, count(*)::float8
		from public.inv_serial_units
		where tenant_id = $1 and location_id = $2 and status = 'in_stock' and item_id = any($3)
		group by item_id`,
		tenantID, locationID, ids)
	if err == nil {
		defer serRows.Close()
		for serRows.Next() {
			var iid int64
			var cnt float64
			if err := serRows.Scan(&iid, &cnt); err != nil {
				continue
			}
			if i, ok := idx[iid]; ok && items[i].TrackSerial {
				q := roundMoney(cnt)
				items[i].QtyAvailable = &q
			}
		}
	}

	// Sellable lot qty at register (non-expired). For track_lot items this overrides balance
	// so expired-only stock does not look available when FEFO cannot assign.
	lotQtyByItem := map[int64]float64{}
	lotRows, err := pool.Query(ctx, `
		select item_id, coalesce(sum(qty_on_hand), 0)::float8
		from public.inv_lot_batches
		where tenant_id = $1 and location_id = $2 and item_id = any($3)
		  and qty_on_hand > 0
		  and (expiry_date is null or expiry_date >= current_date)
		group by item_id`,
		tenantID, locationID, ids)
	if err == nil {
		defer lotRows.Close()
		for lotRows.Next() {
			var iid int64
			var lotQty float64
			if err := lotRows.Scan(&iid, &lotQty); err != nil {
				continue
			}
			lotQtyByItem[iid] = lotQty
		}
	}
	for i := range items {
		if !items[i].TrackLot {
			continue
		}
		q := roundMoney(lotQtyByItem[items[i].ID]) // 0 when no sellable lots
		items[i].QtyAvailable = &q
	}

	top := loadTopSellerIDs(ctx, pool, tenantID, locationID, topSellerCap)
	for i := range items {
		items[i].IsTopSeller = top[items[i].ID]
		items[i].StockStatus = deriveStockStatus(
			catalogTracked(items[i]),
			items[i].QtyAvailable,
			items[i].ReorderLevel,
		)
	}
}

func catalogTracked(it CatalogItem) bool {
	return it.TrackInventory || it.TrackSerial || it.TrackLot
}

func loadTopSellerIDs(ctx context.Context, pool *pgxpool.Pool, tenantID, locationID int64, capN int) map[int64]bool {
	out := map[int64]bool{}
	if capN <= 0 {
		return out
	}
	rows, err := pool.Query(ctx, `
		select sl.item_id
		from public.pos_tenders t
		join public.pos_sessions sess on sess.id = t.session_id and sess.tenant_id = $1
		join public.sa_sales s on s.id = t.sales_id and s.deleted_at is null
		join public.sa_sales_lines sl on sl.sales_id = s.id
		where sess.location_id = $2
		  and s.created_at >= (now() - interval '30 days')
		group by sl.item_id
		order by sum(sl.qty) desc
		limit $3`, tenantID, locationID, capN)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err == nil {
			out[id] = true
		}
	}
	return out
}

// deriveStockStatus picks ok | low | sold_out | untracked.
// tracked=false → untracked. sold_out when qty missing or ≤0. low when 0 < qty ≤ reorder (or default).
func deriveStockStatus(tracked bool, qty *float64, reorder *float64) string {
	if !tracked {
		return "untracked"
	}
	var q float64
	if qty == nil {
		q = 0
	} else {
		q = *qty
	}
	if q <= 0 {
		return "sold_out"
	}
	threshold := defaultLowStockQty
	if reorder != nil && *reorder > 0 {
		threshold = *reorder
	}
	if q <= threshold {
		return "low"
	}
	return "ok"
}
