package salesorder

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/inventory"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/approval"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/inventorygl"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type releaseQueueRow struct {
	SalesOrderID     int64   `json:"sales_order_id"`
	SalesOrderLineID int64   `json:"sales_order_line_id"`
	DateNoDisplay    string  `json:"date_no_display"`
	SalesOrderNo     string  `json:"sales_order_no"`
	ProgressStatus   string  `json:"progress_status"`
	CustomerName     string  `json:"customer_name"`
	LocationID       int64   `json:"location_id"`
	LocationName     string  `json:"location_name"`
	ItemID           *int64  `json:"item_id,omitempty"`
	ItemCode         string  `json:"item_code"`
	ItemName         string  `json:"item_name"`
	OrderQty         float64 `json:"order_qty"`
	ReleasedQty      float64 `json:"released_qty"`
	DeliveredQty     float64 `json:"delivered_qty"`
	RemainingQty     float64 `json:"remaining_qty"`
	BalanceQty       float64 `json:"balance_qty"`
	LocationStock    float64 `json:"location_stock"`
	TrackInventory   bool    `json:"track_inventory_qty"`
	TrackSerial      bool    `json:"track_serial"`
}

type releaseLineBody struct {
	SalesOrderLineID int64   `json:"sales_order_line_id"`
	ReleaseQty       float64 `json:"release_qty"`
	SerialUnitIDs    []int64 `json:"serial_unit_ids,omitempty"`
}

