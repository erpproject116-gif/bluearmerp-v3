package finance

import (
	"encoding/json"
	"net/http"
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
