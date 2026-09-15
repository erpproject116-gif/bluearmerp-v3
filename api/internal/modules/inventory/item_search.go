package inventory

import (
	"encoding/json"
	"fmt"
	"log"
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
	PurchasePrice       float64  `json:"purchase_price"`
	Status              string   `json:"status"`
	TrackInventoryQty   bool     `json:"track_inventory_qty"`
	TrackSerial         bool     `json:"track_serial"`
	TrackLot            bool     `json:"track_lot"`
	SerialPolicy        string   `json:"serial_policy"`
	LotPolicy           string   `json:"lot_policy"`
	BaseUnitID          *int64   `json:"base_unit_id,omitempty"`
	BaseUnitCode        string   `json:"base_unit_code,omitempty"`
	DefaultLocationQty     *float64 `json:"default_location_qty,omitempty"`
	TotalInvQty            *float64 `json:"total_inv_qty,omitempty"`
	WarrantyDurationMonths *int     `json:"warranty_duration_months,omitempty"`
}

var validItemCategories = map[string]bool{
	"raw_material": true, "sub_material": true, "finished_goods": true,
	"semi_finished_goods": true, "merchandise": true, "intangible_merchandise": true,
}

var allItemCategoryCodes = []string{
	"raw_material", "sub_material", "finished_goods",
	"semi_finished_goods", "merchandise", "intangible_merchandise",
}

var validItemTypes = map[string]bool{
	"item": true, "multiple_process_item": true, "multi_spec_item": true,
}

var allItemTypeCodes = []string{"item", "multiple_process_item", "multi_spec_item"}

func filterKnownCodes(codes []string, valid map[string]bool) []string {
	out := make([]string, 0, len(codes))
	for _, c := range codes {
		if valid[c] {
			out = append(out, c)
		}
	}
	return out
}

func isFullCategorySelection(cats []string) bool {
	if len(cats) != len(allItemCategoryCodes) {
		return false
	}
	set := make(map[string]bool, len(cats))
	for _, c := range cats {
		set[c] = true
	}
	for _, c := range allItemCategoryCodes {
		if !set[c] {
			return false
		}
	}
	return true
}

func isFullTypeSelection(types []string) bool {
	if len(types) != len(allItemTypeCodes) {
		return false
	}
	set := make(map[string]bool, len(types))
	for _, t := range types {
		set[t] = true
	}
	for _, t := range allItemTypeCodes {
		if !set[t] {
			return false
		}
	}
	return true
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
		if cats := filterKnownCodes(f.ItemCategories, validItemCategories); len(cats) > 0 && !isFullCategorySelection(cats) {
			where += fmt.Sprintf(" and coalesce(cat.code, i.item_category, 'merchandise') = any($%d)", argN)
			args = append(args, cats)
			argN++
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
		if types := filterKnownCodes(f.ItemTypes, validItemTypes); len(types) > 0 && !isFullTypeSelection(types) {
			where += fmt.Sprintf(" and i.item_type = any($%d)", argN)
			args = append(args, types)
			argN++
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

		if f.MinTotalInvQty != nil {
			where += fmt.Sprintf(` and coalesce(tot_bal.qty_on_hand, 0) >= $%d`, argN)
			args = append(args, *f.MinTotalInvQty)
			argN++
		}
		if f.MinDefaultLocationQty != nil {
			where += fmt.Sprintf(` and coalesce(def_bal.qty_on_hand, 0) >= $%d`, argN)
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
			select i.id, i.item_code, i.item_name, i.spec_name, i.sales_price::float8, coalesce(i.purchase_price, 0)::float8, i.status,
			       i.track_inventory_qty, coalesce(i.track_serial, false), coalesce(i.track_lot, false),
			       coalesce(i.serial_policy, 'required'), coalesce(i.lot_policy, 'required'),
			       i.base_unit_id,
			       coalesce(bu.code, nullif(trim(i.unit), ''), '') as base_unit_code,
			       def_bal.qty_on_hand::float8 as default_location_qty,
			       coalesce(tot_bal.qty_on_hand, 0)::float8 as total_inv_qty,
			       i.warranty_duration_months,
			       count(*) over()
			from public.inv_items i
			left join public.inv_units bu on bu.id = i.base_unit_id
			left join public.inv_item_categories cat
			  on cat.id = i.item_category_id and cat.tenant_id = i.tenant_id
			left join lateral (
			  select b.qty_on_hand
			  from public.inv_item_location_balances b
			  where b.tenant_id = i.tenant_id and b.item_id = i.id
			    and (
			      ($%[1]d::bigint > 0 and b.location_id = $%[1]d::bigint)
			      or ($%[1]d::bigint = 0 and i.default_location_id is not null and b.location_id = i.default_location_id)
			    )
			  limit 1
			) def_bal on true
			left join lateral (
			  select coalesce(sum(b.qty_on_hand), 0) as qty_on_hand
			  from public.inv_item_location_balances b
			  where b.tenant_id = i.tenant_id and b.item_id = i.id
			) tot_bal on true
			where %s
			order by %s
			limit $%d offset $%d`, contextLocArg, where, orderBy, limitArg, offsetArg)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			log.Printf("inventory item search: %v", err)
			response.Err(w, http.StatusInternalServerError, "Item search failed.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []itemSearchResult
		var total int64
		for rows.Next() {
			var row itemSearchResult
			var defQty, totQty *float64
			if err := rows.Scan(&row.ID, &row.ItemCode, &row.ItemName, &row.SpecName, &row.SalesPrice, &row.PurchasePrice, &row.Status,
				&row.TrackInventoryQty, &row.TrackSerial, &row.TrackLot, &row.SerialPolicy, &row.LotPolicy,
				&row.BaseUnitID, &row.BaseUnitCode, &defQty, &totQty, &row.WarrantyDurationMonths, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read items.", "ERR_INTERNAL")
				return
			}
			if row.TrackInventoryQty {
				row.DefaultLocationQty = defQty
				row.TotalInvQty = totQty
			}
			row.SerialPolicy = NormalizeTrackingPolicy(row.SerialPolicy)
			row.LotPolicy = NormalizeTrackingPolicy(row.LotPolicy)
			out = append(out, row)
		}
		if out == nil {
			out = []itemSearchResult{}
		}
		response.OKList(w, out, f.Page, f.PageSize, total)
	}
}