func listReleaseQueue(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		policy, err := processpolicy.Load(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load process policies.", "ERR_INTERNAL")
			return
		}
		splitRelease := !policy.LegacyCombinedSORelease
		p := httputil.ParseListParams(r, "order_date", map[string]string{
			"order_date":     "so.order_date",
			"sales_order_no": "so.sales_order_no",
			"customer_name":  "p.company_name",
			"item_code":      "ln.item_code",
			"balance_qty":    "(ln.qty - coalesce(rel.released, 0))",
		})
		offset := httputil.Offset(p)

		where := `so.tenant_id = $1 and so.deleted_at is null
			and so.progress_status in ('unconfirmed', 'e_approval', 'in_progress', 'completed')
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
			  coalesce(rel.released, 0)::float8,
			  coalesce(ln.delivered_qty, 0)::float8,
			  greatest(coalesce(rel.released, 0) - coalesce(ln.delivered_qty, 0), 0)::float8,
			  (ln.qty - coalesce(rel.released, 0))::float8,
			  coalesce(bal.qty_on_hand, 0)::float8,
			  coalesce(bal.qty_reserved, 0)::float8,
			  coalesce(i.track_inventory_qty, false),
			  coalesce(i.track_serial, false),
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
			var qtyOnHand, qtyReserved float64
			if err := rows.Scan(
				&row.SalesOrderID, &row.SalesOrderLineID, &orderDate, &dateSeq, &row.SalesOrderNo,
				&row.ProgressStatus, &row.CustomerName, &row.LocationID, &row.LocationName,
				&row.ItemID, &row.ItemCode, &row.ItemName,
				&row.OrderQty, &row.ReleasedQty, &row.DeliveredQty, &row.RemainingQty, &row.BalanceQty,
				&qtyOnHand, &qtyReserved, &row.TrackInventory, &row.TrackSerial, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read release queue.", "ERR_INTERNAL")
				return
			}
			if splitRelease {
				row.LocationStock = qtyOnHand - qtyReserved
			} else {
				row.LocationStock = qtyOnHand
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
		policy, err := processpolicy.Load(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load process policies.", "ERR_INTERNAL")
			return
		}
		legacyCombined := policy.LegacyCombinedSORelease

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
		soIDs := map[int64]struct{}{}
		soApprovalChecked := map[int64]bool{}
		var issueGLLines []inventorygl.Line
		var issueSourceID int64

		for i, item := range body.Lines {
			if item.SalesOrderLineID <= 0 {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].sales_order_line_id", i): "Invalid line."})
				return
			}
			if item.ReleaseQty <= 0 {
				response.ValidationSmart(w, map[string]string{fmt.Sprintf("lines[%d].release_qty", i): "Quantity must be greater than zero."})
				return
			}

			var tenantID, locationID int64
			var salesOrderID int64
			var itemID *int64
			var lineQty, released, lineQtyReserved float64
			var trackInventory, trackSerial bool
			var qtyOnHand, qtyReservedAtLoc float64

			err := tx.QueryRow(r.Context(), `
				select so.tenant_id, so.location_id, so.id, ln.item_id, ln.qty::float8,
				  coalesce(rel.released, 0)::float8,
				  coalesce(ln.qty_reserved, 0)::float8,
				  coalesce(i.track_inventory_qty, false),
				  coalesce(i.track_serial, false),
				  coalesce(bal.qty_on_hand, 0)::float8,
				  coalesce(bal.qty_reserved, 0)::float8
				from public.so_sales_order_lines ln
				join public.so_sales_orders so on so.id = ln.sales_order_id
				left join public.inv_items i on i.id = ln.item_id
				left join public.inv_item_location_balances bal
				  on bal.tenant_id = so.tenant_id and bal.item_id = ln.item_id and bal.location_id = so.location_id
				left join (
				  select sales_order_line_id, sum(release_qty) as released
				  from public.so_sales_order_release_lines
				  group by sales_order_line_id
				) rel on rel.sales_order_line_id = ln.id
				where ln.id = $1 and so.deleted_at is null`,
				item.SalesOrderLineID).Scan(&tenantID, &locationID, &salesOrderID, &itemID, &lineQty, &released, &lineQtyReserved, &trackInventory, &trackSerial, &qtyOnHand, &qtyReservedAtLoc)
			if err != nil {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].sales_order_line_id", i): "Line not found."})
				return
			}
			if tenantID != tu.TenantID {
				response.Err(w, http.StatusForbidden, "Forbidden.", "ERR_FORBIDDEN")
				return
			}

			if policy.SalesRequireSOApproval && !soApprovalChecked[salesOrderID] {
				status, found, err := approval.Status(r.Context(), tx, tu.TenantID, "sales_order", salesOrderID)
				if err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to check sales order approval.", "ERR_INTERNAL")
					return
				}
				if v := processpolicy.ValidateSalesOrderApproval(policy, found, status); v != nil {
					response.Validation(w, map[string]string{
						fmt.Sprintf("lines[%d].sales_order_line_id", i): v["sales_order_id"],
					})
					return
				}
				soApprovalChecked[salesOrderID] = true
			}

			balance := lineQty - released
			if item.ReleaseQty > balance+0.0001 {
				response.ValidationSmart(w, map[string]string{fmt.Sprintf("lines[%d].release_qty", i): fmt.Sprintf("Release qty is higher than what’s left to release (%.4f available). Lower the qty.", balance)})
				return
			}

			if trackInventory && itemID != nil {
				var completedWoQty float64
				if policy.SalesCountCompletedWoTowardRelease {
					_ = tx.QueryRow(r.Context(), `
						select coalesce(sum(qty_produced), 0)::float8
						from public.mfg_work_orders
						where source_sales_order_line_id = $1 and status = 'completed'`,
						item.SalesOrderLineID).Scan(&completedWoQty)
				}
				qtyOnHandForCheck := processpolicy.EffectiveReleaseOnHand(policy, qtyOnHand, qtyReservedAtLoc, completedWoQty)
				if v := processpolicy.ValidateSalesReleaseRequiresReservation(
					policy, legacyCombined, lineQtyReserved, released, item.ReleaseQty, qtyOnHandForCheck, qtyReservedAtLoc,
				); v != nil {
					for k, msg := range v {
						response.ValidationSmart(w, map[string]string{fmt.Sprintf("lines[%d].%s", i, k): msg})
						return
					}
				}
			}

			if trackSerial {
				if len(item.SerialUnitIDs) == 0 {
					response.ValidationSmart(w, map[string]string{fmt.Sprintf("lines[%d].serial_unit_ids", i): "Serial selection required for tracked items."})
					return
				}
				if float64(len(item.SerialUnitIDs)) != item.ReleaseQty {
					response.ValidationSmart(w, map[string]string{fmt.Sprintf("lines[%d].serial_unit_ids", i): "Serial count must match release quantity."})
					return
				}
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
				if legacyCombined {
					if err := inventory.DeductOnHandStock(r.Context(), tx, tenantID, *itemID, locationID, item.ReleaseQty); err != nil {
						response.ValidationSmart(w, map[string]string{fmt.Sprintf("lines[%d].release_qty", i): err.Error()})
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
					var unitCost float64
					_ = tx.QueryRow(r.Context(), `
						select coalesce(purchase_price, 0)::float8 from public.inv_items where id = $1`,
						*itemID).Scan(&unitCost)
					issueGLLines = append(issueGLLines, inventorygl.Line{
						ItemID:         *itemID,
						Qty:            item.ReleaseQty,
						UnitCost:       unitCost,
						TrackInventory: true,
					})
					if issueSourceID == 0 {
						issueSourceID = releaseLineID
					}
				}
				// Split mode: stock reserved on SO save; release line records fulfillment intent only.
			}

			if trackSerial && itemID != nil {
				for _, unitID := range item.SerialUnitIDs {
					var serialNo string
					err := tx.QueryRow(r.Context(), `
						select serial_no from public.inv_serial_units
						where id = $1 and tenant_id = $2 and item_id = $3 and location_id = $4
						  and status in ('in_stock', 'reserved')
						for update`, unitID, tenantID, *itemID, locationID).Scan(&serialNo)
					if err != nil {
						response.ValidationSmart(w, map[string]string{fmt.Sprintf("lines[%d].serial_unit_ids", i): fmt.Sprintf("Serial %d is not available at this location. Pick a serial that is in stock here.", unitID)})
						return
					}
					_, err = tx.Exec(r.Context(), `
						update public.inv_serial_units
						set status = 'reserved', sales_order_release_line_id = $1, reserved_at = now(), updated_at = now()
						where id = $2`, releaseLineID, unitID)
					if err != nil {
						response.Err(w, http.StatusInternalServerError, "Failed to reserve serial.", "ERR_INTERNAL")
						return
					}
					loc := locationID
					if err := inventory.InsertSerialEvent(r.Context(), tx, tenantID, unitID, "reserved", &loc, &loc, "so_release_line", releaseLineID, &tu.AppUserID); err != nil {
						response.Err(w, http.StatusInternalServerError, "Failed to record serial event.", "ERR_INTERNAL")
						return
					}
				}
			}

			releasedCount++
			soIDs[salesOrderID] = struct{}{}
		}

		if len(issueGLLines) > 0 && issueSourceID > 0 {
			if _, err := inventorygl.PostIssueTx(
				r.Context(), tx, tu.TenantID, tu.AppUserID, releaseDate,
				"so_release", issueSourceID, "SO release stock issue", issueGLLines,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to post inventory GL for release.", "ERR_INTERNAL")
				return
			}
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to release.", "ERR_INTERNAL")
			return
		}

		var salesOrderIDs []int64
		for id := range soIDs {
			salesOrderIDs = append(salesOrderIDs, id)
		}

		var auditTarget *int64
		if len(salesOrderIDs) == 1 {
			auditTarget = &salesOrderIDs[0]
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales_order.release", "so_sales_order", auditTarget, nil, map[string]any{
			"lines": body.Lines, "sales_order_ids": salesOrderIDs,
		})
		response.OK(w, map[string]any{"released_count": releasedCount, "sales_order_ids": salesOrderIDs}, "Released.")
	}
}

func undoRelease(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		policy, err := processpolicy.Load(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load process policies.", "ERR_INTERNAL")
			return
		}
		legacyCombined := policy.LegacyCombinedSORelease

		releaseLineID, err := strconv.ParseInt(chi.URLParam(r, "releaseLineId"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"releaseLineId": "Invalid release line id."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to undo release.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var tenantID, locationID, salesOrderLineID int64
		var releaseQty float64
		var itemID *int64
		var trackInventory, trackSerial bool

		err = tx.QueryRow(r.Context(), `
			select so.tenant_id, rl.location_id, rl.sales_order_line_id, rl.release_qty::float8,
			  ln.item_id,
			  coalesce(i.track_inventory_qty, false),
			  coalesce(i.track_serial, false)
			from public.so_sales_order_release_lines rl
			join public.so_sales_order_lines ln on ln.id = rl.sales_order_line_id
			join public.so_sales_orders so on so.id = ln.sales_order_id
			left join public.inv_items i on i.id = ln.item_id
			where rl.id = $1 and so.deleted_at is null
			for update of rl`, releaseLineID).Scan(
			&tenantID, &locationID, &salesOrderLineID, &releaseQty,
			&itemID, &trackInventory, &trackSerial)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Release line not found.", "ERR_NOT_FOUND")
			return
		}
		if tenantID != tu.TenantID {
			response.Err(w, http.StatusForbidden, "Forbidden.", "ERR_FORBIDDEN")
			return
		}

		var totalReleased, sold float64
		err = tx.QueryRow(r.Context(), `
			select coalesce(rel.released, 0)::float8, coalesce(slip.sold, 0)::float8
			from public.so_sales_order_lines ln
			left join (
			  select sales_order_line_id, sum(release_qty) as released
			  from public.so_sales_order_release_lines
			  group by sales_order_line_id
			) rel on rel.sales_order_line_id = ln.id
			left join (
			  select sales_order_line_id, sum(qty) as sold
			  from public.so_sales_order_slip_lines
			  group by sales_order_line_id
			) slip on slip.sales_order_line_id = ln.id
			where ln.id = $1`, salesOrderLineID).Scan(&totalReleased, &sold)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to evaluate release.", "ERR_INTERNAL")
			return
		}
		if sold > totalReleased-releaseQty+0.0001 {
			response.Validation(w, map[string]string{
				"releaseLineId": "Cannot undo: invoiced quantity exceeds remaining released balance.",
			})
			return
		}

		if trackSerial {
			var soldSerials int
			if err := tx.QueryRow(r.Context(), `
				select count(*) from public.inv_serial_units
				where sales_order_release_line_id = $1 and status = 'sold'`, releaseLineID).Scan(&soldSerials); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to check serials.", "ERR_INTERNAL")
				return
			}
			if soldSerials > 0 {
				response.Validation(w, map[string]string{
					"releaseLineId": "Cannot undo: serial units from this release have been sold.",
				})
				return
			}
		}

		if trackInventory && itemID != nil && releaseQty > 0 && legacyCombined {
			if err := inventory.RestoreOnHandStock(r.Context(), tx, tenantID, *itemID, locationID, releaseQty); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to restore stock.", "ERR_INTERNAL")
				return
			}
			_, err = tx.Exec(r.Context(), `
				insert into public.inv_stock_movements
				  (tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, created_by_user_id)
				values ($1, $2, $3, $4, 'so_release_undo', 'so_release_line', $5, $6)`,
				tenantID, *itemID, locationID, releaseQty, releaseLineID, tu.AppUserID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to record stock movement.", "ERR_INTERNAL")
				return
			}
		}

		if trackSerial {
			serialRows, err := tx.Query(r.Context(), `
				select id from public.inv_serial_units
				where sales_order_release_line_id = $1 and tenant_id = $2
				for update`, releaseLineID, tenantID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load serials.", "ERR_INTERNAL")
				return
			}
			defer serialRows.Close()
			loc := locationID
			for serialRows.Next() {
				var unitID int64
				if err := serialRows.Scan(&unitID); err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to read serial.", "ERR_INTERNAL")
					return
				}
				_, err = tx.Exec(r.Context(), `
					update public.inv_serial_units
					set status = 'in_stock', sales_order_release_line_id = null, reserved_at = null, updated_at = now()
					where id = $1`, unitID)
				if err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to restore serial.", "ERR_INTERNAL")
					return
				}
				if err := inventory.InsertSerialEvent(r.Context(), tx, tenantID, unitID, "released", &loc, &loc, "so_release_line", releaseLineID, &tu.AppUserID); err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to record serial event.", "ERR_INTERNAL")
					return
				}
			}
			if err := serialRows.Err(); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to process serials.", "ERR_INTERNAL")
				return
			}
		}

		tag, err := tx.Exec(r.Context(), `
			delete from public.so_sales_order_release_lines where id = $1`, releaseLineID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusInternalServerError, "Failed to remove release line.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to undo release.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales_order.release_undo", "so_release_line", &releaseLineID, nil, nil)
		response.OK(w, map[string]any{"release_line_id": releaseLineID}, "Release undone.")
	}
}

type recentReleaseRow struct {
	ReleaseLineID  int64   `json:"release_line_id"`
	SalesOrderNo   string  `json:"sales_order_no"`
	CustomerName   string  `json:"customer_name"`
	ItemCode       string  `json:"item_code"`
	ItemName       string  `json:"item_name"`
	ReleaseQty     float64 `json:"release_qty"`
	ReleaseDate    string  `json:"release_date"`
	CreatedAt      string  `json:"created_at"`
}

func listRecentReleases(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "created_at", map[string]string{
			"created_at":     "rl.created_at",
			"sales_order_no": "so.sales_order_no",
			"customer_name":  "p.company_name",
			"item_code":      "ln.item_code",
			"release_qty":    "rl.release_qty",
		})
		offset := httputil.Offset(p)

		q := fmt.Sprintf(`
			select rl.id, so.sales_order_no, p.company_name,
			  ln.item_code, ln.item_name, rl.release_qty::float8,
			  rl.release_date::text, rl.created_at::text,
			  count(*) over()
			from public.so_sales_order_release_lines rl
			join public.so_sales_order_lines ln on ln.id = rl.sales_order_line_id
			join public.so_sales_orders so on so.id = ln.sales_order_id
			join public.inv_partners p on p.id = so.partner_id
			where so.tenant_id = $1 and so.deleted_at is null
			order by rl.created_at desc
			limit $2 offset $3`)
		rows, err := pool.Query(r.Context(), q, tu.TenantID, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load recent releases.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []recentReleaseRow
		var total int64
		for rows.Next() {
			var row recentReleaseRow
			if err := rows.Scan(
				&row.ReleaseLineID, &row.SalesOrderNo, &row.CustomerName,
				&row.ItemCode, &row.ItemName, &row.ReleaseQty,
				&row.ReleaseDate, &row.CreatedAt, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read release.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []recentReleaseRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}
