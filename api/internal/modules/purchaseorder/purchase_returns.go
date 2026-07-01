package purchaseorder

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type PurchaseReturn struct {
	ID         int64                  `json:"id"`
	ReturnDate string                 `json:"return_date"`
	ReturnNo   string                 `json:"return_no"`
	PartnerID  int64                  `json:"partner_id"`
	Status     string                 `json:"status"`
	GrandTotal float64                `json:"grand_total"`
	Lines      []PurchaseReturnLine   `json:"lines,omitempty"`
}

type PurchaseReturnLine struct {
	ID                   int64   `json:"id,omitempty"`
	LineNo               int     `json:"line_no"`
	GoodsReceiptLineID   int64   `json:"goods_receipt_line_id"`
	PurchaseOrderLineID  *int64  `json:"purchase_order_line_id,omitempty"`
	ItemCode             string  `json:"item_code"`
	ItemName             string  `json:"item_name"`
	Qty                  float64 `json:"qty"`
	LineTotal            float64 `json:"line_total"`
}

func registerPurchaseReturnRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("purchase_order.purchase_returns", auth.AccessRead)).Get("/purchase-returns", listPurchaseReturns(pool))
	r.With(auth.RequirePermission("purchase_order.purchase_returns", auth.AccessRead)).Get("/purchase-returns/{id}", getPurchaseReturn(pool))
	r.With(auth.RequirePermission("purchase_order.purchase_returns_submit", auth.AccessWrite)).Post("/purchase-returns", createPurchaseReturn(pool))
	r.With(auth.RequireSubmit("purchase_order.purchase_returns_submit")).Post("/purchase-returns/{id}/submit", submitPurchaseReturn(pool))
}

