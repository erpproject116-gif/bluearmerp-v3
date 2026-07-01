package sales

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
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/fulfillment"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type SalesReturn struct {
	ID         int64              `json:"id"`
	ReturnDate string             `json:"return_date"`
	ReturnNo   string             `json:"return_no"`
	SalesID    int64              `json:"sales_id"`
	PartnerID  int64              `json:"partner_id"`
	Status     string             `json:"status"`
	GrandTotal float64            `json:"grand_total"`
	Lines      []SalesReturnLine  `json:"lines,omitempty"`
}

type SalesReturnLine struct {
	ID          int64   `json:"id,omitempty"`
	LineNo      int     `json:"line_no"`
	SalesLineID int64   `json:"sales_line_id"`
	ItemCode    string  `json:"item_code"`
	ItemName    string  `json:"item_name"`
	Qty         float64 `json:"qty"`
	LineTotal   float64 `json:"line_total"`
}

func registerSalesReturnRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("sales.sales_returns", auth.AccessRead)).Get("/sales-returns", listSalesReturns(pool))
	r.With(auth.RequirePermission("sales.sales_returns_new", auth.AccessWrite)).Post("/sales-returns", createSalesReturn(pool))
	r.With(auth.RequirePermission("sales.sales_returns_submit", auth.AccessWrite)).Post("/sales-returns/{id}/submit", submitSalesReturn(pool))
}

func listSalesReturns(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "return_date", map[string]string{"return_no": "return_no", "status": "status"})
		offset := httputil.Offset(p)
		rows, err := pool.Query(r.Context(), `
			select id, return_date, return_no, sales_id, partner_id, status, grand_total::float8, count(*) over()
			from public.sr_sales_returns
			where tenant_id = $1
			order by return_date desc, id desc
			limit $2 offset $3`, tu.TenantID, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list sales returns.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []SalesReturn
		var total int64
		for rows.Next() {
			var row SalesReturn
			var d time.Time
			if err := rows.Scan(&row.ID, &d, &row.ReturnNo, &row.SalesID, &row.PartnerID, &row.Status, &row.GrandTotal, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read sales returns.", "ERR_INTERNAL")
				return
			}
			row.ReturnDate = d.Format("2006-01-02")
			out = append(out, row)
		}
		if out == nil {
			out = []SalesReturn{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func createSalesReturn(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body struct {
			SalesID int64 `json:"sales_id"`
			Lines   []struct {
				SalesLineID int64   `json:"sales_line_id"`
				Qty         float64 `json:"qty"`
			} `json:"lines"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.SalesID <= 0 || len(body.Lines) == 0 {
			response.Validation(w, map[string]string{"body": "sales_id and lines are required."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create return.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var partnerID int64
		err = tx.QueryRow(r.Context(), `
			select partner_id from public.sa_sales where id = $1 and tenant_id = $2 and deleted_at is null`,
			body.SalesID, tu.TenantID).Scan(&partnerID)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Sales invoice not found.", "ERR_NOT_FOUND")
			return
		}

		var dateSeq int
		var returnNo string
		if err := tx.QueryRow(r.Context(), `
			select coalesce(max(date_seq), 0) + 1 from public.sr_sales_returns
			where tenant_id = $1 and return_date = current_date`, tu.TenantID).Scan(&dateSeq); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to allocate return no.", "ERR_INTERNAL")
			return
		}
		returnNo = fmt.Sprintf("SR-%s-%03d", time.Now().Format("20060102"), dateSeq)

		var grandTotal float64
		var returnID int64
		err = tx.QueryRow(r.Context(), `
			insert into public.sr_sales_returns (tenant_id, return_date, date_seq, return_no, sales_id, partner_id, status, created_by_user_id)
			values ($1, current_date, $2, $3, $4, $5, 'draft', $6) returning id`,
			tu.TenantID, dateSeq, returnNo, body.SalesID, partnerID, tu.AppUserID).Scan(&returnID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to insert return.", "ERR_INTERNAL")
			return
		}

		for i, ln := range body.Lines {
			var lineTotal float64
			err = tx.QueryRow(r.Context(), `
				select unit_vat_inc::float8 * $2
				from public.sa_sales_lines where id = $1 and sales_id = $3`,
				ln.SalesLineID, ln.Qty, body.SalesID).Scan(&lineTotal)
			if err != nil {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d]", i): "Invalid sales line."})
				return
			}
			grandTotal += lineTotal
			_, err = tx.Exec(r.Context(), `
				insert into public.sr_sales_return_lines (sales_return_id, line_no, sales_line_id, item_code, item_name, qty, unit_vat_inc, line_total)
				select $1, $2, id, item_code, item_name, $3, unit_vat_inc, $4 from public.sa_sales_lines where id = $5`,
				returnID, i+1, ln.Qty, lineTotal, ln.SalesLineID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to insert return line.", "ERR_INTERNAL")
				return
			}
		}
		_, _ = tx.Exec(r.Context(), `update public.sr_sales_returns set grand_total = $2 where id = $1`, returnID, grandTotal)

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save return.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales_return.create", "sr_sales_return", &returnID, nil, body)
		response.OK(w, SalesReturn{ID: returnID, ReturnNo: returnNo, SalesID: body.SalesID, PartnerID: partnerID, Status: "draft", GrandTotal: grandTotal}, "Created.")
	}
}

func submitSalesReturn(pool *pgxpool.Pool) http.HandlerFunc {
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
			select status from public.sr_sales_returns where id = $1 and tenant_id = $2 for update`,
			id, tu.TenantID).Scan(&status)
		if err != nil || status != "draft" {
			response.Validation(w, map[string]string{"status": "Only draft returns can be submitted."})
			return
		}

		rows, err := tx.Query(r.Context(), `
			select sales_line_id, qty::float8 from public.sr_sales_return_lines where sales_return_id = $1 order by line_no`, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load lines.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		for rows.Next() {
			var salesLineID int64
			var qty float64
			if err := rows.Scan(&salesLineID, &qty); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read line.", "ERR_INTERNAL")
				return
			}
			if err := fulfillment.SyncSalesLineReturnedQty(r.Context(), tx, salesLineID, qty); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to update returned qty.", "ERR_INTERNAL")
				return
			}
		}

		_, err = tx.Exec(r.Context(), `
			update public.sr_sales_returns set status = 'submitted', submitted_at = now(), updated_at = now() where id = $1`, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to submit.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to submit.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales_return.submit", "sr_sales_return", &id, nil, nil)
		response.OK(w, map[string]any{"id": id, "status": "submitted"}, "Submitted.")
	}
}
