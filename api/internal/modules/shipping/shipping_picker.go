package shipping

import (
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth/datascope"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/openlines"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type openShippingSlipLine struct {
	ShippingOrderID      int64   `json:"shipping_order_id"`
	ShippingNo           string  `json:"shipping_no"`
	ShippingDate         string  `json:"shipping_date"`
	Status               string  `json:"status"`
	SalesOrderID         int64   `json:"sales_order_id"`
	SalesOrderLineID     int64   `json:"sales_order_line_id"`
	DateNoDisplay        string  `json:"date_no_display"`
	SalesOrderNo         string  `json:"sales_order_no"`
	SalesOrderStatus     string  `json:"sales_order_status"`
	CustomerName         string  `json:"customer_name"`
	LocationID           int64   `json:"location_id"`
	LocationName         string  `json:"location_name"`
	PartnerID            int64   `json:"partner_id"`
	TaxTypeID            int64   `json:"tax_type_id"`
	CurrencyID           int64   `json:"currency_id"`
	PicName              string  `json:"pic_name"`
	ItemID               *int64  `json:"item_id,omitempty"`
	ItemCode             string  `json:"item_code"`
	ItemName             string  `json:"item_name"`
	Description          *string `json:"description,omitempty"`
	BalanceQty           float64 `json:"balance_qty"`
	UnitVatInc           float64 `json:"unit_vat_inc"`
	Remark               *string `json:"remark,omitempty"`
	TrackSerial          bool    `json:"track_serial,omitempty"`
}

func listOpenShippingSlipLines(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())

		p := httputil.ParseListParams(r, "shipping_date", map[string]string{
			"shipping_date":  "sh.shipping_date",
			"shipping_no":    "sh.shipping_no",
			"sales_order_no": "so.sales_order_no",
			"customer_name":  "p.company_name",
			"item_code":      "ln.item_code",
		})
		pageSize := openlines.PageSize(r, p.PageSize)
		offset := (p.Page - 1) * pageSize

		// Load Slip lists shipping-linked SO residual without requiring DR first.
		// Cap by shipping line qty vs ordered residual (release for serial is enforced on Save).
		balanceExpr := `greatest(0, case when coalesce(i.track_serial, false)
			then coalesce(rel.released, 0) - coalesce(slip.sold, 0)
			else ln.qty - coalesce(slip.sold, 0) end)`
		shippingBalance := fmt.Sprintf(`greatest(0, least(shl.qty::float8, (%s)::float8))`, balanceExpr)

		where := `sh.tenant_id = $1 and sh.sales_order_id is not null
			and coalesce(sh.status, 'draft') not in ('cancelled')
			and so.deleted_at is null`
		where += fmt.Sprintf(` and (%s) > 0.0001`, shippingBalance)

		args := []any{tu.TenantID}
		argN := 2

		if p.Q != "" {
			where += fmt.Sprintf(` and (
				sh.shipping_no ilike $%d or so.sales_order_no ilike $%d or p.company_name ilike $%d or
				coalesce(p.partner_code, '') ilike $%d or
				ln.item_code ilike $%d or ln.item_name ilike $%d)`, argN, argN, argN, argN, argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}
		if pid, ok := optionalInt64Query(r, "partner_id"); ok {
			where += fmt.Sprintf(" and so.partner_id = $%d", argN)
			args = append(args, *pid)
			argN++
		}

		dsScope, argN, err := datascope.ApplyUserScopesSQL(r.Context(), pool, tu, datascope.ListFilter{
			CustomerColumn: "so.partner_id",
			LocationColumn: "so.location_id",
		}, argN, &args)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to apply data scopes.", "ERR_INTERNAL")
			return
		}
		where += dsScope

		q := fmt.Sprintf(`
			select distinct on (sh.id, ln.id)
			  sh.id, sh.shipping_no, sh.shipping_date, coalesce(sh.status, 'draft'), so.id, ln.id,
			  so.order_date, so.date_seq, so.sales_order_no, so.progress_status,
			  p.company_name, so.location_id, l.location_name, so.partner_id,
			  so.tax_type_id, so.currency_id, so.pic_name,
			  ln.item_id, ln.item_code, ln.item_name, ln.description,
			  (%s)::float8,
			  ln.unit_vat_inc::float8, ln.remark,
			  coalesce(i.track_serial, false),
			  count(*) over()
			from public.sh_shipping_orders sh
			join public.sh_shipping_order_lines shl on shl.shipping_order_id = sh.id
			join public.so_sales_orders so on so.id = sh.sales_order_id
			join public.inv_partners p on p.id = so.partner_id
			join public.inv_locations l on l.id = so.location_id
			join public.so_sales_order_lines ln on ln.id = shl.sales_order_line_id
			left join public.inv_items i on i.id = ln.item_id
			left join (
			  select sales_order_line_id, sum(release_qty) as released
			  from public.so_sales_order_release_lines
			  group by sales_order_line_id
			) rel on rel.sales_order_line_id = ln.id
			left join (
			  select sales_order_line_id, sum(qty) as sold
			  from public.so_sales_order_slip_lines
			  where slip_type = 'sales'
			  group by sales_order_line_id
			) slip on slip.sales_order_line_id = ln.id
			where %s
			order by sh.id, ln.id, sh.shipping_date desc
			limit $%d offset $%d`, shippingBalance, where, argN, argN+1)
		args = append(args, pageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list shipping slip lines.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		out := []openShippingSlipLine{}
		var total int64
		for rows.Next() {
			var row openShippingSlipLine
			var shipDate, orderDate time.Time
			var dateSeq int
			if err := rows.Scan(
				&row.ShippingOrderID, &row.ShippingNo, &shipDate, &row.Status, &row.SalesOrderID, &row.SalesOrderLineID,
				&orderDate, &dateSeq, &row.SalesOrderNo, &row.SalesOrderStatus,
				&row.CustomerName, &row.LocationID, &row.LocationName, &row.PartnerID,
				&row.TaxTypeID, &row.CurrencyID, &row.PicName,
				&row.ItemID, &row.ItemCode, &row.ItemName, &row.Description,
				&row.BalanceQty, &row.UnitVatInc, &row.Remark, &row.TrackSerial, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read shipping slip lines.", "ERR_INTERNAL")
				return
			}
			row.ShippingDate = shipDate.Format("2006-01-02")
			row.DateNoDisplay = formatDateNoDisplay(orderDate, dateSeq)
			out = append(out, row)
		}
		response.OKList(w, out, p.Page, pageSize, total)
	}
}

func optionalInt64Query(r *http.Request, key string) (*int64, bool) {
	v := r.URL.Query().Get(key)
	if v == "" {
		return nil, false
	}
	var n int64
	if _, err := fmt.Sscan(v, &n); err != nil || n <= 0 {
		return nil, false
	}
	return &n, true
}
