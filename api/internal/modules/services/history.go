package services

import (
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth/datascope"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func searchHistory(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		args := []any{tu.TenantID}
		filter := ""
		if q != "" {
			filter = " and (action ilike $2 or from_status ilike $2 or to_status ilike $2 or entity_type ilike $2)"
			args = append(args, "%"+q+"%")
		}
		rows, err := pool.Query(r.Context(), `
			select id, entity_type, entity_id, action, from_status, to_status, reason, created_at
			from public.svc_status_events
			where tenant_id = $1`+filter+`
			order by created_at desc
			limit 200`, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to search history.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id, entityID int64
			var entityType, action, from, to, reason string
			var created any
			if err := rows.Scan(&id, &entityType, &entityID, &action, &from, &to, &reason, &created); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to search history.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{
				"id": id, "entity_type": entityType, "entity_id": entityID, "action": action,
				"from_status": from, "to_status": to, "reason": reason, "created_at": created,
			})
		}
		response.OK(w, out, "OK")
	}
}

func reportSummary(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		args := []any{tu.TenantID}
		frag, _, err := datascope.ApplyUserScopesSQL(r.Context(), pool, tu, datascope.ListFilter{
			LocationColumn: "j.location_id",
			CustomerColumn: "j.partner_id",
		}, 2, &args)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to apply branch scope.", "ERR_INTERNAL")
			return
		}
		var requests, openJobs, inProgress, awaiting, overdue, inCustody int64
		err = pool.QueryRow(r.Context(), `
			select
			  (select count(*) from public.svc_requests r where r.tenant_id = $1 and r.deleted_at is null),
			  (select count(*) from public.svc_jobs j where j.tenant_id = $1 and j.deleted_at is null
			     and j.operational_status in ('open','scheduled','in_progress','on_hold','pending_qc') `+frag+`),
			  (select count(*) from public.svc_jobs j where j.tenant_id = $1 and j.deleted_at is null
			     and j.operational_status = 'in_progress' `+frag+`),
			  (select count(*) from public.svc_jobs j where j.tenant_id = $1 and j.deleted_at is null
			     and j.operational_status = 'completed' and j.approval_status <> 'approved' `+frag+`),
			  (select count(*) from public.svc_jobs j where j.tenant_id = $1 and j.deleted_at is null
			     and j.due_at is not null and j.due_at < now()
			     and j.operational_status not in ('completed','closed','cancelled') `+frag+`),
			  (select count(*) from public.svc_customer_equipment e
			     where e.tenant_id = $1 and e.deleted_at is null
			       and e.custody_status not in ('with_customer','released','returned'))
		`, args...).Scan(&requests, &openJobs, &inProgress, &awaiting, &overdue, &inCustody)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load the service report.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{
			"service_requests":      requests,
			"open_jobs":             openJobs,
			"jobs_in_progress":      inProgress,
			"awaiting_confirmation": awaiting,
			"overdue_jobs":          overdue,
			"equipment_in_custody":  inCustody,
		}, "OK")
	}
}
