package deliveryreceipt

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/inventory"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth/datascope"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/fulfillment"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type DeliveryReceiptLine struct {
	ID                        int64   `json:"id,omitempty"`
	LineNo                    int     `json:"line_no"`
	SalesOrderLineID          int64   `json:"sales_order_line_id"`
	SalesOrderReleaseLineID   *int64  `json:"sales_order_release_line_id,omitempty"`
	ItemID                    *int64  `json:"item_id,omitempty"`
	ItemCode                  string  `json:"item_code"`
	ItemName                  string  `json:"item_name"`
	Qty                       float64 `json:"qty"`
}

type DeliveryReceipt struct {
	ID              int64                 `json:"id"`
	DeliveryDate    string                `json:"delivery_date"`
	DateSeq         int                   `json:"date_seq"`
	DateNoDisplay   string                `json:"date_no_display"`
	DeliveryNo      string                `json:"delivery_no"`
	SalesOrderID    *int64                `json:"sales_order_id,omitempty"`
	SalesOrderNo    string                `json:"sales_order_no,omitempty"`
	PartnerID       int64                 `json:"partner_id"`
	PartnerName     string                `json:"partner_name"`
	LocationID      int64                 `json:"location_id"`
	LocationName    string                `json:"location_name,omitempty"`
	Status          string                `json:"status"`
	Notes           *string               `json:"notes,omitempty"`
	Lines           []DeliveryReceiptLine `json:"lines,omitempty"`
}

type openDeliveryLineRow struct {
	SalesOrderID              int64   `json:"sales_order_id"`
	SalesOrderLineID          int64   `json:"sales_order_line_id"`
	SalesOrderReleaseLineID   *int64  `json:"sales_order_release_line_id,omitempty"`
	DateNoDisplay             string  `json:"date_no_display"`
	SalesOrderNo              string  `json:"sales_order_no"`
	CustomerName              string  `json:"customer_name"`
	ItemCode                  string  `json:"item_code"`
	ItemName                  string  `json:"item_name"`
	ReleasedQty               float64 `json:"released_qty"`
	DeliveredQty              float64 `json:"delivered_qty"`
	BalanceQty                float64 `json:"balance_qty"`
}

type createLineBody struct {
	SalesOrderLineID        int64   `json:"sales_order_line_id"`
	SalesOrderReleaseLineID *int64  `json:"sales_order_release_line_id"`
	Qty                     float64 `json:"qty"`
}

func previewDeliveryReceiptSequences(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateStr := strings.TrimSpace(r.URL.Query().Get("delivery_date"))
		if dateStr == "" {
			dateStr = time.Now().Format("2006-01-02")
		}
		deliveryDate, err := parseDate(dateStr)
		if err != nil {
			response.Validation(w, map[string]string{"delivery_date": "Invalid date."})
			return
		}
		var dateSeq int
		var deliveryNo string
		if err := pool.QueryRow(r.Context(),
			`select date_seq, delivery_no from public.preview_dr_delivery_receipt_sequences($1, $2::date)`,
			tu.TenantID, deliveryDate).Scan(&dateSeq, &deliveryNo); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to preview sequences.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{
			"date_seq":        dateSeq,
			"delivery_no":     deliveryNo,
			"date_no_display": formatDateNoDisplay(deliveryDate, dateSeq),
		}, "OK")
	}
}

