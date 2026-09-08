package inventory

import (
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/reports"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// Partner name for stock-movement slips (ECOUNT Inv. Book Customer/Vendor column).
const invBookSlipPartnerNameSQL = `coalesce(nullif(trim(
  case
    when p.ref_type in ('sales', 'sa_sales') and p.ref_id is not null then (
      select coalesce(pr.company_name, '')
      from public.sa_sales s
      join public.inv_partners pr on pr.id = s.partner_id
      where s.id = p.ref_id and s.tenant_id = p.tenant_id
      limit 1
    )
    when p.ref_type = 'sa_sales_line' and p.ref_id is not null then (
      select coalesce(pr.company_name, '')
      from public.sa_sales_lines ln
      join public.sa_sales s on s.id = ln.sales_id
      join public.inv_partners pr on pr.id = s.partner_id
      where ln.id = p.ref_id and s.tenant_id = p.tenant_id
      limit 1
    )
    when p.ref_type = 'goods_receipt' and p.ref_id is not null then (
      select coalesce(pr.company_name, '')
      from public.gr_goods_receipts gr
      join public.po_purchase_orders po on po.id = gr.purchase_order_id
      join public.inv_partners pr on pr.id = po.partner_id
      where gr.id = p.ref_id and gr.tenant_id = p.tenant_id
      limit 1
    )
    when p.ref_type in ('purchase_order', 'po_purchase_orders') and p.ref_id is not null then (
      select coalesce(pr.company_name, '')
      from public.po_purchase_orders po
      join public.inv_partners pr on pr.id = po.partner_id
      where po.id = p.ref_id and po.tenant_id = p.tenant_id
      limit 1
    )
    else ''
  end
), ''), '')`

const invBookSlipSerialLotSQL = `trim(both ', ' from concat_ws(', ',
  nullif((
    select string_agg(distinct su.serial_no, ', ' order by su.serial_no)
    from public.inv_serial_events se
    join public.inv_serial_units su on su.id = se.serial_unit_id
    where se.tenant_id = p.tenant_id
      and su.item_id = p.item_id
      and p.ref_id is not null
      and se.ref_type = p.ref_type
      and se.ref_id = p.ref_id
  ), ''),
  nullif((
    select string_agg(distinct lb.lot_no, ', ' order by lb.lot_no)
    from public.inv_lot_events le
    join public.inv_lot_batches lb on lb.id = le.lot_batch_id
    where le.tenant_id = p.tenant_id
      and lb.item_id = p.item_id
      and p.ref_id is not null
      and le.ref_type = p.ref_type
      and le.ref_id = p.ref_id
  ), '')
))`

type invBookSlipRow struct {
	ID           int64   `json:"id"`
	IsBeginning  bool    `json:"is_beginning"`
	CreatedAt    string  `json:"created_at"`
	PartnerName  string  `json:"partner_name"`
	Remark       string  `json:"remark"`
	IncreaseQty  float64 `json:"increase_qty"`
	ReleaseQty   float64 `json:"release_qty"`
	InventoryQty float64 `json:"inventory_qty"`
	SerialLotNos string  `json:"serial_lot_nos"`
	LocationName string  `json:"location_name"`
	LocationID   *int64  `json:"location_id,omitempty"`
	MovementType string  `json:"movement_type,omitempty"`
	RefType      string  `json:"ref_type,omitempty"`
	RefID        *int64  `json:"ref_id,omitempty"`
	ItemCode     string  `json:"item_code,omitempty"`
	ItemName     string  `json:"item_name,omitempty"`
}

func invBookSlipsSQL(tenantID, itemID int64, dateFrom, dateTo time.Time, locationID *int64) (string, []any) {
	args := []any{tenantID, itemID, dateFrom.Format("2006-01-02"), dateTo.Format("2006-01-02")}
	locFilter := ""
	if locationID != nil {
		locFilter = " and sm.location_id = $5"
		args = append(args, *locationID)
	}
	partition := "p.item_id"
	if locationID != nil {
		partition = "p.item_id, p.location_id"
	}
	q := fmt.Sprintf(`
		with period as (
		  select sm.id, sm.created_at, sm.tenant_id, sm.item_id, sm.location_id,
		    sm.qty_delta::float8 as qty_delta,
		    sm.movement_type, sm.ref_type, sm.ref_id,
		    coalesce(sm.reason, '') as remark
		  from public.inv_stock_movements sm
		  where sm.tenant_id = $1 and sm.item_id = $2
		    and sm.created_at >= $3::date
		    and sm.created_at < ($4::date + interval '1 day')
		    %s
		),
		opening as (
		  select coalesce(sum(sm.qty_delta), 0)::float8 as open_qty
		  from public.inv_stock_movements sm
		  where sm.tenant_id = $1 and sm.item_id = $2
		    and sm.created_at < $3::date
		    %s
		)
		select p.id, p.created_at::text,
		  (%s) as partner_name,
		  p.remark,
		  (case when p.qty_delta > 0 then p.qty_delta else 0 end)::float8 as increase_qty,
		  (case when p.qty_delta < 0 then -p.qty_delta else 0 end)::float8 as release_qty,
		  (coalesce((select open_qty from opening), 0) + sum(p.qty_delta) over (
		    partition by %s order by p.created_at, p.id
		    rows between unbounded preceding and current row
		  ))::float8 as inventory_qty,
		  coalesce((%s), '') as serial_lot_nos,
		  coalesce(l.location_name, '') as location_name,
		  p.location_id,
		  coalesce(p.movement_type, '') as movement_type,
		  coalesce(p.ref_type, '') as ref_type,
		  p.ref_id,
		  i.item_code, i.item_name
		from period p
		join public.inv_items i on i.id = p.item_id
		left join public.inv_locations l on l.id = p.location_id
	`, locFilter, locFilter, invBookSlipPartnerNameSQL, partition, invBookSlipSerialLotSQL)
	return q, args
}

func listInvBookSlips(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, ok := reports.ValidationDateRange(w, r)
		if !ok {
			return
		}
		if dateFrom == nil || dateTo == nil {
			response.Validation(w, map[string]string{
				"date_from": "Start date is required.",
				"date_to":   "End date is required.",
			})
			return
		}
		itemID, errID := parseOptionalItemID(r)
		if errID != nil || itemID == nil || *itemID <= 0 {
			response.Validation(w, map[string]string{"item_id": "Item ID is required."})
			return
		}
		locationID, _ := parseOptionalLocationID(r)
		p := httputil.ParseListParams(r, "created_at", map[string]string{"created_at": "created_at"})
		if p.Order == "" {
			p.Order = "asc"
		}
		offset := httputil.Offset(p)

		base, args := invBookSlipsSQL(tu.TenantID, *itemID, *dateFrom, *dateTo, locationID)
		countQ := fmt.Sprintf("select count(*) from (%s) sub", base)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count inv. book slips.", "ERR_INTERNAL")
			return
		}

		openArgs := []any{tu.TenantID, *itemID, dateFrom.Format("2006-01-02")}
		openSQL := `
			select coalesce(i.item_code,''), coalesce(i.item_name,''),
			  coalesce((
			    select sum(sm.qty_delta)::float8
			    from public.inv_stock_movements sm
			    where sm.tenant_id = $1 and sm.item_id = $2 and sm.created_at < $3::date`
		if locationID != nil {
			openSQL += ` and sm.location_id = $4`
			openArgs = append(openArgs, *locationID)
		}
		openSQL += `
			  ), 0)
			from public.inv_items i
			where i.id = $2 and i.tenant_id = $1`
		var openingQty float64
		var itemCode, itemName string
		if err := pool.QueryRow(r.Context(), openSQL, openArgs...).Scan(&itemCode, &itemName, &openingQty); err != nil {
			response.Err(w, http.StatusNotFound, "Item not found.", "ERR_NOT_FOUND")
			return
		}

		argsPage := append(append([]any{}, args...), p.PageSize, offset)
		q := fmt.Sprintf(
			`select id, created_at, partner_name, remark, increase_qty, release_qty, inventory_qty,
			  serial_lot_nos, location_name, location_id, movement_type, ref_type, ref_id, item_code, item_name
			 from (%s) sub order by created_at %s, id %s limit $%d offset $%d`,
			base, reports.OrderSQL(p.Order), reports.OrderSQL(p.Order), len(argsPage)-1, len(argsPage),
		)
		rows, err := pool.Query(r.Context(), q, argsPage...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load inv. book slips: "+err.Error(), "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		out := make([]invBookSlipRow, 0)
		if p.Page <= 1 {
			out = append(out, invBookSlipRow{
				ID:           0,
				IsBeginning:  true,
				CreatedAt:    dateFrom.Format("2006-01-02"),
				PartnerName:  "Beginning Inventory",
				InventoryQty: openingQty,
				ItemCode:     itemCode,
				ItemName:     itemName,
			})
		}
		for rows.Next() {
			var row invBookSlipRow
			var locID *int64
			var refID *int64
			if err := rows.Scan(
				&row.ID, &row.CreatedAt, &row.PartnerName, &row.Remark,
				&row.IncreaseQty, &row.ReleaseQty, &row.InventoryQty, &row.SerialLotNos,
				&row.LocationName, &locID, &row.MovementType, &row.RefType, &refID,
				&row.ItemCode, &row.ItemName,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read inv. book slip.", "ERR_INTERNAL")
				return
			}
			row.LocationID = locID
			row.RefID = refID
			out = append(out, row)
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}
