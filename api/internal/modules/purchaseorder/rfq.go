package purchaseorder

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

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/inventory"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type RFQ struct {
	ID                int64     `json:"id"`
	RfqNo             string    `json:"rfq_no"`
	RfqDate           string    `json:"rfq_date"`
	Status            string    `json:"status"`
	PurchaseRequestID *int64    `json:"purchase_request_id,omitempty"`
	Notes             *string   `json:"notes,omitempty"`
	LineCount         int       `json:"line_count,omitempty"`
	Lines             []RFQLine `json:"lines,omitempty"`
}

type RFQLine struct {
	ID       int64   `json:"id,omitempty"`
	LineNo   int     `json:"line_no"`
	ItemID   *int64  `json:"item_id,omitempty"`
	ItemCode string  `json:"item_code"`
	ItemName string  `json:"item_name"`
	Qty      float64 `json:"qty"`
	UnitID   *int64  `json:"unit_id,omitempty"`
	UnitCode string  `json:"unit_code,omitempty"`
	Notes    *string `json:"notes,omitempty"`
}

func registerRFQRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("purchase_order.rfq", auth.AccessRead)).Get("/rfq", listRFQs(pool))
	r.With(auth.RequirePermission("purchase_order.rfq", auth.AccessRead)).Get("/rfq/{id}", getRFQ(pool))
	r.With(auth.RequirePermission("purchase_order.rfq", auth.AccessRead)).Get("/rfq/{id}/print", getRFQPrint(pool))
	r.With(auth.RequirePermission("purchase_order.rfq", auth.AccessRead)).Get("/rfq/{id}/pdf", getRFQPDF(pool))
	r.With(auth.RequirePermission("comms.send", auth.AccessWrite)).Post("/rfq/{id}/send-email", postRFQSendEmail(pool))
	r.With(auth.RequirePermission("purchase_order.rfq_create", auth.AccessWrite)).Post("/rfq", createRFQ(pool))
	r.With(auth.RequirePermission("purchase_order.rfq_create", auth.AccessWrite)).Post("/rfq/from-purchase-request/{prId}", createRFQFromPurchaseRequest(pool))
	r.With(auth.RequirePermission("purchase_order.rfq_create", auth.AccessWrite)).Patch("/rfq/{id}/status", patchRFQStatus(pool))
}

