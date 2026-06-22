package salesorder

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type releaseQueueRow struct {
	SalesOrderID    int64   `json:"sales_order_id"`
	SalesOrderLineID int64  `json:"sales_order_line_id"`
	DateNoDisplay   string  `json:"date_no_display"`
	SalesOrderNo    string  `json:"sales_order_no"`
	ProgressStatus  string  `json:"progress_status"`
	CustomerName    string  `json:"customer_name"`
	LocationID      int64   `json:"location_id"`
	LocationName    string  `json:"location_name"`
	ItemID          *int64  `json:"item_id,omitempty"`
	ItemCode        string  `json:"item_code"`
	ItemName        string  `json:"item_name"`
	OrderQty        float64 `json:"order_qty"`
	BalanceQty      float64 `json:"balance_qty"`
	LocationStock   float64 `json:"location_stock"`
	TrackInventory  bool    `json:"track_inventory_qty"`
}

type releaseLineBody struct {
	SalesOrderLineID int64   `json:"sales_order_line_id"`
	ReleaseQty       float64 `json:"release_qty"`
}

func listReleaseQueue(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "order_date", map[string]string{
			"order_date":     "so.order_date",
			"sales_order_no": "so.sales_order_no",
			"customer_name":  "p.company_name",
			"item_code":      "ln.item_code",
			"balance_qty":    "(ln.qty - coalesce(rel.released, 0))",
		})
		offset := httputil.Offset(p)

		where := `so.tenant_id = $1 and so.deleted_at is null
			and so.progress_status in ('in_progress', 'completed')
			and (ln.qty - coalesce(rel.released, 0)) > 0.0001`
		args := []any{tu.TenantID}
		argN := 2

		if p.Q != "" {
			where += fmt.Sprintf(` and (
				so.sales_order_no ilike $%d or p.company_name ilike $%d or
				ln.item_code ilike $%d or ln.item_name ilike $%d)`, argN, argN, argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}

		q := fmt.Sprintf(`
			select so.id, ln.id, so.order_date, so.date_seq, so.sales_order_no,
			  so.progress_status, p.company_name, so.location_id, l.location_name,
			  ln.item_id, ln.item_code, ln.item_name,
			  ln.qty::float8,
			  (ln.qty - coalesce(rel.released, 0))::float8,
			  coalesce(bal.qty_on_hand, 0)::float8,
			  coalesce(i.track_inventory_qty, false),
			  count(*) over()
			from public.so_sales_orders so
			join public.inv_partners p on p.id = so.partner_id
			join public.inv_locations l on l.id = so.location_id
			join public.so_sales_order_lines ln on ln.sales_order_id = so.id
			left join (
			  select sales_order_line_id, sum(release_qty) as released
			  from public.so_sales_order_release_lines
			  group by sales_order_line_id
			) rel on rel.sales_order_line_id = ln.id
			left join public.inv_items i on i.id = ln.item_id
			left join public.inv_item_location_balances bal
			  on bal.tenant_id = so.tenant_id and bal.item_id = ln.item_id and bal.location_id = so.location_id
			where %s
			order by so.order_date desc, ln.line_no asc
			limit $%d offset $%d`, where, argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load release queue.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []releaseQueueRow
		var total int64
		for rows.Next() {
			var row releaseQueueRow
			var orderDate time.Time
			var dateSeq int
			if err := rows.Scan(
				&row.SalesOrderID, &row.SalesOrderLineID, &orderDate, &dateSeq, &row.SalesOrderNo,
				&row.ProgressStatus, &row.CustomerName, &row.LocationID, &row.LocationName,
				&row.ItemID, &row.ItemCode, &row.ItemName,
				&row.OrderQty, &row.BalanceQty, &row.LocationStock, &row.TrackInventory, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read release queue.", "ERR_INTERNAL")
				return
			}
			row.DateNoDisplay = formatDateNoDisplay(orderDate, dateSeq)
			out = append(out, row)
		}
		if out == nil {
			out = []releaseQueueRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func postReleases(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body struct {
			Lines []releaseLineBody `json:"lines"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.Lines) == 0 {
			response.Validation(w, map[string]string{"lines": "At least one release line is required."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to release.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		releaseDate := time.Now()
		var releasedCount int

		for i, item := range body.Lines {
			if item.SalesOrderLineID <= 0 {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].sales_order_line_id", i): "Invalid line."})
				return
			}
			if item.ReleaseQty <= 0 {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].release_qty", i): "Quantity must be greater than zero."})
				return
			}

			var tenantID, locationID int64
			var itemID *int64
			var lineQty, released float64
			var trackInventory bool

			err := tx.QueryRow(r.Context(), `
				select so.tenant_id, so.location_id, ln.item_id, ln.qty::float8,
				  coalesce(rel.released, 0)::float8,
				  coalesce(i.track_inventory_qty, false)
				from public.so_sales_order_lines ln
				join public.so_sales_orders so on so.id = ln.sales_order_id
				left join public.inv_items i on i.id = ln.item_id
				left join (
				  select sales_order_line_id, sum(release_qty) as released
				  from public.so_sales_order_release_lines
				  group by sales_order_line_id
				) rel on rel.sales_order_line_id = ln.id
				where ln.id = $1 and so.deleted_at is null`,
				item.SalesOrderLineID).Scan(&tenantID, &locationID, &itemID, &lineQty, &released, &trackInventory)
			if err != nil {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].sales_order_line_id", i): "Line not found."})
				return
			}
			if tenantID != tu.TenantID {
				response.Err(w, http.StatusForbidden, "Forbidden.", "ERR_FORBIDDEN")
				return
			}

			balance := lineQty - released
			if item.ReleaseQty > balance+0.0001 {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].release_qty", i): fmt.Sprintf("Exceeds balance (%.4f available).", balance)})
				return
			}

			var releaseLineID int64
			err = tx.QueryRow(r.Context(), `
				insert into public.so_sales_order_release_lines
				  (sales_order_line_id, location_id, release_date, release_qty, created_by_user_id)
				values ($1, $2, $3::date, $4, $5)
				returning id`,
				item.SalesOrderLineID, locationID, releaseDate, item.ReleaseQty, tu.AppUserID).Scan(&releaseLineID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to record release.", "ERR_INTERNAL")
				return
			}

			if trackInventory && itemID != nil {
				var qtyOnHand float64
				err := tx.QueryRow(r.Context(), `
					select qty_on_hand::float8
					from public.inv_item_location_balances
					where tenant_id = $1 and item_id = $2 and location_id = $3
					for update`,
					tenantID, *itemID, locationID).Scan(&qtyOnHand)
				if err != nil {
					response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].release_qty", i): "Insufficient stock at location (no balance record)."})
					return
				}
				if qtyOnHand+0.0001 < item.ReleaseQty {
					response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].release_qty", i): fmt.Sprintf("Insufficient stock (%.4f on hand).", qtyOnHand)})
					return
				}
				tag, err := tx.Exec(r.Context(), `
					update public.inv_item_location_balances
					set qty_on_hand = qty_on_hand - $1, updated_at = now()
					where tenant_id = $2 and item_id = $3 and location_id = $4`,
					item.ReleaseQty, tenantID, *itemID, locationID)
				if err != nil || tag.RowsAffected() == 0 {
					response.Err(w, http.StatusInternalServerError, "Failed to update stock.", "ERR_INTERNAL")
					return
				}
				_, err = tx.Exec(r.Context(), `
					insert into public.inv_stock_movements
					  (tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, created_by_user_id)
					values ($1, $2, $3, $4, 'so_release', 'so_release_line', $5, $6)`,
					tenantID, *itemID, locationID, -item.ReleaseQty, releaseLineID, tu.AppUserID)
				if err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to record stock movement.", "ERR_INTERNAL")
					return
				}
			}

			releasedCount++
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to release.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales_order.release", "so_sales_order", nil, nil, body)
		response.OK(w, map[string]any{"released_count": releasedCount}, "Released.")
	}
}