func listPurchaseReturns(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, return_no, return_date::text, partner_id, status, grand_total::float8
			from public.prt_purchase_returns where tenant_id = $1 order by return_date desc limit 50`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list purchase returns.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []PurchaseReturn
		for rows.Next() {
			var x PurchaseReturn
			if err := rows.Scan(&x.ID, &x.ReturnNo, &x.ReturnDate, &x.PartnerID, &x.Status, &x.GrandTotal); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read.", "ERR_INTERNAL")
				return
			}
			out = append(out, x)
		}
		if out == nil {
			out = []PurchaseReturn{}
		}
		response.OK(w, out, "OK")
	}
}

func getPurchaseReturn(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		var hdr PurchaseReturn
		var d time.Time
		err := pool.QueryRow(r.Context(), `
			select id, return_date, return_no, partner_id, status, grand_total::float8
			from public.prt_purchase_returns where id = $1 and tenant_id = $2`, id, tu.TenantID).Scan(
			&hdr.ID, &d, &hdr.ReturnNo, &hdr.PartnerID, &hdr.Status, &hdr.GrandTotal)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Purchase return not found.", "ERR_NOT_FOUND")
			return
		}
		hdr.ReturnDate = d.Format("2006-01-02")
		rows, err := pool.Query(r.Context(), `
			select l.id, l.line_no, l.goods_receipt_line_id, l.purchase_order_line_id,
			  coalesce(i.item_code, ''), coalesce(i.item_name, ''), l.qty::float8, l.line_total::float8
			from public.prt_purchase_return_lines l
			left join public.inv_items i on i.id = l.item_id
			where l.purchase_return_id = $1 order by l.line_no`, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load lines.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		for rows.Next() {
			var ln PurchaseReturnLine
			if err := rows.Scan(&ln.ID, &ln.LineNo, &ln.GoodsReceiptLineID, &ln.PurchaseOrderLineID,
				&ln.ItemCode, &ln.ItemName, &ln.Qty, &ln.LineTotal); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read line.", "ERR_INTERNAL")
				return
			}
			hdr.Lines = append(hdr.Lines, ln)
		}
		response.OK(w, hdr, "OK")
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

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create return.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var dateSeq int
		if err := tx.QueryRow(r.Context(), `
			select coalesce(max(date_seq), 0) + 1 from public.prt_purchase_returns
			where tenant_id = $1 and return_date = current_date`, tu.TenantID).Scan(&dateSeq); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to allocate return no.", "ERR_INTERNAL")
			return
		}
		returnNo := fmt.Sprintf("PRT-%s-%03d", time.Now().Format("20060102"), dateSeq)

		var returnID int64
		var grandTotal float64
		err = tx.QueryRow(r.Context(), `
			insert into public.prt_purchase_returns (tenant_id, return_no, date_seq, partner_id, status, created_by_user_id)
			values ($1, $2, $3, $4, 'draft', $5) returning id`,
			tu.TenantID, returnNo, dateSeq, body.PartnerID, tu.AppUserID).Scan(&returnID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create return.", "ERR_INTERNAL")
			return
		}

		for i, ln := range body.Lines {
			if ln.Qty <= 0 {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].qty", i): "Qty must be positive."})
				return
			}
			var poLineID, itemID *int64
			var receivedQty, unitVatInc float64
			err = tx.QueryRow(r.Context(), `
				select grl.purchase_order_line_id, grl.item_id, grl.received_qty::float8, pol.unit_vat_inc::float8
				from public.gr_goods_receipt_lines grl
				left join public.po_purchase_order_lines pol on pol.id = grl.purchase_order_line_id
				join public.gr_goods_receipts gr on gr.id = grl.goods_receipt_id
				where grl.id = $1 and gr.tenant_id = $2 and gr.status = 'posted'`,
				ln.GoodsReceiptLineID, tu.TenantID).Scan(&poLineID, &itemID, &receivedQty, &unitVatInc)
			if err != nil {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d]", i): "Invalid goods receipt line."})
				return
			}
			if ln.Qty > receivedQty+0.0001 {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].qty", i): "Return qty exceeds received qty."})
				return
			}
			lineTotal := unitVatInc * ln.Qty
			grandTotal += lineTotal
			_, err = tx.Exec(r.Context(), `
				insert into public.prt_purchase_return_lines (
				  purchase_return_id, line_no, goods_receipt_line_id, purchase_order_line_id, item_id, qty, unit_vat_inc, line_total
				) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
				returnID, i+1, ln.GoodsReceiptLineID, poLineID, itemID, ln.Qty, unitVatInc, lineTotal)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to insert return line.", "ERR_INTERNAL")
				return
			}
		}
		_, _ = tx.Exec(r.Context(), `update public.prt_purchase_returns set grand_total = $2 where id = $1`, returnID, grandTotal)

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save return.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "purchase_return.create", "prt_purchase_return", &returnID, nil, body)
		response.OK(w, PurchaseReturn{ID: returnID, ReturnNo: returnNo, PartnerID: body.PartnerID, Status: "draft", GrandTotal: grandTotal}, "Created.")
	}
}

func submitPurchaseReturn(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to submit.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var status string
		err = tx.QueryRow(r.Context(), `
			select status from public.prt_purchase_returns where id = $1 and tenant_id = $2 for update`,
			id, tu.TenantID).Scan(&status)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Return not found.", "ERR_NOT_FOUND")
			return
		}
		if status != "draft" {
			response.Validation(w, map[string]string{"status": "Only draft returns can be submitted."})
			return
		}

		rows, err := tx.Query(r.Context(), `
			select purchase_order_line_id, qty::float8 from public.prt_purchase_return_lines
			where purchase_return_id = $1 and purchase_order_line_id is not null`, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load lines.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		for rows.Next() {
			var poLineID int64
			var qty float64
			if err := rows.Scan(&poLineID, &qty); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read line.", "ERR_INTERNAL")
				return
			}
			tag, err := tx.Exec(r.Context(), `
				update public.po_purchase_order_lines
				set received_qty = greatest(0, received_qty - $2)
				where id = $1 and received_qty >= $2 - 0.0001`, poLineID, qty)
			if err != nil || tag.RowsAffected() == 0 {
				response.Validation(w, map[string]string{"lines": "Cannot reduce received qty below zero."})
				return
			}
		}

		_, err = tx.Exec(r.Context(), `
			update public.prt_purchase_returns set status = 'submitted', submitted_at = now(), updated_at = now() where id = $1`, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to submit.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to submit.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "purchase_return.submit", "prt_purchase_return", &id, nil, nil)
		response.OK(w, map[string]any{"id": id, "status": "submitted"}, "Submitted.")
	}
}
