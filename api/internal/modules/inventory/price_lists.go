package inventory

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type PriceList struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	IsSelling bool   `json:"is_selling"`
	IsBuying  bool   `json:"is_buying"`
	IsActive  bool   `json:"is_active"`
}

func registerPriceListRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("inventory.price_lists", auth.AccessRead)).Get("/price-lists", listPriceLists(pool))
	r.With(auth.RequirePermission("inventory.price_lists", auth.AccessRead)).Get("/price-lists/{id}/items", listPriceListItems(pool))
	r.With(auth.RequirePermission("inventory.price_lists", auth.AccessWrite)).Post("/price-lists", createPriceList(pool))
	r.With(auth.RequirePermission("inventory.price_list_items", auth.AccessWrite)).Put("/price-lists/{id}/items", upsertPriceListItems(pool))
	r.Get("/price-lists/resolve-rate", resolveItemRate(pool))
}

func listPriceLists(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, name, is_selling, is_buying, is_active from public.inv_price_lists
			where tenant_id = $1 order by name`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list price lists.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []PriceList
		for rows.Next() {
			var pl PriceList
			if err := rows.Scan(&pl.ID, &pl.Name, &pl.IsSelling, &pl.IsBuying, &pl.IsActive); err != nil {
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
			IsBuying  bool   `json:"is_buying"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" {
			response.Validation(w, map[string]string{"name": "Name is required."})
			return
		}
		isSelling := body.IsSelling
		isBuying := body.IsBuying
		if isBuying {
			isSelling = false
		} else if !isSelling {
			isSelling = true
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.inv_price_lists (tenant_id, name, is_selling, is_buying) values ($1, $2, $3, $4) returning id`,
			tu.TenantID, body.Name, isSelling, isBuying).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create price list.", "ERR_INTERNAL")
			return
		}
		response.OK(w, PriceList{ID: id, Name: body.Name, IsSelling: isSelling, IsBuying: isBuying, IsActive: true}, "Created.")
	}
}

func listPriceListItems(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		listID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var listTenant int64
		if err := pool.QueryRow(r.Context(), `select tenant_id from public.inv_price_lists where id = $1`, listID).Scan(&listTenant); err != nil || listTenant != tu.TenantID {
			response.Err(w, http.StatusNotFound, "Price list not found.", "ERR_NOT_FOUND")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select pli.item_id, i.item_code, i.item_name, pli.rate::float8
			from public.inv_price_list_items pli
			join public.inv_items i on i.id = pli.item_id
			where pli.price_list_id = $1
			order by i.item_code`, listID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list items.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		type row struct {
			ItemID   int64   `json:"item_id"`
			ItemCode string  `json:"item_code"`
			ItemName string  `json:"item_name"`
			Rate     float64 `json:"rate"`
		}
		var out []row
		for rows.Next() {
			var x row
			if err := rows.Scan(&x.ItemID, &x.ItemCode, &x.ItemName, &x.Rate); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read item.", "ERR_INTERNAL")
				return
			}
			out = append(out, x)
		}
		if out == nil {
			out = []row{}
		}
		response.OK(w, out, "OK")
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

// ResolveSellingUnitPrice returns current price when set; otherwise resolves from partner price list.
func ResolveSellingUnitPrice(ctx context.Context, pool *pgxpool.Pool, tenantID, itemID, partnerID int64, current float64) float64 {
	if current > 0 || itemID <= 0 || partnerID <= 0 {
		return current
	}
	pid := partnerID
	rate, err := ResolveItemRateTx(ctx, pool, tenantID, itemID, &pid)
	if err != nil || rate <= 0 {
		return current
	}
	return rate
}

// ResolveBuyingItemRateTx returns buying rate from partner buying price list or item purchase_price.
func ResolveBuyingItemRateTx(ctx context.Context, pool *pgxpool.Pool, tenantID, itemID int64, partnerID *int64) (float64, error) {
	var rate float64
	var pid any
	if partnerID != nil {
		pid = *partnerID
	}
	err := pool.QueryRow(ctx, `
		select coalesce(pli.rate, i.purchase_price, 0)::float8
		from public.inv_items i
		left join public.inv_partners p on p.id = $4 and p.tenant_id = $1
		left join public.inv_price_lists pl on pl.id = p.default_price_list_id and pl.is_buying = true
		left join public.inv_price_list_items pli on pli.price_list_id = pl.id and pli.item_id = i.id
		where i.tenant_id = $1 and i.id = $2`, tenantID, itemID, pid, pid).Scan(&rate)
	return rate, err
}

// ResolveBuyingUnitPrice returns current price when set; otherwise resolves from partner buying price list.
func ResolveBuyingUnitPrice(ctx context.Context, pool *pgxpool.Pool, tenantID, itemID, partnerID int64, current float64) float64 {
	if current > 0 || itemID <= 0 || partnerID <= 0 {
		return current
	}
	pid := partnerID
	rate, err := ResolveBuyingItemRateTx(ctx, pool, tenantID, itemID, &pid)
	if err != nil || rate <= 0 {
		return current
	}
	return rate
}
