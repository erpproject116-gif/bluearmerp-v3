package finance

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/approval"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func registerCoaReplaceRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/accounts/coa-replace-requests", listCoaReplaceRequests(pool))
	r.Post("/accounts/coa-replace-requests", requestCoaReplace(pool))
	r.Post("/accounts/coa-replace-requests/{id}/approve", approveCoaReplace(pool))
	r.Post("/accounts/coa-replace-requests/{id}/reject", rejectCoaReplace(pool))
}

func countTenantOwners(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (int, error) {
	var n int
	err := pool.QueryRow(ctx, `
		select case when t.owner_user_id is null then 0 else 1 end
		  + (
		    select count(*)::int from public.users u
		    where u.tenant_id = t.id and u.status = 'active'
		      and u.tenant_role in ('owner', 'store_owner')
		      and (t.owner_user_id is null or u.id is distinct from t.owner_user_id)
		  )
		from public.tenants t where t.id = $1`, tenantID).Scan(&n)
	return n, err
}

func requestCoaReplace(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if !tu.IsTenantOwner && !tu.IsStoreAdmin && !tu.IsPlatformSuperadmin {
			response.Err(w, http.StatusForbidden, "Only a store admin or owner can request a chart replace.", "ERR_FORBIDDEN")
			return
		}
		var body struct {
			Note                   string `json:"note"`
			ConfirmCompanyCode     string `json:"confirm_company_code"`
			AcknowledgeIrreversible bool  `json:"acknowledge_irreversible"`
			Template               string `json:"template"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON body.", "ERR_BAD_REQUEST")
			return
		}
		note := strings.TrimSpace(body.Note)
		if note == "" {
			response.Validation(w, map[string]string{"note": "Explain why you need to replace the chart of accounts."})
			return
		}
		if !body.AcknowledgeIrreversible {
			response.Validation(w, map[string]string{"acknowledge_irreversible": "Confirm that soft-deleted accounts stay linked to old journals."})
			return
		}
		var companyCode string
		_ = pool.QueryRow(r.Context(), `select company_code from public.tenants where id = $1`, tu.TenantID).Scan(&companyCode)
		confirm := strings.TrimSpace(body.ConfirmCompanyCode)
		if confirm != companyCode && !strings.EqualFold(confirm, "REPLACE") {
			response.Validation(w, map[string]string{"confirm_company_code": "Type your company code or REPLACE to confirm."})
			return
		}
		template := strings.TrimSpace(body.Template)
		if template == "" {
			template = "ph_sme"
		}
		if template != "ph_sme" {
			response.Validation(w, map[string]string{"template": "Only ph_sme template is supported."})
			return
		}

		var pending int
		_ = pool.QueryRow(r.Context(), `
			select count(*)::int from public.fin_coa_replace_requests
			where tenant_id = $1 and status = 'pending'`, tu.TenantID).Scan(&pending)
		if pending > 0 {
			response.Err(w, http.StatusConflict, "A chart replace request is already waiting for approval.", "ERR_CONFLICT")
			return
		}

		owners, err := countTenantOwners(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to check owners.", "ERR_INTERNAL")
			return
		}
		escalate := owners <= 1

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start request.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.fin_coa_replace_requests
			  (tenant_id, template, note, status, escalate_to_platform, requested_by_user_id)
			values ($1, $2, $3, 'pending', $4, $5)
			returning id`, tu.TenantID, template, note, escalate, tu.AppUserID).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create request.", "ERR_INTERNAL")
			return
		}
		noteCopy := note
		if err := approval.Submit(r.Context(), tx, tu, "fin_coa_replace_request", id, &noteCopy); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to submit for approval.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save request.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.coa_replace.request", "fin_coa_replace_request", &id, nil, map[string]any{
			"note": note, "escalate_to_platform": escalate,
		})

		msg := "Replace request sent for approval. Another owner must approve it before the chart changes."
		if escalate {
			msg = "Replace request sent. Because this company has only one owner, a Bluearm product owner must approve it in Platform Command."
		}
		response.OK(w, map[string]any{
			"id": id, "status": "pending", "escalate_to_platform": escalate,
		}, msg)
	}
}

