package shipping

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type ShippingOrder struct {
	ID            int64   `json:"id"`
	ShippingDate  string  `json:"shipping_date"`
	ShippingNo    string  `json:"shipping_no"`
	SalesOrderID  *int64  `json:"sales_order_id,omitempty"`
	PartnerID     int64   `json:"partner_id"`
	PartnerName   string  `json:"partner_name,omitempty"`
	LocationID    int64   `json:"location_id"`
	Status        string  `json:"status"`
	Notes         *string `json:"notes,omitempty"`
}

type shippingOrderBody struct {
	ShippingDate string  `json:"shipping_date"`
	SalesOrderID *int64  `json:"sales_order_id"`
	PartnerID    int64   `json:"partner_id"`
	LocationID   int64   `json:"location_id"`
	Status       string  `json:"status"`
	Notes        *string `json:"notes"`
}

func listShippingOrders(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "shipping_date", map[string]string{"shipping_date": "so.shipping_date"})
		offset := httputil.Offset(p)
		rows, err := pool.Query(r.Context(), `
			select so.id, so.shipping_date::text, so.shipping_no, so.sales_order_id,
			  so.partner_id, coalesce(p.company_name, ''), so.location_id, so.status, so.notes,
			  count(*) over()
			from public.sh_shipping_orders so
			left join public.inv_partners p on p.id = so.partner_id
			where so.tenant_id = $1
			order by so.shipping_date desc, so.shipping_no desc
			limit $2 offset $3`, tu.TenantID, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list shipping orders.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []ShippingOrder
		var total int64
		for rows.Next() {
			var row ShippingOrder
			if err := rows.Scan(&row.ID, &row.ShippingDate, &row.ShippingNo, &row.SalesOrderID,
				&row.PartnerID, &row.PartnerName, &row.LocationID, &row.Status, &row.Notes, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read shipping orders.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []ShippingOrder{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getShippingOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var row ShippingOrder
		err = pool.QueryRow(r.Context(), `
			select so.id, so.shipping_date::text, so.shipping_no, so.sales_order_id,
			  so.partner_id, coalesce(p.company_name, ''), so.location_id, so.status, so.notes
			from public.sh_shipping_orders so
			left join public.inv_partners p on p.id = so.partner_id
			where so.id = $1 and so.tenant_id = $2`, id, tu.TenantID,
		).Scan(&row.ID, &row.ShippingDate, &row.ShippingNo, &row.SalesOrderID,
			&row.PartnerID, &row.PartnerName, &row.LocationID, &row.Status, &row.Notes)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Shipping order not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, row, "OK")
	}
}

func createShippingOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body shippingOrderBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.PartnerID <= 0 || body.LocationID <= 0 {
			response.Validation(w, map[string]string{"partner_id": "Partner and location are required."})
			return
		}
		shippingDate := strings.TrimSpace(body.ShippingDate)
		if shippingDate == "" {
			shippingDate = time.Now().Format("2006-01-02")
		}
		status := strings.TrimSpace(body.Status)
		if status == "" {
			status = "draft"
		}
		var dateSeq int
		_ = pool.QueryRow(r.Context(), `
			select coalesce(max(date_seq), 0) + 1 from public.sh_shipping_orders
			where tenant_id = $1 and shipping_date = $2::date`, tu.TenantID, shippingDate).Scan(&dateSeq)
		shippingNo := fmt.Sprintf("SH-%s-%03d", strings.ReplaceAll(shippingDate, "-", ""), dateSeq)

		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.sh_shipping_orders (
			  tenant_id, shipping_date, date_seq, shipping_no, sales_order_id,
			  partner_id, location_id, status, notes, created_by_user_id
			) values ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10)
			returning id`,
			tu.TenantID, shippingDate, dateSeq, shippingNo, body.SalesOrderID,
			body.PartnerID, body.LocationID, status, body.Notes, tu.AppUserID,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create shipping order.", "ERR_INTERNAL")
			return
		}
		row := ShippingOrder{
			ID: id, ShippingDate: shippingDate, ShippingNo: shippingNo,
			SalesOrderID: body.SalesOrderID, PartnerID: body.PartnerID,
			LocationID: body.LocationID, Status: status, Notes: body.Notes,
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "shipping.order.create", "sh_shipping_order", &id, nil, body)
		response.OK(w, row, "Created.")
	}
}

func patchShippingOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body shippingOrderBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		status := strings.TrimSpace(body.Status)
		if status == "" {
			status = "draft"
		}
		tag, err := pool.Exec(r.Context(), `
			update public.sh_shipping_orders set
			  partner_id = $1, location_id = $2, status = $3, notes = $4, updated_at = now()
			where id = $5 and tenant_id = $6`,
			body.PartnerID, body.LocationID, status, body.Notes, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Shipping order not found.", "ERR_NOT_FOUND")
			return
		}
		getShippingOrder(pool)(w, r)
	}
}

func deleteShippingOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			delete from public.sh_shipping_orders where id = $1 and tenant_id = $2`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Shipping order not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "shipping.order.delete", "sh_shipping_order", &id, nil, nil)
		response.OK(w, map[string]any{"id": id}, "Deleted.")
	}
}
