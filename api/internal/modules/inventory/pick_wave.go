package inventory

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type PickWaveLine struct {
	SalesOrderID   int64   `json:"sales_order_id"`
	SalesOrderNo   string  `json:"sales_order_no"`
	DeliveryDate   string  `json:"delivery_date"`
	PartnerName    string  `json:"partner_name"`
	LocationID     int64   `json:"location_id"`
	LocationName   string  `json:"location_name"`
	LineID         int64   `json:"line_id"`
	LineNo         int     `json:"line_no"`
	ItemID         int64   `json:"item_id"`
	ItemCode       string  `json:"item_code"`
	ItemName       string  `json:"item_name"`
	Qty            float64 `json:"qty"`
	TrackLot       bool    `json:"track_lot"`
	CatchWeight    bool    `json:"catch_weight"`
}

func registerPickWaveRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/pick-waves", listPickWaveByDeliveryDate(pool))
}

func listPickWaveByDeliveryDate(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateStr := strings.TrimSpace(r.URL.Query().Get("delivery_date"))
		if dateStr == "" {
			response.Validation(w, map[string]string{"delivery_date": "Delivery date is required (YYYY-MM-DD)."})
			return
		}
		deliveryDate, err := parseDate(dateStr)
		if err != nil {
			response.Validation(w, map[string]string{"delivery_date": "Invalid date. Use YYYY-MM-DD."})
			return
		}

		where := `so.tenant_id = $1 and so.delivery_date = $2::date
			and so.status in ('draft', 'confirmed', 'partially_shipped')
			and so.progress_status in ('unconfirmed', 'e_approval', 'in_progress')`
		args := []any{tu.TenantID, deliveryDate.Format("2006-01-02")}
		argN := 3

		if id, ok := optionalInt64Query(r, "location_id"); ok {
			where += fmt.Sprintf(" and so.location_id = $%d", argN)
			args = append(args, *id)
			argN++
		}

		q := fmt.Sprintf(`
			select so.id, so.sales_order_no, so.delivery_date::text,
			  coalesce(p.company_name, ''), so.location_id, coalesce(loc.location_name, ''),
			  sol.id, sol.line_no, coalesce(sol.item_id, 0),
			  coalesce(i.item_code, sol.item_code, ''), coalesce(i.item_name, sol.item_name, ''),
			  sol.qty::float8,
			  coalesce(i.track_lot, false), coalesce(i.catch_weight, false)
			from public.so_sales_orders so
			join public.so_sales_order_lines sol on sol.sales_order_id = so.id
			left join public.inv_partners p on p.id = so.partner_id
			left join public.inv_locations loc on loc.id = so.location_id
			left join public.inv_items i on i.id = sol.item_id
			where %s
			order by so.sales_order_no, sol.line_no`, where)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load pick wave.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []PickWaveLine
		for rows.Next() {
			var row PickWaveLine
			if err := rows.Scan(
				&row.SalesOrderID, &row.SalesOrderNo, &row.DeliveryDate,
				&row.PartnerName, &row.LocationID, &row.LocationName,
				&row.LineID, &row.LineNo, &row.ItemID,
				&row.ItemCode, &row.ItemName, &row.Qty,
				&row.TrackLot, &row.CatchWeight,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read pick wave.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []PickWaveLine{}
		}
		response.OK(w, map[string]any{
			"delivery_date": deliveryDate.Format("2006-01-02"),
			"lines":         out,
		}, "OK")
	}
}
