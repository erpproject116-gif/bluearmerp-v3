package quality

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

type grInspectionPatchBody struct {
	InspectionStatus string  `json:"inspection_status"`
	InspectionNotes  *string `json:"inspection_notes"`
}

func patchGrInspection(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		grID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}

		var body grInspectionPatchBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}

		st := strings.TrimSpace(strings.ToLower(body.InspectionStatus))
		if st != "pending" && st != "held" && st != "released" {
			response.Validation(w, map[string]string{"inspection_status": "Use pending, held, or released."})
			return
		}

		var docStatus string
		err = pool.QueryRow(r.Context(), `
			select status from public.gr_goods_receipts where id=$1 and tenant_id=$2`, grID, tu.TenantID).Scan(&docStatus)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Goods receipt not found.", "ERR_NOT_FOUND")
			return
		}
		if docStatus != "draft" {
			response.Validation(w, map[string]string{"status": "Inspection can only be updated on draft receipts."})
			return
		}

		tag, err := pool.Exec(r.Context(), `
			update public.gr_goods_receipts set
			  inspection_status = $1,
			  inspection_notes = $2,
			  inspected_at = now(),
			  inspected_by_user_id = $3,
			  updated_at = now()
			where id = $4 and tenant_id = $5 and status = 'draft'`,
			st, body.InspectionNotes, tu.AppUserID, grID, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Goods receipt not found.", "ERR_NOT_FOUND")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "quality.gr_inspection", "gr_goods_receipt", &grID, nil, body)
		response.OK(w, map[string]any{
			"id":                grID,
			"inspection_status": st,
			"inspection_notes":  body.InspectionNotes,
		}, "Inspection updated.")
	}
}
