package inventory

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type itemSearchFilters struct {
	ItemCode             string   `json:"item_code"`
	ItemName             string   `json:"item_name"`
	SpecName             string   `json:"spec_name"`
	Unit                 string   `json:"unit"`
	ItemCategories       []string `json:"item_categories"`
	ProductionProcess    string   `json:"production_process"`
	PurchasePriceMin     *float64 `json:"purchase_price_min"`
	PurchasePriceMax     *float64 `json:"purchase_price_max"`
	SalesPriceMin        *float64 `json:"sales_price_min"`
	SalesPriceMax        *float64 `json:"sales_price_max"`
	TrackInventoryQty    string   `json:"track_inventory_qty"`
	Keyword              string   `json:"keyword"`
	ItemTypes            []string `json:"item_types"`
	SortByModified       bool     `json:"sort_by_modified"`
	UsageStatus          string   `json:"usage_status"`
	ContextLocationID    *int64   `json:"context_location_id"`
	MinTotalInvQty       *float64 `json:"min_total_inv_qty"`
	MinDefaultLocationQty *float64 `json:"min_default_location_qty"`
	Page                 int      `json:"page"`
	PageSize             int      `json:"page_size"`
}

type itemSearchResult struct {
	ID                  int64    `json:"id"`
	ItemCode            string   `json:"item_code"`
	ItemName            string   `json:"item_name"`
	SpecName            *string  `json:"spec_name,omitempty"`
	SalesPrice          float64  `json:"sales_price"`
	Status              string   `json:"status"`
	TrackInventoryQty   bool     `json:"track_inventory_qty"`
	TrackSerial         bool     `json:"track_serial"`
	DefaultLocationQty  *float64 `json:"default_location_qty,omitempty"`
	TotalInvQty         *float64 `json:"total_inv_qty,omitempty"`
}

var validItemCategories = map[string]bool{
	"raw_material": true, "sub_material": true, "finished_goods": true,
	"semi_finished_goods": true, "merchandise": true, "intangible_merchandise": true,
}

var validItemTypes = map[string]bool{
	"item": true, "multiple_process_item": true, "multi_spec_item": true,
}

func registerItemSearchRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Post("/items/search", searchItems(pool))
}