func listOpenDeliveryLines(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "order_date", map[string]string{
			"sales_order_no": "so.sales_order_no",
			"customer_name": "p.company_name",
		})
		offset := httputil.Offset(p)

		q := fmt.Sprintf(`
			select so.id, ln.id, rl.id, so.order_date, so.date_seq, so.sales_order_no, p.company_name,
			  ln.item_code, ln.item_name,
			  coalesce(rl.release_qty, rel.total_released)::float8,
			  coalesce(dr.delivered, 0)::float8,
			  (coalesce(rl.release_qty, rel.total_released) - coalesce(dr.delivered, 0))::float8,
			  count(*) over()
			from public.so_sales_orders so
			join public.inv_partners p on p.id = so.partner_id
			join public.so_sales_order_lines ln on ln.sales_order_id = so.id
			left join (
			  select sales_order_line_id, sum(release_qty) as total_released
			  from public.so_sales_order_release_lines
			  group by sales_order_line_id
			) rel on rel.sales_order_line_id = ln.id
			left join public.so_sales_order_release_lines rl on rl.sales_order_line_id = ln.id
			left join (
			  select sales_order_line_id, sum(qty) as delivered
			  from public.so_sales_order_slip_lines
			  where slip_type = 'delivery_receipt'
			  group by sales_order_line_id
			) dr on dr.sales_order_line_id = ln.id
			where so.tenant_id = $1 and so.deleted_at is null
			  and coalesce(rel.total_released, 0) > 0.0001
			  and (coalesce(rel.total_released, 0) - coalesce(dr.delivered, 0)) > 0.0001
			order by so.order_date desc, ln.line_no asc, rl.id asc nulls last
			limit $2 offset $3`)
		rows, err := pool.Query(r.Context(), q, tu.TenantID, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load open lines.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []openDeliveryLineRow
		var total int64
		for rows.Next() {
			var row openDeliveryLineRow
			var orderDate time.Time
			var dateSeq int
			var releaseLineID *int64
			if err := rows.Scan(
				&row.SalesOrderID, &row.SalesOrderLineID, &releaseLineID, &orderDate, &dateSeq, &row.SalesOrderNo, &row.CustomerName,
				&row.ItemCode, &row.ItemName, &row.ReleasedQty, &row.DeliveredQty, &row.BalanceQty, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read open lines.", "ERR_INTERNAL")
				return
			}
			row.SalesOrderReleaseLineID = releaseLineID
			row.DateNoDisplay = formatDateNoDisplay(orderDate, dateSeq)
			out = append(out, row)
		}
		if out == nil {
			out = []openDeliveryLineRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func listDeliveryReceipts(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "delivery_date", map[string]string{
			"delivery_date": "dr.delivery_date",
			"delivery_no":   "dr.delivery_no",
			"status":          "dr.status",
		})
		offset := httputil.Offset(p)
		where := `dr.tenant_id = $1 and dr.deleted_at is null`
		args := []any{tu.TenantID}
		argN := 2
		if p.Q != "" {
			where += fmt.Sprintf(` and (dr.delivery_no ilike $%d or p.company_name ilike $%d)`, argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}
		if status := strings.TrimSpace(r.URL.Query().Get("status")); status != "" {
			where += fmt.Sprintf(` and dr.status = $%d`, argN)
			args = append(args, status)
			argN++
		}
		dsScope, argN, err := datascope.ApplyUserScopesSQL(r.Context(), pool, tu, datascope.ListFilter{
			CustomerColumn: "dr.partner_id",
			LocationColumn: "dr.location_id",
		}, argN, &args)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to apply data scopes.", "ERR_INTERNAL")
			return
		}
		where += dsScope
		q := fmt.Sprintf(`
			select dr.id, dr.delivery_date, dr.date_seq, dr.delivery_no, dr.status,
			  p.company_name, so.sales_order_no, count(*) over()
			from public.dr_delivery_receipts dr
			join public.inv_partners p on p.id = dr.partner_id
			left join public.so_sales_orders so on so.id = dr.sales_order_id
			where %s
			order by dr.delivery_date desc, dr.date_seq desc
			limit $%d offset $%d`, where, argN, argN+1)
		args = append(args, p.PageSize, offset)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list delivery receipts.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		type listRow struct {
			ID            int64  `json:"id"`
			DateNoDisplay string `json:"date_no_display"`
			DeliveryNo    string `json:"delivery_no"`
			Status        string `json:"status"`
			PartnerName   string `json:"partner_name"`
			SalesOrderNo  string `json:"sales_order_no,omitempty"`
		}
		var out []listRow
		var total int64
		for rows.Next() {
			var row listRow
			var deliveryDate time.Time
			var dateSeq int
			var soNo *string
			if err := rows.Scan(&row.ID, &deliveryDate, &dateSeq, &row.DeliveryNo, &row.Status, &row.PartnerName, &soNo, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read list.", "ERR_INTERNAL")
				return
			}
			row.DateNoDisplay = formatDateNoDisplay(deliveryDate, dateSeq)
			if soNo != nil {
				row.SalesOrderNo = *soNo
			}
			out = append(out, row)
		}
		if out == nil {
			out = []listRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getDeliveryReceipt(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		dr, err := loadDeliveryReceipt(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Delivery receipt not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, dr, "OK")
	}
}

func createDeliveryReceipt(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body struct {
			DeliveryDate string           `json:"delivery_date"`
			SalesOrderID *int64           `json:"sales_order_id"`
			Notes        *string          `json:"notes"`
			Lines        []createLineBody `json:"lines"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.Lines) == 0 {
			response.Validation(w, map[string]string{"lines": "At least one line is required."})
			return
		}
		deliveryDate := time.Now()
		if strings.TrimSpace(body.DeliveryDate) != "" {
			var err error
			deliveryDate, err = parseDate(body.DeliveryDate)
			if err != nil {
				response.Validation(w, map[string]string{"delivery_date": "Invalid date."})
				return
			}
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var partnerID, locationID int64
		var salesOrderID *int64
		if body.SalesOrderID != nil && *body.SalesOrderID > 0 {
			salesOrderID = body.SalesOrderID
			if err := tx.QueryRow(r.Context(), `
				select partner_id, location_id from public.so_sales_orders
				where id = $1 and tenant_id = $2 and deleted_at is null`,
				*body.SalesOrderID, tu.TenantID).Scan(&partnerID, &locationID); err != nil {
				response.Validation(w, map[string]string{"sales_order_id": "Sales order not found."})
				return
			}
		} else {
			var soid int64
			if err := tx.QueryRow(r.Context(), `
				select so.partner_id, so.location_id, so.id
				from public.so_sales_order_lines ln
				join public.so_sales_orders so on so.id = ln.sales_order_id
				where ln.id = $1 and so.tenant_id = $2 and so.deleted_at is null`,
				body.Lines[0].SalesOrderLineID).Scan(&partnerID, &locationID, &soid); err != nil {
				response.Validation(w, map[string]string{"lines": "Sales order line not found."})
				return
			}
			salesOrderID = &soid
		}

		var dateSeq int
		var deliveryNo string
		if err := tx.QueryRow(r.Context(),
			`select date_seq, delivery_no from public.allocate_dr_delivery_receipt_sequences($1, $2::date)`,
			tu.TenantID, deliveryDate).Scan(&dateSeq, &deliveryNo); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to allocate sequences.", "ERR_INTERNAL")
			return
		}

		var drID int64
		err = tx.QueryRow(r.Context(), `
			insert into public.dr_delivery_receipts (
			  tenant_id, delivery_date, date_seq, delivery_no, sales_order_id,
			  partner_id, location_id, status, notes, created_by_user_id
			) values ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, $9)
			returning id`,
			tu.TenantID, deliveryDate, dateSeq, deliveryNo, salesOrderID,
			partnerID, locationID, body.Notes, tu.AppUserID).Scan(&drID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create header.", "ERR_INTERNAL")
			return
		}

		for i, ln := range body.Lines {
			if ln.Qty <= 0 {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].qty", i): "Quantity must be greater than zero."})
				return
			}
			balance, err := undeliveredBalance(r.Context(), tx, tu.TenantID, ln.SalesOrderLineID)
			if err != nil {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].sales_order_line_id", i): "Line not found."})
				return
			}
			if ln.Qty > balance+0.0001 {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].qty", i): fmt.Sprintf("Exceeds undelivered balance (%.4f).", balance)})
				return
			}
			var itemID *int64
			var itemCode, itemName string
			if err := tx.QueryRow(r.Context(), `
				select item_id, item_code, item_name from public.so_sales_order_lines where id = $1`,
				ln.SalesOrderLineID).Scan(&itemID, &itemCode, &itemName); err != nil {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].sales_order_line_id", i): "Line not found."})
				return
			}
			_, err = tx.Exec(r.Context(), `
				insert into public.dr_delivery_receipt_lines (
				  delivery_receipt_id, sales_order_line_id, sales_order_release_line_id,
				  line_no, item_id, item_code, item_name, qty
				) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
				drID, ln.SalesOrderLineID, ln.SalesOrderReleaseLineID, i+1, itemID, itemCode, itemName, ln.Qty)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to save line.", "ERR_INTERNAL")
				return
			}
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "delivery_receipt.create", "dr_delivery_receipt", &drID, nil, body)
		dr, _ := loadDeliveryReceipt(r.Context(), pool, tu.TenantID, drID)
		response.OK(w, dr, "Created.")
	}
}

