package shipping

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type createShippingFromLinesBody struct {
	ShippingDate string                      `json:"shipping_date"`
	PartnerID    int64                       `json:"partner_id"`
	LocationID   int64                       `json:"location_id"`
	Notes        *string                     `json:"notes"`
	Lines        []createShippingFromLineRow `json:"lines"`
}

type createShippingFromLineRow struct {
	SalesOrderLineID int64   `json:"sales_order_line_id"`
	Qty              float64 `json:"qty"`
}

func createShippingOrderFromLines(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body createShippingFromLinesBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.PartnerID <= 0 || body.LocationID <= 0 {
			response.Validation(w, map[string]string{"partner_id": "Partner and location are required."})
			return
		}
		if len(body.Lines) == 0 {
			response.Validation(w, map[string]string{"lines": "At least one line is required."})
			return
		}
		shippingDate := strings.TrimSpace(body.ShippingDate)
		if shippingDate == "" {
			shippingDate = time.Now().Format("2006-01-02")
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create shipping order.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var salesOrderID int64
		for i, ln := range body.Lines {
			if ln.SalesOrderLineID <= 0 || ln.Qty <= 0 {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d]", i): "Sales order line and qty are required."})
				return
			}
			var soid int64
			var partnerID, locationID int64
			err := tx.QueryRow(r.Context(), `
				select so.id, so.partner_id, so.location_id
				from public.so_sales_order_lines sol
				join public.so_sales_orders so on so.id = sol.sales_order_id
				where sol.id = $1 and so.tenant_id = $2 and so.deleted_at is null`,
				ln.SalesOrderLineID, tu.TenantID).Scan(&soid, &partnerID, &locationID)
			if err != nil {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].sales_order_line_id", i): "Sales order line not found."})
				return
			}
			if partnerID != body.PartnerID {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d]", i): "Line customer does not match shipping partner."})
				return
			}
			if locationID != body.LocationID {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d]", i): "Line location does not match shipping location."})
				return
			}
			if salesOrderID == 0 {
				salesOrderID = soid
			} else if salesOrderID != soid {
				response.Validation(w, map[string]string{"lines": "All lines must belong to the same sales order."})
				return
			}
		}

		var dateSeq int
		if err := tx.QueryRow(r.Context(), `
			select coalesce(max(date_seq), 0) + 1 from public.sh_shipping_orders
			where tenant_id = $1 and shipping_date = $2::date`, tu.TenantID, shippingDate).Scan(&dateSeq); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to allocate shipping number.", "ERR_INTERNAL")
			return
		}
		shippingNo := fmt.Sprintf("SH-%s-%03d", strings.ReplaceAll(shippingDate, "-", ""), dateSeq)

		var shippingID int64
		err = tx.QueryRow(r.Context(), `
			insert into public.sh_shipping_orders (
			  tenant_id, shipping_date, date_seq, shipping_no, sales_order_id,
			  partner_id, location_id, status, notes, created_by_user_id
			) values ($1, $2::date, $3, $4, $5, $6, $7, 'draft', $8, $9)
			returning id`,
			tu.TenantID, shippingDate, dateSeq, shippingNo, salesOrderID,
			body.PartnerID, body.LocationID, body.Notes, tu.AppUserID,
		).Scan(&shippingID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create shipping order.", "ERR_INTERNAL")
			return
		}

		lineNo := 0
		for i, ln := range body.Lines {
			lineNo++
			_, err = tx.Exec(r.Context(), `
				insert into public.sh_shipping_order_lines (shipping_order_id, sales_order_line_id, qty, line_no)
				values ($1, $2, $3, $4)`,
				shippingID, ln.SalesOrderLineID, ln.Qty, lineNo)
			if err != nil {
				if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
					response.Validation(w, map[string]string{fmt.Sprintf("lines[%d]", i): "Line already on a shipping order."})
					return
				}
				response.Err(w, http.StatusInternalServerError, "Failed to add shipping line.", "ERR_INTERNAL")
				return
			}
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create shipping order.", "ERR_INTERNAL")
			return
		}

		row := ShippingOrder{
			ID: shippingID, ShippingDate: shippingDate, ShippingNo: shippingNo,
			SalesOrderID: &salesOrderID, PartnerID: body.PartnerID,
			LocationID: body.LocationID, Status: "draft", Notes: body.Notes,
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "shipping.order.create_from_lines", "sh_shipping_order", &shippingID, nil, body)
		response.OK(w, row, "Created.")
	}
}
