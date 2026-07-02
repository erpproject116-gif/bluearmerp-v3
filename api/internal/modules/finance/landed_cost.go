package finance

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type LandedCostHeader struct {
	ID              int64   `json:"id"`
	GoodsReceiptID  int64   `json:"goods_receipt_id"`
	Reference       *string `json:"reference,omitempty"`
	Status          string  `json:"status"`
	TotalAmount     float64 `json:"total_amount"`
}

type landedCostBody struct {
	GoodsReceiptID int64   `json:"goods_receipt_id"`
	Reference      *string `json:"reference"`
	TotalAmount    float64 `json:"total_amount"`
	Status         string  `json:"status"`
}

func registerLandedCostRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.landed_cost_read", auth.AccessRead)).Get("/landed-costs", listLandedCosts(pool))
	r.With(auth.RequirePermission("finance.landed_cost_write", auth.AccessWrite)).Post("/landed-costs", createLandedCost(pool))
	r.With(auth.RequirePermission("finance.landed_cost_write", auth.AccessWrite)).Post("/landed-costs/{id}/post", postLandedCost(pool))
}

func listLandedCosts(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, goods_receipt_id, reference, status, total_amount::float8
			from public.fin_landed_cost_headers
			where tenant_id = $1
			order by id desc`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list landed costs.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []LandedCostHeader
		for rows.Next() {
			var row LandedCostHeader
			if err := rows.Scan(&row.ID, &row.GoodsReceiptID, &row.Reference, &row.Status, &row.TotalAmount); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read landed costs.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []LandedCostHeader{}
		}
		response.OK(w, out, "OK")
	}
}

func createLandedCost(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body landedCostBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.GoodsReceiptID <= 0 {
			response.Validation(w, map[string]string{"goods_receipt_id": "Goods receipt is required."})
			return
		}
		status := strings.TrimSpace(body.Status)
		if status == "" {
			status = "draft"
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.fin_landed_cost_headers (tenant_id, goods_receipt_id, reference, status, total_amount, created_by_user_id)
			values ($1, $2, $3, $4, $5, $6)
			returning id`,
			tu.TenantID, body.GoodsReceiptID, body.Reference, status, body.TotalAmount, tu.AppUserID,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create landed cost.", "ERR_INTERNAL")
			return
		}
		row := LandedCostHeader{ID: id, GoodsReceiptID: body.GoodsReceiptID, Reference: body.Reference, Status: status, TotalAmount: body.TotalAmount}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.landed_cost.create", "fin_landed_cost_header", &id, nil, body)
		response.OK(w, row, "Created.")
	}
}

func postLandedCost(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to post.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var grID int64
		var totalAmount float64
		var status string
		err = tx.QueryRow(r.Context(), `
			select goods_receipt_id, total_amount::float8, status
			from public.fin_landed_cost_headers
			where id = $1 and tenant_id = $2 for update`, id, tu.TenantID).Scan(&grID, &totalAmount, &status)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Landed cost not found.", "ERR_NOT_FOUND")
			return
		}
		if status == "posted" {
			response.Validation(w, map[string]string{"status": "Already posted."})
			return
		}
		if totalAmount <= 0 {
			response.Validation(w, map[string]string{"total_amount": "Total amount must be greater than zero."})
			return
		}

		rows, err := tx.Query(r.Context(), `
			select id, received_qty::float8
			from public.gr_goods_receipt_lines
			where goods_receipt_id = $1 and received_qty > 0
			order by line_no`, grID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load GR lines.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		type grLine struct {
			id  int64
			qty float64
		}
		var lines []grLine
		var qtySum float64
		for rows.Next() {
			var ln grLine
			if err := rows.Scan(&ln.id, &ln.qty); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read GR lines.", "ERR_INTERNAL")
				return
			}
			lines = append(lines, ln)
			qtySum += ln.qty
		}
		if len(lines) == 0 || qtySum <= 0 {
			response.Validation(w, map[string]string{"goods_receipt_id": "Goods receipt has no received quantity."})
			return
		}

		_, _ = tx.Exec(r.Context(), `delete from public.fin_landed_cost_lines where header_id = $1`, id)
		for _, ln := range lines {
			share := ln.qty / qtySum
			lineAmount := totalAmount * share
			unitAdd := lineAmount / ln.qty
			_, err = tx.Exec(r.Context(), `
				insert into public.fin_landed_cost_lines (header_id, goods_receipt_line_id, cost_type, amount, allocated_unit_cost)
				values ($1, $2, 'import', $3, $4)`,
				id, ln.id, lineAmount, unitAdd)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to allocate landed cost.", "ERR_INTERNAL")
				return
			}
			_, err = tx.Exec(r.Context(), `
				update public.gr_goods_receipt_lines
				set landed_unit_cost = landed_unit_cost + $1,
				    unit_cost = base_unit_cost + landed_unit_cost + $1
				where id = $2`, unitAdd, ln.id)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to update GR unit cost.", "ERR_INTERNAL")
				return
			}
		}

		_, err = tx.Exec(r.Context(), `
			update public.fin_landed_cost_headers set status = 'posted', posted_at = now(), updated_at = now()
			where id = $1 and tenant_id = $2`, id, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update header.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.landed_cost.post", "fin_landed_cost_header", &id, nil, nil)
		response.OK(w, map[string]any{"id": id, "status": "posted"}, "Posted.")
	}
}
