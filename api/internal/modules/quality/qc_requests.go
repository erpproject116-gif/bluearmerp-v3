package quality

import (
	"context"
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

type QcRequest struct {
	ID                int64   `json:"id"`
	RequestNo         string  `json:"request_no"`
	RequestDate       string  `json:"request_date"`
	SourceType        string  `json:"source_type"`
	GoodsReceiptID    *int64  `json:"goods_receipt_id,omitempty"`
	SupplierInvoiceID *int64  `json:"supplier_invoice_id,omitempty"`
	PartnerName       *string `json:"partner_name,omitempty"`
	ItemCode          *string `json:"item_code,omitempty"`
	ItemName          *string `json:"item_name,omitempty"`
	Notes             *string `json:"notes,omitempty"`
	ProgressStatus    string  `json:"progress_status"`
}

type qcRequestBody struct {
	SourceType        string  `json:"source_type"`
	GoodsReceiptID    *int64  `json:"goods_receipt_id"`
	SupplierInvoiceID *int64  `json:"supplier_invoice_id"`
	ItemCode          *string `json:"item_code"`
	ItemName          *string `json:"item_name"`
	Notes             *string `json:"notes"`
}

func allocateQcRequestNo(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (string, error) {
	var seq int
	err := pool.QueryRow(ctx, `
		select coalesce(max(substring(request_no from '[0-9]+$')::int), 0) + 1
		from public.qms_qc_requests
		where tenant_id = $1 and request_date = current_date`, tenantID).Scan(&seq)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("QC-%s-%03d", time.Now().Format("20060102"), seq), nil
}

func listQcRequests(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"request_no": "q.request_no", "request_date": "q.request_date", "progress_status": "q.progress_status",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "request_date", allowed)
		if p.Order == "" {
			p.Order = "desc"
		}
		offset := httputil.Offset(p)
		where := "q.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if st := strings.TrimSpace(r.URL.Query().Get("progress_status")); st != "" {
			where += fmt.Sprintf(" and q.progress_status = $%d", n)
			args = append(args, st)
			n++
		}
		if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
			where += fmt.Sprintf(" and (q.request_no ilike $%d or coalesce(q.partner_name,'') ilike $%d)", n, n)
			args = append(args, "%"+q+"%")
			n++
		}
		sortCol := allowed[p.Sort]
		if sortCol == "" {
			sortCol = "q.request_date"
		}
		args = append(args, p.PageSize, offset)
		qry := fmt.Sprintf(`
			select q.id, q.request_no, q.request_date::text, q.source_type,
			  q.goods_receipt_id, q.supplier_invoice_id, q.partner_name, q.item_code, q.item_name,
			  q.notes, q.progress_status, count(*) over()
			from public.qms_qc_requests q
			where %s
			order by %s %s
			limit $%d offset $%d`, where, sortCol, orderSQL(p.Order), n, n+1)

		rows, err := pool.Query(r.Context(), qry, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load QC requests.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []QcRequest
		var total int64
		for rows.Next() {
			var row QcRequest
			if err := rows.Scan(&row.ID, &row.RequestNo, &row.RequestDate, &row.SourceType,
				&row.GoodsReceiptID, &row.SupplierInvoiceID, &row.PartnerName, &row.ItemCode, &row.ItemName,
				&row.Notes, &row.ProgressStatus, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read QC requests.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []QcRequest{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func createQcRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body qcRequestBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		source := strings.TrimSpace(body.SourceType)
		if source != "goods_receipt" {
			response.Validation(w, map[string]string{
				"source_type": "Quality control is performed at Goods Receipt, not Purchase Invoice.",
			})
			return
		}
		if source == "goods_receipt" && (body.GoodsReceiptID == nil || *body.GoodsReceiptID <= 0) {
			response.Validation(w, map[string]string{"goods_receipt_id": "Goods receipt is required."})
			return
		}

		var partnerName *string
		var name string
		err := pool.QueryRow(r.Context(), `
			select p.company_name
			from public.gr_goods_receipts gr
			join public.po_purchase_orders po on po.id = gr.purchase_order_id
			join public.inv_partners p on p.id = po.partner_id
			where gr.id = $1 and gr.tenant_id = $2`, *body.GoodsReceiptID, tu.TenantID).Scan(&name)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Goods receipt not found.", "ERR_NOT_FOUND")
			return
		}
		partnerName = &name

		reqNo, err := allocateQcRequestNo(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to allocate request no.", "ERR_INTERNAL")
			return
		}
		var id int64
		err = pool.QueryRow(r.Context(), `
			insert into public.qms_qc_requests (
			  tenant_id, request_no, source_type, goods_receipt_id, supplier_invoice_id,
			  partner_name, item_code, item_name, notes, progress_status, created_by_user_id
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'unconfirmed',$10)
			returning id`,
			tu.TenantID, reqNo, source, body.GoodsReceiptID, body.SupplierInvoiceID,
			partnerName, body.ItemCode, body.ItemName, body.Notes, tu.AppUserID,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create QC request.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "quality.qc_request.create", "qms_qc_request", &id, nil, body)
		row := QcRequest{
			ID: id, RequestNo: reqNo, RequestDate: time.Now().Format("2006-01-02"),
			SourceType: source, GoodsReceiptID: body.GoodsReceiptID, SupplierInvoiceID: body.SupplierInvoiceID,
			PartnerName: partnerName, ItemCode: body.ItemCode, ItemName: body.ItemName,
			Notes: body.Notes, ProgressStatus: "unconfirmed",
		}
		response.OK(w, row, "QC request created.")
	}
}

func patchQcRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body struct {
			ProgressStatus *string `json:"progress_status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.ProgressStatus == nil {
			response.Validation(w, map[string]string{"progress_status": "Required."})
			return
		}
		st := strings.TrimSpace(*body.ProgressStatus)
		switch st {
		case "e_approval", "unconfirmed", "in_progress", "completed":
		default:
			response.Validation(w, map[string]string{"progress_status": "Invalid status."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.qms_qc_requests set progress_status = $1, updated_at = now()
			where id = $2 and tenant_id = $3`, st, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "QC request not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, nil, "Updated.")
	}
}
