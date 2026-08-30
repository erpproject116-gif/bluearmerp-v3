package quality

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type woInspectionPatchBody struct {
	InspectionStatus string  `json:"inspection_status"`
	InspectionNotes  *string `json:"inspection_notes"`
}

func patchWoInspection(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		woID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}

		var body woInspectionPatchBody
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
			select status from public.mfg_work_orders where id=$1 and tenant_id=$2`, woID, tu.TenantID).Scan(&docStatus)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				response.Err(w, http.StatusNotFound, "Work order not found.", "ERR_NOT_FOUND")
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to load work order.", "ERR_INTERNAL")
			return
		}
		if docStatus != "released" {
			response.Validation(w, map[string]string{"status": "Inspection can only be updated on released work orders."})
			return
		}

		tag, err := pool.Exec(r.Context(), `
			update public.mfg_work_orders set
			  inspection_status = $1,
			  inspection_notes = $2,
			  inspected_at = now(),
			  inspected_by_user_id = $3,
			  updated_at = now()
			where id = $4 and tenant_id = $5 and status = 'released'`,
			st, body.InspectionNotes, tu.AppUserID, woID, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update inspection.", "ERR_INTERNAL")
			return
		}
		if tag.RowsAffected() == 0 {
			response.Validation(w, map[string]string{"status": "Work order is no longer released."})
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "quality.wo_inspection", "mfg_work_order", &woID, nil, body)
		response.OK(w, map[string]any{
			"id":                woID,
			"inspection_status": st,
			"inspection_notes":  body.InspectionNotes,
		}, "Inspection updated.")
	}
}
