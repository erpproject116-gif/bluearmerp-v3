package inventory

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type StockMovement struct {
	ID              int64   `json:"id"`
	ItemID          int64   `json:"item_id"`
	ItemCode        string  `json:"item_code"`
	ItemName        string  `json:"item_name"`
	LocationID      int64   `json:"location_id"`
	LocationName    string  `json:"location_name"`
	QtyDelta        float64 `json:"qty_delta"`
	MovementType    string  `json:"movement_type"`
	RefType         string  `json:"ref_type"`
	RefID           int64   `json:"ref_id"`
	Reason          *string `json:"reason,omitempty"`
	CreatedByUserID *int64  `json:"created_by_user_id,omitempty"`
	CreatedAt       string  `json:"created_at"`
}

type stockAdjustmentBody struct {
	ItemID     int64   `json:"item_id"`
	LocationID int64   `json:"location_id"`
	QtyDelta   float64 `json:"qty_delta"`
	Reason     string  `json:"reason"`
}

func registerStockMovementRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/stock-movements", listStockMovements(pool))
	r.Post("/stock-adjustments", createStockAdjustment(pool))
	registerStockAdjustmentApprovalRoutes(r, pool)
}

func listStockMovements(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"created_at":    "sm.created_at",
		"item_code":     "i.item_code",
		"movement_type": "sm.movement_type",
		"qty_delta":     "sm.qty_delta",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "created_at", allowed)
		offset := httputil.Offset(p)

		where := "sm.tenant_id = $1"
		args := []any{tu.TenantID}
		argN := 2

		if fromStr := strings.TrimSpace(r.URL.Query().Get("date_from")); fromStr != "" {
			from, err := parseDate(fromStr)
			if err != nil {
				response.Validation(w, map[string]string{"date_from": "Invalid date."})
				return
			}
			where += fmt.Sprintf(" and sm.created_at >= $%d::timestamptz", argN)
			args = append(args, from.Format("2006-01-02")+" 00:00:00+00")
			argN++
		}
		if toStr := strings.TrimSpace(r.URL.Query().Get("date_to")); toStr != "" {
			to, err := parseDate(toStr)
			if err != nil {
				response.Validation(w, map[string]string{"date_to": "Invalid date."})
				return
			}
			where += fmt.Sprintf(" and sm.created_at < ($%d::date + interval '1 day')", argN)
			args = append(args, to.Format("2006-01-02"))
			argN++
		}
		if id, ok := optionalInt64Query(r, "item_id"); ok && id != nil {
			where += fmt.Sprintf(" and sm.item_id = $%d", argN)
			args = append(args, *id)
			argN++
		}
		if id, ok := optionalInt64Query(r, "location_id"); ok && id != nil {
			where += fmt.Sprintf(" and sm.location_id = $%d", argN)
			args = append(args, *id)
			argN++
		}
		if mt := strings.TrimSpace(r.URL.Query().Get("movement_type")); mt != "" {
			where += fmt.Sprintf(" and sm.movement_type = $%d", argN)
			args = append(args, mt)
			argN++
		}
		if p.Q != "" {
			where += fmt.Sprintf(` and (
				i.item_code ilike $%d or i.item_name ilike $%d or
				l.location_name ilike $%d or sm.movement_type ilike $%d or
				coalesce(sm.reason, '') ilike $%d)`, argN, argN, argN, argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}

		order := orderSQL(p.Order)
		q := fmt.Sprintf(`
			select sm.id, sm.item_id, i.item_code, i.item_name,
			  sm.location_id, l.location_name, sm.qty_delta::float8,
			  sm.movement_type, sm.ref_type, sm.ref_id, sm.reason,
			  sm.created_by_user_id, sm.created_at, count(*) over()
			from public.inv_stock_movements sm
			join public.inv_items i on i.id = sm.item_id
			join public.inv_locations l on l.id = sm.location_id
			where %s
			order by %s %s
			limit $%d offset $%d`,
			where, p.Sort, order, argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list stock movements.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []StockMovement
		var total int64
		for rows.Next() {
			var row StockMovement
			var createdAt time.Time
			var totalCount int64
			if err := rows.Scan(&row.ID, &row.ItemID, &row.ItemCode, &row.ItemName,
				&row.LocationID, &row.LocationName, &row.QtyDelta,
				&row.MovementType, &row.RefType, &row.RefID, &row.Reason,
				&row.CreatedByUserID, &createdAt, &totalCount); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read stock movements.", "ERR_INTERNAL")
				return
			}
			total = totalCount
			row.CreatedAt = createdAt.Format(time.RFC3339)
			out = append(out, row)
		}
		if out == nil {
			out = []StockMovement{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}