func postDeliveryReceipt(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		policy, err := processpolicy.Load(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load process policies.", "ERR_INTERNAL")
			return
		}
		splitMode := !policy.LegacyCombinedSORelease

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to post.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var tenantID, locationID int64
		var status, deliveryNo string
		var dateSeq int
		var deliveryDate time.Time
		err = tx.QueryRow(r.Context(), `
			select tenant_id, location_id, status, delivery_no, date_seq, delivery_date
			from public.dr_delivery_receipts
			where id = $1 and deleted_at is null for update`, id).Scan(
			&tenantID, &locationID, &status, &deliveryNo, &dateSeq, &deliveryDate)
		if err != nil || tenantID != tu.TenantID {
			response.Err(w, http.StatusNotFound, "Delivery receipt not found.", "ERR_NOT_FOUND")
			return
		}
		if status != "draft" {
			response.Validation(w, map[string]string{"status": "Only draft delivery receipts can be posted."})
			return
		}

		lines, err := loadDeliveryReceiptLines(r.Context(), pool, id)
		if err != nil || len(lines) == 0 {
			response.Validation(w, map[string]string{"lines": "Delivery receipt has no lines."})
			return
		}

		dateNoDisplay := formatDateNoDisplay(deliveryDate, dateSeq)
		for i, ln := range lines {
			balance, err := undeliveredBalance(r.Context(), tx, tenantID, ln.SalesOrderLineID)
			if err != nil {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d]", i): "Sales order line not found."})
				return
			}
			if ln.Qty > balance+0.0001 {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].qty", i): "Exceeds undelivered balance."})
				return
			}

			var releasedQty, deliveredQty float64
			_ = tx.QueryRow(r.Context(), `
				select coalesce(rel.released, 0)::float8, coalesce(ln.delivered_qty, 0)::float8
				from public.so_sales_order_lines ln
				left join (
				  select sales_order_line_id, sum(release_qty) as released
				  from public.so_sales_order_release_lines group by sales_order_line_id
				) rel on rel.sales_order_line_id = ln.id
				where ln.id = $1`, ln.SalesOrderLineID).Scan(&releasedQty, &deliveredQty)
			if v := processpolicy.ValidateDeliveryRequiresRelease(policy, releasedQty, deliveredQty, ln.Qty); v != nil {
				for k, msg := range v {
					response.ValidationSmart(w, map[string]string{fmt.Sprintf("lines[%d].%s", i, k): msg})
					return
				}
			}

			var trackInventory bool
			if ln.ItemID != nil {
				_ = tx.QueryRow(r.Context(), `
					select coalesce(track_inventory_qty, false) from public.inv_items where id = $1`, *ln.ItemID).Scan(&trackInventory)
			}

			if splitMode && trackInventory && ln.ItemID != nil {
				if err := inventory.IssueReservedStock(r.Context(), tx, tenantID, *ln.ItemID, locationID, ln.Qty); err != nil {
					response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].qty", i): err.Error()})
					return
				}
				_, err = tx.Exec(r.Context(), `
					insert into public.inv_stock_movements
					  (tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, created_by_user_id)
					values ($1, $2, $3, $4, 'dr_issue', 'dr_delivery_receipt_line', $5, $6)`,
					tenantID, *ln.ItemID, locationID, -ln.Qty, ln.ID, tu.AppUserID)
				if err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to record stock movement.", "ERR_INTERNAL")
					return
				}
			}

			_, err = tx.Exec(r.Context(), `
				insert into public.so_sales_order_slip_lines
				  (sales_order_line_id, slip_type, slip_ref, slip_date_no, qty)
				values ($1, 'delivery_receipt', $2, $3, $4)`,
				ln.SalesOrderLineID, deliveryNo, dateNoDisplay, ln.Qty)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to write slip line.", "ERR_INTERNAL")
				return
			}
			if err := fulfillment.SyncSOLineQty(r.Context(), tx, ln.SalesOrderLineID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to sync fulfillment qty.", "ERR_INTERNAL")
				return
			}
		}

		_, err = tx.Exec(r.Context(), `
			update public.dr_delivery_receipts
			set status = 'posted', posted_at = now(), updated_at = now()
			where id = $1`, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to post.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to post.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "delivery_receipt.post", "dr_delivery_receipt", &id, nil, nil)
		dr, _ := loadDeliveryReceipt(r.Context(), pool, tu.TenantID, id)
		response.OK(w, dr, "Posted.")
	}
}

