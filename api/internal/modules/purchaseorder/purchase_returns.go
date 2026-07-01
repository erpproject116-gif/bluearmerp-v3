package purchaseorder

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func registerPurchaseReturnRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("purchase_order.purchase_returns", auth.AccessRead)).Get("/purchase-returns", listPurchaseReturns(pool))
	r.With(auth.RequirePermission("purchase_order.purchase_returns_submit", auth.AccessWrite)).Post("/purchase-returns", createPurchaseReturn(pool))
}

func listPurchaseReturns(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, return_no, return_date::text, status, grand_total::float8
			from public.prt_purchase_returns where tenant_id = $1 order by return_date desc limit 50`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list purchase returns.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		type row struct {
			ID         int64   `json:"id"`
			ReturnNo   string  `json:"return_no"`
			ReturnDate string  `json:"return_date"`
			Status     string  `json:"status"`
			GrandTotal float64 `json:"grand_total"`
		}
		var out []row
		for rows.Next() {
			var x row
			if err := rows.Scan(&x.ID, &x.ReturnNo, &x.ReturnDate, &x.Status, &x.GrandTotal); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read.", "ERR_INTERNAL")
				return
			}
			out = append(out, x)
		}
		if out == nil {
			out = []row{}
		}
		response.OK(w, out, "OK")
	}
}

func createPurchaseReturn(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body struct {
			PartnerID int64 `json:"partner_id"`
			Lines     []struct {
				GoodsReceiptLineID int64   `json:"goods_receipt_line_id"`
				Qty                float64 `json:"qty"`
			} `json:"lines"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.PartnerID <= 0 || len(body.Lines) == 0 {
			response.Validation(w, map[string]string{"body": "partner_id and lines required."})
			return
		}
		returnNo := fmt.Sprintf("PRT-%s", time.Now().Format("20060102150405"))
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.prt_purchase_returns (tenant_id, return_no, date_seq, partner_id, status, created_by_user_id)
			values ($1, $2, 1, $3, 'draft', $4) returning id`,
			tu.TenantID, returnNo, body.PartnerID, tu.AppUserID).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create return.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": id, "return_no": returnNo, "status": "draft"}, "Created.")
	}
}
