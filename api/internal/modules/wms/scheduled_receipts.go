package wms

import (
	"encoding/json"
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

type ScheduledReceipt struct {
	ID                  int64   `json:"id"`
	PurchaseOrderLineID int64   `json:"purchase_order_line_id"`
	ExpectedDate        string  `json:"expected_date"`
	Qty                 float64 `json:"qty"`
	Status              string  `json:"status"`
	GoodsReceiptID      *int64  `json:"goods_receipt_id,omitempty"`
	ProcessedAt         *string `json:"processed_at,omitempty"`
}

type scheduledReceiptBody struct {
	PurchaseOrderLineID int64   `json:"purchase_order_line_id"`
	ExpectedDate        string  `json:"expected_date"`
	Qty                 float64 `json:"qty"`
}

type processReceiptBody struct {
	GoodsReceiptID *int64 `json:"goods_receipt_id"`
}

func listScheduledReceipts(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "expected_date", map[string]string{"expected_date": "sr.expected_date"})
		offset := httputil.Offset(p)
		where := "sr.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if st := strings.TrimSpace(r.URL.Query().Get("status")); st != "" {
			where += " and sr.status = $" + strconv.Itoa(n)
			args = append(args, st)
			n++
		}
		q := `
			select sr.id, sr.purchase_order_line_id, sr.expected_date::text, sr.qty::float8,
			  sr.status, sr.goods_receipt_id, sr.processed_at::text, count(*) over()
			from public.wms_scheduled_receipts sr
			where ` + where + `
			order by sr.expected_date, sr.id
			limit $` + strconv.Itoa(n) + ` offset $` + strconv.Itoa(n+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list scheduled receipts.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []ScheduledReceipt
		var total int64
		for rows.Next() {
			var row ScheduledReceipt
			if err := rows.Scan(&row.ID, &row.PurchaseOrderLineID, &row.ExpectedDate, &row.Qty,
				&row.Status, &row.GoodsReceiptID, &row.ProcessedAt, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read scheduled receipts.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []ScheduledReceipt{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func createScheduledReceipt(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body scheduledReceiptBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.PurchaseOrderLineID <= 0 || body.Qty <= 0 {
			response.Validation(w, map[string]string{"purchase_order_line_id": "PO line and qty are required."})
			return
		}
		expectedDate := strings.TrimSpace(body.ExpectedDate)
		if expectedDate == "" {
			expectedDate = time.Now().Format("2006-01-02")
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.wms_scheduled_receipts (tenant_id, purchase_order_line_id, expected_date, qty, created_by_user_id)
			values ($1, $2, $3::date, $4, $5)
			returning id`,
			tu.TenantID, body.PurchaseOrderLineID, expectedDate, body.Qty, tu.AppUserID,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create scheduled receipt.", "ERR_INTERNAL")
			return
		}
		row := ScheduledReceipt{
			ID: id, PurchaseOrderLineID: body.PurchaseOrderLineID,
			ExpectedDate: expectedDate, Qty: body.Qty, Status: "in_progress",
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "wms.scheduled_receipt.create", "wms_scheduled_receipt", &id, nil, body)
		response.OK(w, row, "Created.")
	}
}

func processScheduledReceipt(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body processReceiptBody
		_ = json.NewDecoder(r.Body).Decode(&body)
		tag, err := pool.Exec(r.Context(), `
			update public.wms_scheduled_receipts set
			  status = 'processed', goods_receipt_id = $1, processed_at = now(), updated_at = now()
			where id = $2 and tenant_id = $3 and status = 'in_progress'`,
			body.GoodsReceiptID, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Scheduled receipt not found or already processed.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "wms.scheduled_receipt.process", "wms_scheduled_receipt", &id, nil, body)
		response.OK(w, map[string]any{"id": id, "status": "processed", "goods_receipt_id": body.GoodsReceiptID}, "Processed.")
	}
}
