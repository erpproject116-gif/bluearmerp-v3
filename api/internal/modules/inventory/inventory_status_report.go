package inventory

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/reports"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// Inventory status values filter stock rows by computed condition.
const (
	invStatusAll          = ""
	invStatusInStock      = "in_stock"
	invStatusOutOfStock   = "out_of_stock"
	invStatusBelowSafety  = "below_safety"
	invStatusHasReserved  = "has_reserved"
	invStatusInactiveItem = "inactive_item"
)

type inventoryStatusRow struct {
	ItemID              int64    `json:"item_id"`
	ItemCode            string   `json:"item_code"`
	ItemName            string   `json:"item_name"`
	ItemStatus          string   `json:"item_status"`
	UnitCode            string   `json:"unit_code"`
	CategoryID          *int64   `json:"category_id,omitempty"`
	CategoryName        string   `json:"category_name"`
	LocationID          int64    `json:"location_id"`
	LocationName        string   `json:"location_name"`
	BranchName          string   `json:"branch_name"`
	QtyOnHand           float64  `json:"qty_on_hand"`
	QtyReserved         float64  `json:"qty_reserved"`
	AvailableQty        float64  `json:"available_qty"`
	SalesPrice          float64  `json:"sales_price"`
	CompanyAvailableQty float64  `json:"company_available_qty"`
	ReorderLevel        *float64 `json:"reorder_level,omitempty"`
	StockStatus         string   `json:"stock_status"`
	TrackSerial         bool     `json:"track_serial"`
	LastSoldAt          *string  `json:"last_sold_at,omitempty"`
	LastSoldBy          string   `json:"last_sold_by"`
	LastSoldRefType     string   `json:"last_sold_ref_type"`
	LastSoldRefID       *int64   `json:"last_sold_ref_id,omitempty"`
	LastMovementAt      *string  `json:"last_movement_at,omitempty"`
	LastMovementType    string   `json:"last_movement_type"`
}

