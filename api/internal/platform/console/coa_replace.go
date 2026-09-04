package console

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func (s *service) listPendingCoaReplace(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(), `
		select r.id, r.tenant_id, t.company_code, coalesce(t.company_name, ''),
		       r.note, r.created_at, coalesce(u.full_name, u.email, '')
		from public.fin_coa_replace_requests r
		join public.tenants t on t.id = r.tenant_id
		join public.users u on u.id = r.requested_by_user_id
		where r.status = 'pending' and r.escalate_to_platform = true
		order by r.created_at
		limit 50`)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to list COA replace requests.", "ERR_INTERNAL")
		return
	}
	defer rows.Close()
	type rowOut struct {
		ID          int64  `json:"id"`
		TenantID    int64  `json:"tenant_id"`
		CompanyCode string `json:"company_code"`
		CompanyName string `json:"company_name"`
		Note        string `json:"note"`
		CreatedAt   string `json:"created_at"`
		RequestedBy string `json:"requested_by"`
	}
	var out []rowOut
	for rows.Next() {
		var o rowOut
		var created time.Time
		if err := rows.Scan(&o.ID, &o.TenantID, &o.CompanyCode, &o.CompanyName, &o.Note, &created, &o.RequestedBy); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to read requests.", "ERR_INTERNAL")
			return
		}
		o.CreatedAt = created.UTC().Format(time.RFC3339)
		out = append(out, o)
	}
	if out == nil {
		out = []rowOut{}
	}
	response.OK(w, map[string]any{"requests": out}, "OK")
}

func (s *service) decidePlatformCoaReplace(approve bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if !tu.IsPlatformSuperadmin {
			response.Err(w, http.StatusForbidden, "Platform product owner access required.", "ERR_FORBIDDEN")
			return
		}
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid request id."})
			return
		}
		var body struct {
			DecisionNote string `json:"decision_note"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)

		var status string
		var escalate bool
		var template string
		var tenantID int64
		var requestedBy int64
		err = s.pool.QueryRow(r.Context(), `
			select tenant_id, status, escalate_to_platform, template, requested_by_user_id
			from public.fin_coa_replace_requests where id = $1`, id).Scan(&tenantID, &status, &escalate, &template, &requestedBy)
		if err != nil {
			if err == pgx.ErrNoRows {
				response.Err(w, http.StatusNotFound, "Request not found.", "ERR_NOT_FOUND")
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to load request.", "ERR_INTERNAL")
			return
		}
		if status != "pending" || !escalate {
			response.Err(w, http.StatusBadRequest, "Not a pending platform-escalated chart replace request.", "ERR_BAD_REQUEST")
			return
		}
		if requestedBy == tu.AppUserID {
			response.Err(w, http.StatusForbidden, "You cannot decide your own request.", "ERR_FORBIDDEN")
			return
		}

		tx, err := s.pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to decide.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		newStatus := "rejected"
		if approve {
			newStatus = "approved"
		}
		tag, err := tx.Exec(r.Context(), `
			update public.fin_coa_replace_requests
			set status = $1, decided_by_user_id = $2, decided_at = now(),
			    decision_note = nullif($3, '')
			where id = $4 and status = 'pending'`, newStatus, tu.AppUserID, strings.TrimSpace(body.DecisionNote), id)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusConflict, "Request was already decided.", "ERR_CONFLICT")
			return
		}
		if approve {
			if _, err := tx.Exec(r.Context(), `
				update public.fin_accounts
				set deleted_at = now(), is_active = false
				where tenant_id = $1 and deleted_at is null`, tenantID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to soft-delete accounts.", "ERR_INTERNAL")
				return
			}
			if _, err := tx.Exec(r.Context(), `select public.seed_ph_sme_chart_of_accounts($1)`, tenantID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to seed chart.", "ERR_INTERNAL")
				return
			}
			_, _ = tx.Exec(r.Context(), `select public.apply_ph_sme_coa_hierarchy($1)`, tenantID)
		}
		_, _ = tx.Exec(r.Context(), `
			update public.approval_requests
			set status = $1, decided_at = now(), decided_by_user_id = $2
			where tenant_id = $3 and entity_type = 'fin_coa_replace_request' and entity_id = $4`,
			map[bool]string{true: "confirmed", false: "unconfirmed"}[approve], tu.AppUserID, tenantID, id)
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}
		msg := "Chart replace rejected."
		if approve {
			msg = "Chart replace approved and applied for this company."
		}
		response.OK(w, map[string]any{"id": id, "tenant_id": tenantID, "status": newStatus}, msg)
	}
}