func undeliveredBalance(ctx context.Context, tx pgx.Tx, tenantID, salesOrderLineID int64) (float64, error) {
	var balance float64
	err := tx.QueryRow(ctx, `
		select (coalesce(rel.released, 0) - coalesce(dr.delivered, 0))::float8
		from public.so_sales_order_lines ln
		join public.so_sales_orders so on so.id = ln.sales_order_id
		left join (
		  select sales_order_line_id, sum(release_qty) as released
		  from public.so_sales_order_release_lines
		  group by sales_order_line_id
		) rel on rel.sales_order_line_id = ln.id
		left join (
		  select sales_order_line_id, sum(qty) as delivered
		  from public.so_sales_order_slip_lines
		  where slip_type = 'delivery_receipt'
		  group by sales_order_line_id
		) dr on dr.sales_order_line_id = ln.id
		where ln.id = $1 and so.tenant_id = $2 and so.deleted_at is null`,
		salesOrderLineID, tenantID).Scan(&balance)
	return balance, err
}

func loadDeliveryReceipt(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (DeliveryReceipt, error) {
	var dr DeliveryReceipt
	var deliveryDate time.Time
	var soNo *string
	err := pool.QueryRow(ctx, `
		select dr.id, dr.delivery_date, dr.date_seq, dr.delivery_no, dr.sales_order_id, dr.status,
		  dr.partner_id, p.company_name, dr.location_id, l.location_name, dr.notes, so.sales_order_no
		from public.dr_delivery_receipts dr
		join public.inv_partners p on p.id = dr.partner_id
		join public.inv_locations l on l.id = dr.location_id
		left join public.so_sales_orders so on so.id = dr.sales_order_id
		where dr.id = $1 and dr.tenant_id = $2 and dr.deleted_at is null`,
		id, tenantID).Scan(
		&dr.ID, &deliveryDate, &dr.DateSeq, &dr.DeliveryNo, &dr.SalesOrderID, &dr.Status,
		&dr.PartnerID, &dr.PartnerName, &dr.LocationID, &dr.LocationName, &dr.Notes, &soNo)
	if err != nil {
		return DeliveryReceipt{}, err
	}
	dr.DeliveryDate = dateToStr(deliveryDate)
	dr.DateNoDisplay = formatDateNoDisplay(deliveryDate, dr.DateSeq)
	if soNo != nil {
		dr.SalesOrderNo = *soNo
	}
	dr.Lines, err = loadDeliveryReceiptLines(ctx, pool, id)
	return dr, err
}

func loadDeliveryReceiptLines(ctx context.Context, db *pgxpool.Pool, id int64) ([]DeliveryReceiptLine, error) {
	rows, err := db.Query(ctx, `
		select id, line_no, sales_order_line_id, sales_order_release_line_id,
		  item_id, item_code, item_name, qty::float8
		from public.dr_delivery_receipt_lines
		where delivery_receipt_id = $1
		order by line_no`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var lines []DeliveryReceiptLine
	for rows.Next() {
		var ln DeliveryReceiptLine
		if err := rows.Scan(&ln.ID, &ln.LineNo, &ln.SalesOrderLineID, &ln.SalesOrderReleaseLineID,
			&ln.ItemID, &ln.ItemCode, &ln.ItemName, &ln.Qty); err != nil {
			return nil, err
		}
		lines = append(lines, ln)
	}
	if lines == nil {
		lines = []DeliveryReceiptLine{}
	}
	return lines, err
}
