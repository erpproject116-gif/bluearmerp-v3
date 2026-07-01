package portal

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type portalOrderRow struct {
	ID        int64   `json:"id"`
	OrderNo   string  `json:"order_no"`
	OrderDate string  `json:"order_date"`
	Status    string  `json:"status"`
	GrandTotal float64 `json:"grand_total"`
}

type portalInvoiceRow struct {
	ID        int64   `json:"id"`
	SalesNo   string  `json:"sales_no"`
	OrderDate string  `json:"order_date"`
	Status    string  `json:"status"`
	GrandTotal float64 `json:"grand_total"`
}

type portalTicketRow struct {
	ID       int64  `json:"id"`
	TicketNo string `json:"ticket_no"`
	Subject  string `json:"subject"`
	Status   string `json:"status"`
	Priority string `json:"priority"`
}

func listPortalOrders(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Portal session required.", "ERR_UNAUTHORIZED")
			return
		}
		p := httputil.ParseListParams(r, "order_date", map[string]string{"order_date": "so.order_date"})
		offset := httputil.Offset(p)
		rows, err := pool.Query(r.Context(), `
			select so.id, so.sales_order_no, so.order_date::text, so.progress_status, so.grand_total::float8,
			  count(*) over()
			from public.so_sales_orders so
			where so.tenant_id = $1 and so.partner_id = $2 and so.deleted_at is null
			order by so.order_date desc
			limit $3 offset $4`,
			pu.TenantID, pu.PartnerID, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list orders.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []portalOrderRow
		var total int64
		for rows.Next() {
			var row portalOrderRow
			if err := rows.Scan(&row.ID, &row.OrderNo, &row.OrderDate, &row.Status, &row.GrandTotal, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read orders.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []portalOrderRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func listPortalInvoices(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Portal session required.", "ERR_UNAUTHORIZED")
			return
		}
		p := httputil.ParseListParams(r, "order_date", map[string]string{"order_date": "s.order_date"})
		offset := httputil.Offset(p)
		rows, err := pool.Query(r.Context(), `
			select s.id, s.sales_no, s.order_date::text, s.progress_status, s.grand_total::float8,
			  count(*) over()
			from public.sa_sales s
			where s.tenant_id = $1 and s.partner_id = $2 and s.deleted_at is null
			order by s.order_date desc
			limit $3 offset $4`,
			pu.TenantID, pu.PartnerID, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list invoices.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []portalInvoiceRow
		var total int64
		for rows.Next() {
			var row portalInvoiceRow
			if err := rows.Scan(&row.ID, &row.SalesNo, &row.OrderDate, &row.Status, &row.GrandTotal, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read invoices.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []portalInvoiceRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func listPortalTickets(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Portal session required.", "ERR_UNAUTHORIZED")
			return
		}
		p := httputil.ParseListParams(r, "ticket_date", map[string]string{"ticket_date": "t.ticket_date"})
		offset := httputil.Offset(p)
		rows, err := pool.Query(r.Context(), `
			select t.id, t.ticket_no, t.subject, t.status, t.priority,
			  count(*) over()
			from public.sup_support_tickets t
			where t.tenant_id = $1 and t.partner_id = $2
			order by t.ticket_date desc
			limit $3 offset $4`,
			pu.TenantID, pu.PartnerID, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list tickets.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []portalTicketRow
		var total int64
		for rows.Next() {
			var row portalTicketRow
			if err := rows.Scan(&row.ID, &row.TicketNo, &row.Subject, &row.Status, &row.Priority, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read tickets.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []portalTicketRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}