func searchItems(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var f itemSearchFilters
		if err := json.NewDecoder(r.Body).Decode(&f); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if f.Page < 1 {
			f.Page = 1
		}
		if f.PageSize < 1 || f.PageSize > 100 {
			f.PageSize = 50
		}
		offset := (f.Page - 1) * f.PageSize

		where := "i.tenant_id = $1 and i.deleted_at is null"
		args := []any{tu.TenantID}
		argN := 2

		var contextLocID int64
		if f.ContextLocationID != nil && *f.ContextLocationID > 0 {
			contextLocID = *f.ContextLocationID
		}

		if s := strings.TrimSpace(f.ItemCode); s != "" {
			where += fmt.Sprintf(" and i.item_code ilike $%d", argN)
			args = append(args, "%"+s+"%")
			argN++
		}
		if s := strings.TrimSpace(f.ItemName); s != "" {
			where += fmt.Sprintf(" and i.item_name ilike $%d", argN)
			args = append(args, "%"+s+"%")
			argN++
		}
		if s := strings.TrimSpace(f.SpecName); s != "" {
			where += fmt.Sprintf(" and coalesce(i.spec_name,'') ilike $%d", argN)
			args = append(args, "%"+s+"%")
			argN++
		}
		if s := strings.TrimSpace(f.Unit); s != "" {
			where += fmt.Sprintf(" and coalesce(i.unit,'') ilike $%d", argN)
			args = append(args, "%"+s+"%")
			argN++
		}
		if len(f.ItemCategories) > 0 {
			var cats []string
			for _, c := range f.ItemCategories {
				if validItemCategories[c] {
					cats = append(cats, c)
				}
			}
			if len(cats) > 0 {
				where += fmt.Sprintf(" and i.item_category = any($%d)", argN)
				args = append(args, cats)
				argN++
			}
		}
		if s := strings.TrimSpace(f.ProductionProcess); s == "bundle" || s == "service" {
			where += fmt.Sprintf(" and i.production_process = $%d", argN)
			args = append(args, s)
			argN++
		}
		if f.PurchasePriceMin != nil {
			where += fmt.Sprintf(" and i.purchase_price >= $%d", argN)
			args = append(args, *f.PurchasePriceMin)
			argN++
		}
		if f.PurchasePriceMax != nil {
			where += fmt.Sprintf(" and i.purchase_price <= $%d", argN)
			args = append(args, *f.PurchasePriceMax)
			argN++
		}
		if f.SalesPriceMin != nil {
			where += fmt.Sprintf(" and i.sales_price >= $%d", argN)
			args = append(args, *f.SalesPriceMin)
			argN++
		}
		if f.SalesPriceMax != nil {
			where += fmt.Sprintf(" and i.sales_price <= $%d", argN)
			args = append(args, *f.SalesPriceMax)
			argN++
		}
		switch f.TrackInventoryQty {
		case "use":
			where += " and i.track_inventory_qty = true"
		case "do_not_use":
			where += " and i.track_inventory_qty = false"
		}
		if s := strings.TrimSpace(f.Keyword); s != "" {
			where += fmt.Sprintf(" and (i.item_code ilike $%d or i.item_name ilike $%d or coalesce(i.spec_name,'') ilike $%d)", argN, argN, argN)
			args = append(args, "%"+s+"%")
			argN++
		}
		if len(f.ItemTypes) > 0 {
			var types []string
			for _, t := range f.ItemTypes {
				if validItemTypes[t] {
					types = append(types, t)
				}
			}
			if len(types) > 0 {
				where += fmt.Sprintf(" and i.item_type = any($%d)", argN)
				args = append(args, types)
				argN++
			}
		}
		switch f.UsageStatus {
		case "active":
			where += " and i.status = 'active'"
		case "inactive":
			where += " and i.status = 'inactive'"
		}

		contextLocArg := argN
		args = append(args, contextLocID)
		argN++

		having := ""
		if f.MinTotalInvQty != nil {
			having = fmt.Sprintf(" having coalesce(sum(tot.qty_on_hand), 0) >= $%d", argN)
			args = append(args, *f.MinTotalInvQty)
			argN++
		}
		if f.MinDefaultLocationQty != nil {
			if having == "" {
				having = " having "
			} else {
				having += " and "
			}
			having += fmt.Sprintf(`coalesce(max(case
				when $%d::bigint > 0 and defloc.location_id = $%d::bigint then defloc.qty_on_hand
				when $%d::bigint = 0 and i.default_location_id is not null and defloc.location_id = i.default_location_id then defloc.qty_on_hand
				else null end), 0) >= $%d`, contextLocArg, contextLocArg, contextLocArg, argN)
			args = append(args, *f.MinDefaultLocationQty)
			argN++
		}

		orderBy := "i.item_code asc"
		if f.SortByModified {
			orderBy = "i.updated_at desc"
		}

		limitArg := argN
		offsetArg := argN + 1
		args = append(args, f.PageSize, offset)

		q := fmt.Sprintf(`
			select i.id, i.item_code, i.item_name, i.spec_name, i.sales_price::float8, i.status,
			       i.track_inventory_qty, coalesce(i.track_serial, false),
			       max(case
			         when $%d::bigint > 0 and defloc.location_id = $%d::bigint then defloc.qty_on_hand
			         when $%d::bigint = 0 and i.default_location_id is not null and defloc.location_id = i.default_location_id then defloc.qty_on_hand
			         else null end)::float8 as default_location_qty,
			       coalesce(sum(tot.qty_on_hand), 0)::float8 as total_inv_qty,
			       count(*) over()
			from public.inv_items i
			left join public.inv_item_location_balances defloc
			  on defloc.tenant_id = i.tenant_id and defloc.item_id = i.id
			left join public.inv_item_location_balances tot
			  on tot.tenant_id = i.tenant_id and tot.item_id = i.id
			where %s
			group by i.id
			%s
			order by %s
			limit $%d offset $%d`, contextLocArg, contextLocArg, contextLocArg, where, having, orderBy, limitArg, offsetArg)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Item search failed.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []itemSearchResult
		var total int64
		for rows.Next() {
			var row itemSearchResult
			var defQty, totQty *float64
			if err := rows.Scan(&row.ID, &row.ItemCode, &row.ItemName, &row.SpecName, &row.SalesPrice, &row.Status,
				&row.TrackInventoryQty, &row.TrackSerial, &defQty, &totQty, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read items.", "ERR_INTERNAL")
				return
			}
			if row.TrackInventoryQty {
				row.DefaultLocationQty = defQty
				row.TotalInvQty = totQty
			}
			out = append(out, row)
		}
		if out == nil {
			out = []itemSearchResult{}
		}
		response.OKList(w, out, f.Page, f.PageSize, total)
	}
}
