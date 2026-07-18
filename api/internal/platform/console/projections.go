package console

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/onboarding"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type linkedCustomer struct {
	CustomerID int64
	TenantID   *int64
	Email      string
	FullName   string
	Company    string
}

func (s *service) resolveCustomer(ctx context.Context, id int64) (linkedCustomer, error) {
	var c linkedCustomer
	var company *string
	err := s.pool.QueryRow(ctx, `
		select id, tenant_id, email, full_name, coalesce(company_name,'')
		from public.platform_customers where id = $1`, id).
		Scan(&c.CustomerID, &c.TenantID, &c.Email, &c.FullName, &company)
	if err != nil {
		return c, err
	}
	if company != nil {
		c.Company = *company
	}
	return c, nil
}

func (s *service) customerOverview(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	c, err := s.resolveCustomer(r.Context(), id)
	if err != nil {
		if err == pgx.ErrNoRows {
			response.Err(w, http.StatusNotFound, "Customer not found.", "ERR_NOT_FOUND")
			return
		}
		response.Err(w, http.StatusInternalServerError, "Failed to load customer.", "ERR_INTERNAL")
		return
	}
	tu, _ := auth.FromContext(r.Context())
	logPlatformAudit(r.Context(), s.pool, tu, platformAuditEntry{
		ActionCode: "platform.customer.overview", EventKind: "access",
		HTTPMethod: "GET", RoutePath: r.URL.Path,
		PlatformCustomerID: &c.CustomerID, TenantID: c.TenantID,
		TargetType: "platform_customer", TargetID: &c.CustomerID,
		Summary: "Viewed customer overview",
	})

	out := map[string]any{
		"customer_id": c.CustomerID,
		"email":       c.Email,
		"full_name":   c.FullName,
		"company_name": c.Company,
		"tenant_id":   c.TenantID,
	}

	if c.TenantID != nil {
		var companyName, companyCode, status string
		var userCount, openTickets int
		_ = s.pool.QueryRow(r.Context(), `
			select company_name, company_code, status from public.tenants where id = $1`, *c.TenantID).
			Scan(&companyName, &companyCode, &status)
		_ = s.pool.QueryRow(r.Context(), `
			select count(*) from public.users where tenant_id = $1 and status = 'active'`, *c.TenantID).Scan(&userCount)
		_ = s.pool.QueryRow(r.Context(), `
			select count(*) from public.sup_support_tickets
			where tenant_id = $1 and status in ('open','in_progress','waiting')`, *c.TenantID).Scan(&openTickets)

		var lastSeen *time.Time
		var currentPath *string
		_ = s.pool.QueryRow(r.Context(), `
			select max(last_seen_at),
			       (array_agg(current_path order by last_seen_at desc nulls last))[1]
			from public.tenant_user_presence
			where tenant_id = $1`, *c.TenantID).Scan(&lastSeen, &currentPath)

		snap, _ := onboarding.SnapshotForTenant(r.Context(), s.pool, *c.TenantID)
		out["tenant"] = map[string]any{
			"id": *c.TenantID, "company_name": companyName, "company_code": companyCode, "status": status,
			"tenant_id": *c.TenantID, "user_count": userCount, "open_tickets": openTickets,
			"last_seen_at": lastSeen, "current_screen": currentPath,
		}
		out["onboarding"] = snap
	}

	var planKind, subStatus *string
	var endsAt *time.Time
	_ = s.pool.QueryRow(r.Context(), `
		select plan_kind, status, ends_at from public.platform_subscriptions
		where customer_id = $1 order by created_at desc limit 1`, c.CustomerID).
		Scan(&planKind, &subStatus, &endsAt)
	out["subscription"] = map[string]any{"plan_kind": planKind, "status": subStatus, "ends_at": endsAt}

	var openFollowUps int
	_ = s.pool.QueryRow(r.Context(), `
		select count(*) from public.platform_follow_up_tasks
		where platform_customer_id = $1 and stage in ('open','in_progress')`, c.CustomerID).Scan(&openFollowUps)
	out["open_follow_ups"] = openFollowUps

	health, signals, usage := s.computeCustomerHealth(r.Context(), c.CustomerID, c.TenantID)
	out["health_score"] = health
	out["health_signals"] = signals
	out["usage"] = usage

	var pendingInvites int
	if c.TenantID != nil {
		_ = s.pool.QueryRow(r.Context(), `
			select count(*) from public.user_invites
			where tenant_id = $1 and accepted_at is null and revoked_at is null`, *c.TenantID).Scan(&pendingInvites)
	}
	out["pending_tenant_invites"] = pendingInvites

	var assigneeID *int64
	var assigneeName *string
	_ = s.pool.QueryRow(r.Context(), `
		select pc.assigned_platform_user_id, pu.full_name
		from public.platform_customers pc
		left join public.platform_users pu on pu.id = pc.assigned_platform_user_id
		where pc.id = $1`, c.CustomerID).Scan(&assigneeID, &assigneeName)
	out["assignee"] = map[string]any{"platform_user_id": assigneeID, "full_name": assigneeName}

	response.OK(w, out, "OK")
}