func listRFQs(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select r.id, r.rfq_no, r.rfq_date::text, r.status, r.purchase_request_id, r.notes,
			  (select count(*)::int from public.rfq_request_lines ln where ln.rfq_id = r.id)
			from public.rfq_requests r
			where r.tenant_id = $1
			order by r.rfq_date desc, r.id desc
			limit 50`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list RFQs.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []RFQ
		for rows.Next() {
			var x RFQ
			if err := rows.Scan(&x.ID, &x.RfqNo, &x.RfqDate, &x.Status, &x.PurchaseRequestID, &x.Notes, &x.LineCount); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read RFQ.", "ERR_INTERNAL")
				return
			}
			out = append(out, x)
		}
		if out == nil {
			out = []RFQ{}
		}
		response.OK(w, out, "OK")
	}
}

func getRFQ(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		hdr, err := loadRFQ(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "RFQ not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, hdr, "OK")
	}
}

func loadRFQ(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (RFQ, error) {
	var hdr RFQ
	var d time.Time
	err := pool.QueryRow(ctx, `
		select id, rfq_no, rfq_date, status, purchase_request_id, notes
		from public.rfq_requests where id = $1 and tenant_id = $2`, id, tenantID).Scan(
		&hdr.ID, &hdr.RfqNo, &d, &hdr.Status, &hdr.PurchaseRequestID, &hdr.Notes)
	if err != nil {
		return RFQ{}, err
	}
	hdr.RfqDate = d.Format("2006-01-02")

	rows, err := pool.Query(ctx, `
		select id, line_no, item_id, item_code, item_name, qty::float8, unit_id, coalesce(unit_code, ''), notes
		from public.rfq_request_lines where rfq_id = $1 order by line_no`, id)
	if err != nil {
		return RFQ{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var ln RFQLine
		if err := rows.Scan(&ln.ID, &ln.LineNo, &ln.ItemID, &ln.ItemCode, &ln.ItemName, &ln.Qty, &ln.UnitID, &ln.UnitCode, &ln.Notes); err != nil {
			return RFQ{}, err
		}
		hdr.Lines = append(hdr.Lines, ln)
	}
	if hdr.Lines == nil {
		hdr.Lines = []RFQLine{}
	}
	hdr.LineCount = len(hdr.Lines)
	return hdr, nil
}

func createRFQ(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body struct {
			PurchaseRequestID *int64  `json:"purchase_request_id"`
			Notes             *string `json:"notes"`
			Lines             []struct {
				ItemID   *int64  `json:"item_id"`
				ItemCode string  `json:"item_code"`
				ItemName string  `json:"item_name"`
				Qty      float64 `json:"qty"`
				UnitID   *int64  `json:"unit_id"`
				UnitCode string  `json:"unit_code"`
				Notes    *string `json:"notes"`
			} `json:"lines"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.Lines) == 0 {
			response.Validation(w, map[string]string{"lines": "At least one line is required."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create RFQ.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		rfqDate := time.Now()
		var seq int
		_ = tx.QueryRow(r.Context(), `
			select coalesce(max(date_seq), 0) + 1 from public.rfq_requests
			where tenant_id = $1 and rfq_date = $2::date`, tu.TenantID, rfqDate.Format("2006-01-02")).Scan(&seq)
		rfqNo := fmt.Sprintf("RFQ-%s-%03d", rfqDate.Format("20060102"), seq)

		var rfqID int64
		err = tx.QueryRow(r.Context(), `
			insert into public.rfq_requests (tenant_id, rfq_date, date_seq, rfq_no, purchase_request_id, notes, created_by_user_id)
			values ($1, $2::date, $3, $4, $5, $6, $7) returning id`,
			tu.TenantID, rfqDate.Format("2006-01-02"), seq, rfqNo, body.PurchaseRequestID, body.Notes, tu.AppUserID).Scan(&rfqID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to insert RFQ.", "ERR_INTERNAL")
			return
		}

		for i, ln := range body.Lines {
			if ln.Qty <= 0 {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].qty", i): "Quantity must be positive."})
				return
			}
			itemCode := strings.TrimSpace(ln.ItemCode)
			itemName := strings.TrimSpace(ln.ItemName)
			if ln.ItemID != nil && *ln.ItemID > 0 {
				_ = tx.QueryRow(r.Context(), `
					select item_code, item_name from public.inv_items
					where id = $1 and tenant_id = $2 and deleted_at is null`,
					*ln.ItemID, tu.TenantID).Scan(&itemCode, &itemName)
			} else if itemName == "" && itemCode == "" {
				response.Validation(w, map[string]string{
					fmt.Sprintf("lines[%d].item_name", i): "Enter a product name or code (inventory registration is optional on RFQ).",
				})
				return
			}
			unitID, unitCode := inventory.ResolveLineUnit(r.Context(), tx, tu.TenantID, ln.ItemID, ln.UnitID, ln.UnitCode)
			_, err = tx.Exec(r.Context(), `
				insert into public.rfq_request_lines (rfq_id, line_no, item_id, item_code, item_name, qty, unit_id, unit_code, notes)
				values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
				rfqID, i+1, ln.ItemID, itemCode, itemName, ln.Qty, unitID, unitCode, ln.Notes)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to insert line.", "ERR_INTERNAL")
				return
			}
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save RFQ.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "purchase_order.rfq_create", "rfq_request", &rfqID, nil, body)
		hdr, _ := loadRFQ(r.Context(), pool, tu.TenantID, rfqID)
		response.OK(w, hdr, "RFQ created.")
	}
}

func createRFQFromPurchaseRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		prID, err := strconv.ParseInt(chi.URLParam(r, "prId"), 10, 64)
		if err != nil || prID <= 0 {
			response.Validation(w, map[string]string{"prId": "Invalid purchase request id."})
			return
		}

		var body struct {
			Notes *string `json:"notes"`
		}
		if r.ContentLength > 0 {
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				response.Validation(w, map[string]string{"body": "Invalid JSON."})
				return
			}
		}

		var exists bool
		if err := pool.QueryRow(r.Context(), `
			select exists(
			  select 1 from public.pr_purchase_requests
			  where id = $1 and tenant_id = $2 and deleted_at is null
			)`, prID, tu.TenantID).Scan(&exists); err != nil || !exists {
			response.Err(w, http.StatusNotFound, "Purchase request not found.", "ERR_NOT_FOUND")
			return
		}

		rows, err := pool.Query(r.Context(), `
			select ln.item_id, ln.item_code, ln.item_name,
			  greatest(ln.qty - coalesce(sl.slipped, 0), 0)::float8 as open_qty,
			  ln.unit_id, coalesce(ln.unit_code, ''), ln.remark
			from public.pr_purchase_request_lines ln
			left join (
			  select purchase_request_line_id, sum(qty) as slipped
			  from public.pr_purchase_request_slip_lines
			  group by purchase_request_line_id
			) sl on sl.purchase_request_line_id = ln.id
			where ln.purchase_request_id = $1
			order by ln.line_no`, prID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load purchase request lines.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		lines := make([]RFQLine, 0, 8)
		for rows.Next() {
			var ln RFQLine
			if err := rows.Scan(&ln.ItemID, &ln.ItemCode, &ln.ItemName, &ln.Qty, &ln.UnitID, &ln.UnitCode, &ln.Notes); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read purchase request lines.", "ERR_INTERNAL")
				return
			}
			ln.ItemCode = strings.TrimSpace(ln.ItemCode)
			ln.ItemName = strings.TrimSpace(ln.ItemName)
			if ln.Qty <= 0 || (ln.ItemID == nil && ln.ItemName == "") {
				continue
			}
			lines = append(lines, ln)
		}
		if len(lines) == 0 {
			response.Validation(w, map[string]string{"lines": "No open lines available on this purchase request."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create RFQ.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		rfqDate := time.Now()
		var seq int
		_ = tx.QueryRow(r.Context(), `
			select coalesce(max(date_seq), 0) + 1 from public.rfq_requests
			where tenant_id = $1 and rfq_date = $2::date`, tu.TenantID, rfqDate.Format("2006-01-02")).Scan(&seq)
		rfqNo := fmt.Sprintf("RFQ-%s-%03d", rfqDate.Format("20060102"), seq)

		var rfqID int64
		err = tx.QueryRow(r.Context(), `
			insert into public.rfq_requests (tenant_id, rfq_date, date_seq, rfq_no, purchase_request_id, notes, created_by_user_id)
			values ($1, $2::date, $3, $4, $5, $6, $7)
			returning id`,
			tu.TenantID, rfqDate.Format("2006-01-02"), seq, rfqNo, prID, body.Notes, tu.AppUserID).Scan(&rfqID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create RFQ.", "ERR_INTERNAL")
			return
		}

		for i, ln := range lines {
			_, err = tx.Exec(r.Context(), `
				insert into public.rfq_request_lines (rfq_id, line_no, item_id, item_code, item_name, qty, unit_id, unit_code, notes)
				values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
				rfqID, i+1, ln.ItemID, ln.ItemCode, ln.ItemName, ln.Qty, ln.UnitID, nullIfEmpty(ln.UnitCode), ln.Notes)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to insert RFQ line.", "ERR_INTERNAL")
				return
			}
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save RFQ.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "purchase_order.rfq_create_from_pr", "rfq_request", &rfqID, nil, map[string]any{
			"purchase_request_id": prID,
			"line_count":          len(lines),
		})
		hdr, _ := loadRFQ(r.Context(), pool, tu.TenantID, rfqID)
		response.OK(w, hdr, "RFQ created from purchase request.")
	}
}

func patchRFQStatus(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]bool{
		"draft":     true,
		"sent":      true,
		"closed":    true,
		"cancelled": true,
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}

		var body struct {
			Status string `json:"status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		status := strings.TrimSpace(body.Status)
		if !allowed[status] {
			response.Validation(w, map[string]string{"status": "Must be draft, sent, closed, or cancelled."})
			return
		}

		var prev string
		if err := pool.QueryRow(r.Context(), `
			select status from public.rfq_requests
			where id = $1 and tenant_id = $2`, id, tu.TenantID).Scan(&prev); err != nil {
			response.Err(w, http.StatusNotFound, "RFQ not found.", "ERR_NOT_FOUND")
			return
		}

		if _, err := pool.Exec(r.Context(), `
			update public.rfq_requests
			set status = $1, updated_at = now()
			where id = $2 and tenant_id = $3`, status, id, tu.TenantID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update RFQ status.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "purchase_order.rfq_patch_status", "rfq_request", &id, map[string]any{
			"status": prev,
		}, map[string]any{
			"status": status,
		})
		hdr, _ := loadRFQ(r.Context(), pool, tu.TenantID, id)
		response.OK(w, hdr, "RFQ status updated.")
	}
}
