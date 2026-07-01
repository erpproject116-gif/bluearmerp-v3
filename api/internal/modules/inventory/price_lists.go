package inventory

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type PriceList struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	IsSelling bool   `json:"is_selling"`
	IsActive  bool   `json:"is_active"`
}

func registerPriceListRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("inventory.price_lists", auth.AccessRead)).Get("/price-lists", listPriceLists(pool))
	r.With(auth.RequirePermission("inventory.price_lists", auth.AccessWrite)).Post("/price-lists", createPriceList(pool))
	r.With(auth.RequirePermission("inventory.price_list_items", auth.AccessWrite)).Put("/price-lists/{id}/items", upsertPriceListItems(pool))
	r.Get("/price-lists/resolve-rate", resolveItemRate(pool))
}

func listPriceLists(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, name, is_selling, is_active from public.inv_price_lists
			where tenant_id = $1 order by name`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list price lists.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []PriceList
		for rows.Next() {
			var pl PriceList
			if err := rows.Scan(&pl.ID, &pl.Name, &pl.IsSelling, &pl.IsActive); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read price lists.", "ERR_INTERNAL")
				return
			}
			out = append(out, pl)
		}
		if out == nil {
			out = []PriceList{}
		}
		response.OK(w, out, "OK")
	}
}

func createPriceList(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body struct {
			Name      string `json:"name"`
			IsSelling bool   `json:"is_selling"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" {
			response.Validation(w, map[string]string{"name": "Name is required."})
			return
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.inv_price_lists (tenant_id, name, is_selling) values ($1, $2, $3) returning id`,
			tu.TenantID, body.Name, body.IsSelling).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create price list.", "ERR_INTERNAL")
			return
		}
		response.OK(w, PriceList{ID: id, Name: body.Name, IsSelling: body.IsSelling, IsActive: true}, "Created.")
	}
}

func upsertPriceListItems(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id := chi.URLParam(r, "id")
		var body struct {
			Items []struct {
				ItemID int64   `json:"item_id"`
				Rate   float64 `json:"rate"`
			} `json:"items"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		var listTenant int64
		if err := pool.QueryRow(r.Context(), `select tenant_id from public.inv_price_lists where id = $1`, id).Scan(&listTenant); err != nil || listTenant != tu.TenantID {
			response.Err(w, http.StatusNotFound, "Price list not found.", "ERR_NOT_FOUND")
			return
		}
		for _, it := range body.Items {
			_, err := pool.Exec(r.Context(), `
				insert into public.inv_price_list_items (price_list_id, item_id, rate) values ($1, $2, $3)
				on conflict (price_list_id, item_id) do update set rate = excluded.rate`,
				id, it.ItemID, it.Rate)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to save items.", "ERR_INTERNAL")
				return
			}
		}
		response.OK(w, nil, "Saved.")
	}
}

func resolveItemRate(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		itemID := r.URL.Query().Get("item_id")
		partnerID := r.URL.Query().Get("partner_id")
		var rate float64
		err := pool.QueryRow(r.Context(), `
			select coalesce(pli.rate, i.sales_price, 0)::float8
			from public.inv_items i
			left join public.inv_partners p on p.id = nullif($3::bigint, 0) and p.tenant_id = $1
			left join public.inv_price_list_items pli on pli.price_list_id = p.default_price_list_id and pli.item_id = i.id
			where i.tenant_id = $1 and i.id = $2::bigint`, tu.TenantID, itemID, partnerID).Scan(&rate)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Item not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]float64{"rate": rate}, "OK")
	}
}

// ResolveItemRateTx returns selling rate from partner price list or item default.
func ResolveItemRateTx(ctx context.Context, pool *pgxpool.Pool, tenantID, itemID int64, partnerID *int64) (float64, error) {
	var rate float64
	var pid any
	if partnerID != nil {
		pid = *partnerID
	}
	err := pool.QueryRow(ctx, `
		select coalesce(pli.rate, i.sales_price, 0)::float8
		from public.inv_items i
		left join public.inv_partners p on p.id = $4 and p.tenant_id = $1
		left join public.inv_price_list_items pli on pli.price_list_id = p.default_price_list_id and pli.item_id = i.id
		where i.tenant_id = $1 and i.id = $2`, tenantID, itemID, pid, pid).Scan(&rate)
	return rate, err
}
