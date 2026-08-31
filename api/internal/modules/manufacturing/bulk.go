package manufacturing

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type bulkIDsBody struct {
	IDs []int64 `json:"ids"`
}

type bulkOutcome struct {
	Updated int `json:"updated"`
	Skipped int `json:"skipped"`
}

func bulkDeactivateBoms(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body bulkIDsBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.IDs) == 0 {
			response.Validation(w, map[string]string{"ids": "At least one id is required."})
			return
		}
		if len(body.IDs) > 200 {
			response.Validation(w, map[string]string{"ids": "At most 200 ids per request."})
			return
		}

		out := bulkOutcome{}
		for _, id := range body.IDs {
			if id <= 0 {
				out.Skipped++
				continue
			}
			tag, err := pool.Exec(r.Context(), `
				update public.mfg_boms set is_active = false, updated_at = now()
				where id = $1 and tenant_id = $2 and is_active = true`, id, tu.TenantID)
			if err != nil || tag.RowsAffected() == 0 {
				out.Skipped++
				continue
			}
			out.Updated++
			_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "manufacturing.bom_deactivate", "mfg_bom", &id, nil, nil)
		}
		response.OK(w, out, "Bulk deactivate finished.")
	}
}

func bulkCancelWorkOrders(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body bulkIDsBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.IDs) == 0 {
			response.Validation(w, map[string]string{"ids": "At least one id is required."})
			return
		}
		if len(body.IDs) > 200 {
			response.Validation(w, map[string]string{"ids": "At most 200 ids per request."})
			return
		}

		out := bulkOutcome{}
		for _, id := range body.IDs {
			if id <= 0 {
				out.Skipped++
				continue
			}
			tag, err := pool.Exec(r.Context(), `
				update public.mfg_work_orders
				set status = 'cancelled', updated_at = now()
				where id = $1 and tenant_id = $2 and status = 'draft'`, id, tu.TenantID)
			if err != nil || tag.RowsAffected() == 0 {
				out.Skipped++
				continue
			}
			out.Updated++
			_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "manufacturing.work_order_cancel", "mfg_work_order", &id, nil, nil)
		}
		response.OK(w, out, "Bulk cancel finished.")
	}
}

func bulkReleaseWorkOrders(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body bulkIDsBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.IDs) == 0 {
			response.Validation(w, map[string]string{"ids": "At least one id is required."})
			return
		}
		if len(body.IDs) > 200 {
			response.Validation(w, map[string]string{"ids": "At most 200 ids per request."})
			return
		}

		out := bulkOutcome{}
		for _, id := range body.IDs {
			if id <= 0 {
				out.Skipped++
				continue
			}
			tag, err := pool.Exec(r.Context(), `
				update public.mfg_work_orders
				set status = 'released', released_at = now(), updated_at = now()
				where id = $1 and tenant_id = $2 and status = 'draft'`, id, tu.TenantID)
			if err != nil || tag.RowsAffected() == 0 {
				out.Skipped++
				continue
			}
			out.Updated++
			_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "manufacturing.work_order_release", "mfg_work_order", &id, nil, nil)
		}
		response.OK(w, out, "Bulk release finished.")
	}
}