func inventoryStatusSQL(tenantID int64, q, stockStatus string, categoryID, locationID *int64, inStockOnly bool) (string, []any) {
	args := []any{tenantID}
	argN := 2

	base := `
		select i.id as item_id, i.item_code, i.item_name, i.status as item_status,
		  coalesce(bu.code, coalesce(i.unit, '')) as unit_code,
		  i.item_category_id as category_id,
		  coalesce(c.name, coalesce(i.item_category, '')) as category_name,
		  l.id as location_id, l.location_name,
		  l.location_name as branch_name,
		  bal.qty_on_hand::float8,
		  bal.qty_reserved::float8,
		  (bal.qty_on_hand - bal.qty_reserved)::float8 as available_qty,
		  coalesce(i.sales_price, 0)::float8 as sales_price,
		  coalesce(co_bal.company_available_qty, 0)::float8 as company_available_qty,
		  i.reorder_level::float8 as reorder_level,
		  case
		    when i.status = 'inactive' then 'inactive_item'
		    when bal.qty_on_hand <= 0 then 'out_of_stock'
		    when i.reorder_level is not null and bal.qty_on_hand < i.reorder_level then 'below_safety'
		    when bal.qty_reserved > 0 then 'has_reserved'
		    else 'in_stock'
		  end as stock_status,
		  coalesce(i.track_serial, false) as track_serial,
		  last_sale.sold_at::text as last_sold_at,
		  coalesce(last_sale.sold_by, '') as last_sold_by,
		  coalesce(last_sale.ref_type, '') as last_sold_ref_type,
		  last_sale.ref_id as last_sold_ref_id,
		  last_mv.moved_at::text as last_movement_at,
		  coalesce(last_mv.movement_type, '') as last_movement_type
		from public.inv_item_location_balances bal
		join public.inv_items i on i.id = bal.item_id and i.tenant_id = bal.tenant_id and i.deleted_at is null
		join public.inv_locations l on l.id = bal.location_id and l.tenant_id = bal.tenant_id and l.deleted_at is null
		left join public.inv_units bu on bu.id = i.base_unit_id
		left join public.inv_item_categories c on c.id = i.item_category_id
		left join lateral (
		  select coalesce(sum(b.qty_on_hand - b.qty_reserved), 0) as company_available_qty
		  from public.inv_item_location_balances b
		  where b.tenant_id = bal.tenant_id and b.item_id = bal.item_id
		) co_bal on true
		left join lateral (
		  select sm.created_at as sold_at, coalesce(u.full_name, '') as sold_by,
		    case
		      when sm.ref_type = 'sa_sales_line' then 'sales'
		      else sm.ref_type
		    end as ref_type,
		    case
		      when sm.ref_type = 'sa_sales_line' then (
		        select ln.sales_id from public.sa_sales_lines ln where ln.id = sm.ref_id limit 1
		      )
		      else sm.ref_id
		    end as ref_id
		  from public.inv_stock_movements sm
		  left join public.users u on u.id = sm.created_by_user_id
		  where sm.tenant_id = bal.tenant_id
		    and sm.item_id = bal.item_id
		    and sm.location_id = bal.location_id
		    and sm.qty_delta < 0
		    and sm.movement_type in ('sales', 'issue', 'out', 'delivery')
		  order by sm.created_at desc, sm.id desc
		  limit 1
		) last_sale on true
		left join lateral (
		  select sm.created_at as moved_at, sm.movement_type
		  from public.inv_stock_movements sm
		  where sm.tenant_id = bal.tenant_id
		    and sm.item_id = bal.item_id
		    and sm.location_id = bal.location_id
		  order by sm.created_at desc, sm.id desc
		  limit 1
		) last_mv on true
		where bal.tenant_id = $1`

	where := ""
	if q != "" {
		where += fmt.Sprintf(" and (i.item_code ilike $%d or i.item_name ilike $%d or coalesce(c.name, '') ilike $%d)", argN, argN, argN)
		args = append(args, "%"+q+"%")
		argN++
	}
	if categoryID != nil {
		where += fmt.Sprintf(" and i.item_category_id = $%d", argN)
		args = append(args, *categoryID)
		argN++
	}
	if locationID != nil {
		where += fmt.Sprintf(" and l.id = $%d", argN)
		args = append(args, *locationID)
		argN++
	}

	outer := fmt.Sprintf("select * from (%s%s) sub where 1=1", base, where)
	switch stockStatus {
	case invStatusInStock, invStatusOutOfStock, invStatusBelowSafety, invStatusHasReserved, invStatusInactiveItem:
		outer += fmt.Sprintf(" and stock_status = $%d", argN)
		args = append(args, stockStatus)
		argN++
	}
	if inStockOnly {
		outer += " and available_qty > 0"
	}
	return outer, args
}

func parseInventoryStatusFilters(r *http.Request) (q, stockStatus string, categoryID, locationID *int64, inStockOnly bool, errs map[string]string) {
	q = strings.TrimSpace(r.URL.Query().Get("q"))
	stockStatus = strings.TrimSpace(r.URL.Query().Get("status"))
	switch stockStatus {
	case invStatusAll, invStatusInStock, invStatusOutOfStock, invStatusBelowSafety, invStatusHasReserved, invStatusInactiveItem:
	default:
		return "", "", nil, nil, false, map[string]string{"status": "Invalid stock status."}
	}
	if v := strings.TrimSpace(r.URL.Query().Get("category_id")); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil || n <= 0 {
			return "", "", nil, nil, false, map[string]string{"category_id": "Invalid category."}
		}
		categoryID = &n
	}
	if v := strings.TrimSpace(r.URL.Query().Get("location_id")); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil || n <= 0 {
			return "", "", nil, nil, false, map[string]string{"location_id": "Invalid branch/location."}
		}
		locationID = &n
	} else if v := strings.TrimSpace(r.URL.Query().Get("branch_id")); v != "" {
		// Branches are locations in this product; accept branch_id as an alias.
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil || n <= 0 {
			return "", "", nil, nil, false, map[string]string{"branch_id": "Invalid branch."}
		}
		locationID = &n
	}
	switch strings.ToLower(strings.TrimSpace(r.URL.Query().Get("in_stock_only"))) {
	case "1", "true", "yes":
		inStockOnly = true
	}
	return q, stockStatus, categoryID, locationID, inStockOnly, nil
}

