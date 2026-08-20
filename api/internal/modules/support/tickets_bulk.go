package support

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type bulkTicketStatusBody struct {
	IDs    []int64 `json:"ids"`
	Status string  `json:"status"`
}

type bulkTicketStatusOutcome struct {
	Updated int `json:"updated"`
	Skipped int `json:"skipped"`
}

func bulkUpdateTicketStatus(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if !tu.CanManageAllSupportTickets() {
			response.Err(w, http.StatusForbidden, "Only IT staff may bulk-update ticket status.", "ERR_FORBIDDEN")
			return
		}
		var body bulkTicketStatusBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		status := normalizeStatus(body.Status)
		if status == "" {
			response.Validation(w, map[string]string{"status": "Status is required."})
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

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update tickets.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		out := bulkTicketStatusOutcome{}
		for _, id := range body.IDs {
			if id <= 0 {
				out.Skipped++
				continue
			}
			tag, err := tx.Exec(r.Context(), `
				update public.sup_support_tickets set
				  status = $1::text,
				  resolved_at = case when $1::text in ('resolved','closed') then coalesce(resolved_at, now()) else null end,
				  updated_at = now()
				where id = $2 and tenant_id = $3`,
				status, id, tu.TenantID)
			if err != nil || tag.RowsAffected() == 0 {
				out.Skipped++
				continue
			}
			out.Updated++
			_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "support.ticket_bulk_status", "support_ticket", &id, nil, map[string]any{"status": status})
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update tickets.", "ERR_INTERNAL")
			return
		}
		response.OK(w, out, "OK")
	}
}