func listCoaReplaceRequests(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select r.id, r.template, r.note, r.status, r.escalate_to_platform,
			       r.created_at, coalesce(u.full_name, u.email, ''),
			       coalesce(r.decision_note, '')
			from public.fin_coa_replace_requests r
			join public.users u on u.id = r.requested_by_user_id
			where r.tenant_id = $1
			order by r.created_at desc
			limit 20`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list requests.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		type rowOut struct {
			ID                 int64  `json:"id"`
			Template           string `json:"template"`
			Note               string `json:"note"`
			Status             string `json:"status"`
			EscalateToPlatform bool   `json:"escalate_to_platform"`
			CreatedAt          string `json:"created_at"`
			RequestedBy        string `json:"requested_by"`
			DecisionNote       string `json:"decision_note,omitempty"`
		}
		var out []rowOut
		for rows.Next() {
			var o rowOut
			var created time.Time
			if err := rows.Scan(&o.ID, &o.Template, &o.Note, &o.Status, &o.EscalateToPlatform, &created, &o.RequestedBy, &o.DecisionNote); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read requests.", "ERR_INTERNAL")
				return
			}
			o.CreatedAt = created.UTC().Format(time.RFC3339)
			out = append(out, o)
		}
		if out == nil {
			out = []rowOut{}
		}
		response.OK(w, out, "OK")
	}
}

func approveCoaReplace(pool *pgxpool.Pool) http.HandlerFunc {
	return decideCoaReplace(pool, true)
}

func rejectCoaReplace(pool *pgxpool.Pool) http.HandlerFunc {
	return decideCoaReplace(pool, false)
}

func decideCoaReplace(pool *pgxpool.Pool, approve bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
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
		var requestedBy int64
		var escalate bool
		var template string
		var tenantID int64
		err = pool.QueryRow(r.Context(), `
			select tenant_id, status, requested_by_user_id, escalate_to_platform, template
			from public.fin_coa_replace_requests where id = $1`, id).Scan(&tenantID, &status, &requestedBy, &escalate, &template)
		if err != nil {
			if err == pgx.ErrNoRows {
				response.Err(w, http.StatusNotFound, "Request not found.", "ERR_NOT_FOUND")
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to load request.", "ERR_INTERNAL")
			return
		}
		if tenantID != tu.TenantID && !tu.IsPlatformSuperadmin {
			response.Err(w, http.StatusForbidden, "This request belongs to another company.", "ERR_FORBIDDEN")
			return
		}
		if status != "pending" {
			response.Err(w, http.StatusBadRequest, "This request is no longer pending.", "ERR_BAD_REQUEST")
			return
		}
		if requestedBy == tu.AppUserID && !tu.IsPlatformSuperadmin {
			response.Err(w, http.StatusForbidden, "You cannot approve or reject your own request. Ask another owner.", "ERR_FORBIDDEN")
			return
		}
		if escalate {
			if !tu.IsPlatformSuperadmin {
				response.Err(w, http.StatusForbidden, "This request needs a Bluearm product owner in Platform Command.", "ERR_FORBIDDEN")
				return
			}
		} else if !tu.IsTenantOwner && !tu.IsPlatformSuperadmin {
			response.Err(w, http.StatusForbidden, "Only a company owner can approve chart replace.", "ERR_FORBIDDEN")
			return
		}

		tx, err := pool.Begin(r.Context())
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
			if err := applyCoaReplaceTx(r.Context(), tx, tenantID, template); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to replace chart: "+err.Error(), "ERR_INTERNAL")
				return
			}
		}

		decided := approve
		remarks := strings.TrimSpace(body.DecisionNote)
		var remarksPtr *string
		if remarks != "" {
			remarksPtr = &remarks
		}
		// Keep generic approval_requests in sync when row exists for this tenant.
		if tenantID == tu.TenantID {
			_ = approval.Decide(r.Context(), tx, tu, "fin_coa_replace_request", id, decided, remarksPtr)
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save decision.", "ERR_INTERNAL")
			return
		}
		action := "finance.coa_replace.reject"
		msg := "Chart replace request rejected. No accounts were changed."
		if approve {
			action = "finance.coa_replace.approve"
			msg = "Approved. Old accounts were soft-deleted and the PH SME chart was loaded."
		}
		_ = audit.Log(r.Context(), pool, tenantID, tu.AppUserID, action, "fin_coa_replace_request", &id, nil, map[string]any{
			"decision_note": body.DecisionNote,
		})
		response.OK(w, map[string]any{"id": id, "status": newStatus, "approved": approve}, msg)
	}
}

func applyCoaReplaceTx(ctx context.Context, tx pgx.Tx, tenantID int64, template string) error {
	if template != "ph_sme" {
		return pgx.ErrNoRows
	}
	if _, err := tx.Exec(ctx, `
		update public.fin_accounts
		set deleted_at = now(), is_active = false
		where tenant_id = $1 and deleted_at is null`, tenantID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `select public.seed_ph_sme_chart_of_accounts($1)`, tenantID); err != nil {
		return err
	}
	_, _ = tx.Exec(ctx, `select public.apply_ph_sme_coa_hierarchy($1)`, tenantID)
	return nil
}