func (s *service) customerUsers(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	c, err := s.resolveCustomer(r.Context(), id)
	if err != nil || c.TenantID == nil {
		response.Err(w, http.StatusNotFound, "Customer tenant not found.", "ERR_NOT_FOUND")
		return
	}
	rows, err := s.pool.Query(r.Context(), `
		select u.id, u.email, u.full_name, u.tenant_role, u.status, u.created_at,
		       (t.owner_user_id = u.id) as is_owner
		from public.users u
		join public.tenants t on t.id = u.tenant_id
		where u.tenant_id = $1
		order by u.full_name`, *c.TenantID)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to list users.", "ERR_INTERNAL")
		return
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		var uid int64
		var email, name, role, status string
		var created time.Time
		var isOwner bool
		if rows.Scan(&uid, &email, &name, &role, &status, &created, &isOwner) != nil {
			continue
		}
		list = append(list, map[string]any{
			"id": uid, "email": email, "full_name": name, "tenant_role": role,
			"status": status, "created_at": created, "is_owner": isOwner,
		})
	}
	response.OK(w, map[string]any{"users": list, "tenant_id": *c.TenantID}, "OK")
}

func (s *service) customerOnboarding(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	c, err := s.resolveCustomer(r.Context(), id)
	if err != nil {
		response.Err(w, http.StatusNotFound, "Customer not found.", "ERR_NOT_FOUND")
		return
	}
	tenantID := int64(0)
	if c.TenantID != nil {
		tenantID = *c.TenantID
	}
	snap, err := onboarding.SnapshotForTenant(r.Context(), s.pool, tenantID)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to load onboarding.", "ERR_INTERNAL")
		return
	}
	response.OK(w, snap, "OK")
}

func (s *service) customerActivity(w http.ResponseWriter, r *http.Request) {
	s.listCustomerAudit(w, r, false)
}

func (s *service) customerChanges(w http.ResponseWriter, r *http.Request) {
	s.listCustomerAudit(w, r, true)
}

func (s *service) listCustomerAudit(w http.ResponseWriter, r *http.Request, changesOnly bool) {
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	c, err := s.resolveCustomer(r.Context(), id)
	if err != nil || c.TenantID == nil {
		response.Err(w, http.StatusNotFound, "Customer tenant not found.", "ERR_NOT_FOUND")
		return
	}
	where := "al.tenant_id = $1"
	if changesOnly {
		where += " and al.old_values is not null and al.new_values is not null"
	}
	rows, err := s.pool.Query(r.Context(), `
		select al.id, al.actor_user_id, u.full_name, al.action_code, al.target_type, al.target_id,
		       al.old_values, al.new_values, al.created_at
		from public.audit_logs al
		left join public.users u on u.id = al.actor_user_id
		where `+where+`
		order by al.created_at desc
		limit 100`, *c.TenantID)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to list activity.", "ERR_INTERNAL")
		return
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		var id int64
		var actorID *int64
		var actorName *string
		var action, targetType string
		var targetID *int64
		var oldV, newV []byte
		var created time.Time
		if rows.Scan(&id, &actorID, &actorName, &action, &targetType, &targetID, &oldV, &newV, &created) != nil {
			continue
		}
		list = append(list, map[string]any{
			"id": id, "actor_user_id": actorID, "actor_name": actorName,
			"action_code": action, "target_type": targetType, "target_id": targetID,
			"old_values": jsonRawOrNil(oldV), "new_values": jsonRawOrNil(newV),
			"created_at": created, "summary": action + " " + targetType,
		})
	}
	response.OK(w, map[string]any{"items": list, "tenant_id": *c.TenantID}, "OK")
}

func jsonRawOrNil(b []byte) any {
	if len(b) == 0 {
		return nil
	}
	return b
}
