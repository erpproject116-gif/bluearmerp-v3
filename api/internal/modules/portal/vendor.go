package portal

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type vendorPORow struct {
	ID              int64   `json:"id"`
	PurchaseOrderNo string  `json:"purchase_order_no"`
	OrderDate       string  `json:"order_date"`
	Status          string  `json:"status"`
	GrandTotal      float64 `json:"grand_total"`
}

func listVendorPurchaseOrders(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Portal session required.", "ERR_UNAUTHORIZED")
			return
		}
		p := httputil.ParseListParams(r, "order_date", map[string]string{"order_date": "po.order_date"})
		offset := httputil.Offset(p)
		rows, err := pool.Query(r.Context(), `
			select po.id, po.purchase_order_no, po.order_date::text, po.progress_status, po.grand_total::float8,
			  count(*) over()
			from public.po_purchase_orders po
			where po.tenant_id = $1 and po.partner_id = $2 and po.deleted_at is null
			order by po.order_date desc
			limit $3 offset $4`,
			pu.TenantID, pu.PartnerID, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list purchase orders.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []vendorPORow
		var total int64
		for rows.Next() {
			var row vendorPORow
			if err := rows.Scan(&row.ID, &row.PurchaseOrderNo, &row.OrderDate, &row.Status, &row.GrandTotal, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read purchase orders.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []vendorPORow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}
