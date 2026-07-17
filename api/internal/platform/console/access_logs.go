package console

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/onboarding"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func (s *service) listAccessLogs(w http.ResponseWriter, r *http.Request) {
	s.listPlatformAudit(w, r, "")
}

func (s *service) listPlatformChangeLogs(w http.ResponseWriter, r *http.Request) {
	s.listPlatformAudit(w, r, "change")
}

func (s *service) listPlatformAudit(w http.ResponseWriter, r *http.Request, kind string) {
	args := []any{}
	where := "where 1=1"
	n := 1
	if kind != "" {
		args = append(args, kind)
		where += " and event_kind = $" + strconv.Itoa(n)
		n++
	}
	if v := strings.TrimSpace(r.URL.Query().Get("q")); v != "" {
		args = append(args, "%"+strings.ToLower(v)+"%")
		where += " and (lower(actor_email) like $" + strconv.Itoa(n) + " or lower(summary) like $" + strconv.Itoa(n) + " or lower(route_path) like $" + strconv.Itoa(n) + ")"
		n++
	}
	_ = n
	rows, err := s.pool.Query(r.Context(), `
		select id, platform_user_id, actor_email, actor_name, action_code, event_kind,
		       http_method, route_path, platform_customer_id, tenant_id,
		       target_type, target_id, summary, reason, result_status, created_at,
		       old_values, new_values
		from public.platform_audit_logs
		`+where+`
		order by created_at desc
		limit 200`, args...)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to list access logs.", "ERR_INTERNAL")
		return
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		var id int64
		var platformUserID *int64
		var email, name, action, eventKind, method, path string
		var customerID, tenantID, targetID *int64
		var targetType, summary, reason string
		var status int
		var created time.Time
		var oldV, newV []byte
		if rows.Scan(&id, &platformUserID, &email, &name, &action, &eventKind, &method, &path,
			&customerID, &tenantID, &targetType, &targetID, &summary, &reason, &status, &created, &oldV, &newV) != nil {
			continue
		}
		list = append(list, map[string]any{
			"id": id, "platform_user_id": platformUserID, "actor_email": email, "actor_name": name,
			"action_code": action, "event_kind": eventKind, "http_method": method, "route_path": path,
			"platform_customer_id": customerID, "tenant_id": tenantID,
			"target_type": targetType, "target_id": targetID, "summary": summary, "reason": reason,
			"result_status": status, "created_at": created,
			"old_values": jsonRawOrNil(oldV), "new_values": jsonRawOrNil(newV),
		})
	}
	response.OK(w, map[string]any{"items": list}, "OK")
}

func (s *service) listOnboarding(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(), `
		select pc.id, pc.email, pc.full_name, coalesce(pc.company_name,''), pc.tenant_id,
		       t.company_code, ps.status as sub_status, ps.ends_at
		from public.platform_customers pc
		join public.tenants t on t.id = pc.tenant_id
		left join lateral (
		  select status, ends_at from public.platform_subscriptions
		  where customer_id = pc.id order by created_at desc limit 1
		) ps on true
		where pc.tenant_id is not null
		order by pc.created_at desc
		limit 80`)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to list onboarding.", "ERR_INTERNAL")
		return
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		var customerID, tenantID int64
		var email, name, company, companyCode string
		var subStatus *string
		var endsAt *time.Time
		if rows.Scan(&customerID, &email, &name, &company, &tenantID, &companyCode, &subStatus, &endsAt) != nil {
			continue
		}
		snap, _ := onboarding.SnapshotForTenant(r.Context(), s.pool, tenantID)
		percent := 0
		blocking := ""
		ready := false
		if snap != nil {
			if v, ok := snap["overall_percent"].(int); ok {
				percent = v
			}
			if v, ok := snap["blocking_reason"].(string); ok {
				blocking = v
			}
			if v, ok := snap["ready"].(bool); ok {
				ready = v
			}
			if v, ok := snap["required_complete"].(bool); ok && !ready {
				ready = v
			}
		}
		list = append(list, map[string]any{
			"customer_id": customerID, "email": email, "full_name": name, "company_name": company,
			"tenant_id": tenantID, "company_code": companyCode,
			"subscription_status": subStatus, "ends_at": endsAt,
			"overall_percent": percent, "blocking_reason": blocking, "ready": ready,
			"onboarding": snap,
		})
	}
	response.OK(w, map[string]any{"customers": list}, "OK")
}