func scanInventoryStatusRow(rows interface {
	Scan(dest ...any) error
}) (inventoryStatusRow, error) {
	var row inventoryStatusRow
	var reorder *float64
	err := rows.Scan(
		&row.ItemID, &row.ItemCode, &row.ItemName, &row.ItemStatus, &row.UnitCode,
		&row.CategoryID, &row.CategoryName,
		&row.LocationID, &row.LocationName, &row.BranchName,
		&row.QtyOnHand, &row.QtyReserved, &row.AvailableQty,
		&row.SalesPrice, &row.CompanyAvailableQty,
		&reorder, &row.StockStatus, &row.TrackSerial,
		&row.LastSoldAt, &row.LastSoldBy, &row.LastSoldRefType, &row.LastSoldRefID,
		&row.LastMovementAt, &row.LastMovementType,
	)
	row.ReorderLevel = reorder
	return row, err
}

func listInventoryStatusReport(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"item_code": "item_code", "qty_on_hand": "qty_on_hand", "stock_status": "stock_status",
		"category_name": "category_name", "location_name": "location_name", "last_sold_at": "last_sold_at",
		"available_qty": "available_qty", "sales_price": "sales_price", "company_available_qty": "company_available_qty",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		qFilter, stockStatus, categoryID, locationID, inStockOnly, errs := parseInventoryStatusFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		p := httputil.ParseListParams(r, "item_code", allowed)
		offset := httputil.Offset(p)
		base, args := inventoryStatusSQL(tu.TenantID, qFilter, stockStatus, categoryID, locationID, inStockOnly)
		countQ := fmt.Sprintf("select count(*) from (%s) c", base)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count inventory status.", "ERR_INTERNAL")
			return
		}
		args = append(args, p.PageSize, offset)
		qry := fmt.Sprintf("select * from (%s) sub order by %s %s limit $%d offset $%d",
			base, p.Sort, reports.OrderSQL(p.Order), len(args)-1, len(args))
		rows, err := pool.Query(r.Context(), qry, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load inventory status.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []inventoryStatusRow
		for rows.Next() {
			row, err := scanInventoryStatusRow(rows)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read inventory status.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []inventoryStatusRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func exportInventoryStatusReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		qFilter, stockStatus, categoryID, locationID, inStockOnly, errs := parseInventoryStatusFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		base, args := inventoryStatusSQL(tu.TenantID, qFilter, stockStatus, categoryID, locationID, inStockOnly)
		qry := fmt.Sprintf("select * from (%s) sub order by item_code asc limit %d", base, reports.ExportMaxRows)
		rows, err := pool.Query(r.Context(), qry, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export inventory status.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="find-stock.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{
			"Item Code", "Item Name", "Unit", "Item Status", "Category", "Branch/Location",
			"Qty On Hand", "Qty Reserved", "Available", "Sales Price", "Company Available",
			"Reorder Level", "Stock Status",
			"Last Sold At", "Last Sold By", "Last Sold Ref", "Last Movement At", "Last Movement Type",
		})
		for rows.Next() {
			row, err := scanInventoryStatusRow(rows)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to export inventory status.", "ERR_INTERNAL")
				return
			}
			reorder := ""
			if row.ReorderLevel != nil {
				reorder = fmt.Sprintf("%.4f", *row.ReorderLevel)
			}
			soldAt := ""
			if row.LastSoldAt != nil {
				soldAt = *row.LastSoldAt
			}
			soldRef := row.LastSoldRefType
			if row.LastSoldRefID != nil {
				soldRef = fmt.Sprintf("%s:%d", row.LastSoldRefType, *row.LastSoldRefID)
			}
			movedAt := ""
			if row.LastMovementAt != nil {
				movedAt = *row.LastMovementAt
			}
			_ = cw.Write([]string{
				row.ItemCode, row.ItemName, row.UnitCode, row.ItemStatus, row.CategoryName, row.BranchName,
				fmt.Sprintf("%.4f", row.QtyOnHand), fmt.Sprintf("%.4f", row.QtyReserved), fmt.Sprintf("%.4f", row.AvailableQty),
				fmt.Sprintf("%.4f", row.SalesPrice), fmt.Sprintf("%.4f", row.CompanyAvailableQty),
				reorder, row.StockStatus,
				soldAt, row.LastSoldBy, soldRef, movedAt, row.LastMovementType,
			})
		}
		cw.Flush()
	}
}
