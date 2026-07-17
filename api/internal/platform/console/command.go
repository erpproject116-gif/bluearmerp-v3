package console

import (
	"net/http"
	"time"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func (s *service) commandOverview(w http.ResponseWriter, r *http.Request) {
	tu, _ := auth.FromContext(r.Context())
	ctx := r.Context()

	var openTickets, trialEnding, inactiveTrials, openFollowUps, pendingInvites int
	_ = s.pool.QueryRow(ctx, `
		select count(*) from public.sup_support_tickets
		where status in ('open','in_progress','waiting')`).Scan(&openTickets)
	_ = s.pool.QueryRow(ctx, `
		select count(*) from public.platform_subscriptions
		where status = 'trialing' and ends_at is not null and ends_at <= now() + interval '14 days'`).Scan(&trialEnding)
	_ = s.pool.QueryRow(ctx, `
		select count(distinct pc.id)
		from public.platform_customers pc
		join public.platform_subscriptions ps on ps.customer_id = pc.id
		where ps.status = 'trialing'
		  and pc.tenant_id is not null
		  and not exists (
		    select 1 from public.audit_logs al
		    where al.tenant_id = pc.tenant_id and al.created_at > now() - interval '7 days'
		  )`).Scan(&inactiveTrials)
	_ = s.pool.QueryRow(ctx, `
		select count(*) from public.platform_follow_up_tasks
		where stage in ('open','in_progress')`).Scan(&openFollowUps)
	_ = s.pool.QueryRow(ctx, `
		select count(*) from public.platform_user_invites
		where accepted_at is null and revoked_at is null and expires_at > now()`).Scan(&pendingInvites)

	type queueRow struct {
		Kind       string `json:"kind"`
		Title      string `json:"title"`
		CustomerID *int64 `json:"customer_id,omitempty"`
		TenantID   *int64 `json:"tenant_id,omitempty"`
		Ref        string `json:"ref,omitempty"`
		DueAt      *string `json:"due_at,omitempty"`
	}
	queue := []queueRow{}

	rows, err := s.pool.Query(ctx, `
		select t.id, t.ticket_no, t.subject, t.tenant_id, pc.id
		from public.sup_support_tickets t
		left join public.platform_customers pc on pc.tenant_id = t.tenant_id
		where t.status in ('open','in_progress','waiting')
		order by t.updated_at desc nulls last, t.created_at desc
		limit 15`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var tid, tenantID int64
			var ticketNo, subject string
			var customerID *int64
			if rows.Scan(&tid, &ticketNo, &subject, &tenantID, &customerID) == nil {
				queue = append(queue, queueRow{
					Kind: "ticket", Title: ticketNo + " — " + subject,
					CustomerID: customerID, TenantID: &tenantID, Ref: ticketNo,
				})
			}
		}
	}

	frows, err := s.pool.Query(ctx, `
		select id, title, platform_customer_id, tenant_id, due_at
		from public.platform_follow_up_tasks
		where stage in ('open','in_progress')
		order by due_at nulls last, created_at desc
		limit 10`)
	if err == nil {
		defer frows.Close()
		for frows.Next() {
			var id, customerID int64
			var tenantID *int64
			var title string
			var dueAt *time.Time
			if frows.Scan(&id, &title, &customerID, &tenantID, &dueAt) == nil {
				var dueStr *string
				if dueAt != nil {
					s := dueAt.UTC().Format(time.RFC3339)
					dueStr = &s
				}
				cid := customerID
				queue = append(queue, queueRow{
					Kind: "follow_up", Title: title, CustomerID: &cid, TenantID: tenantID, DueAt: dueStr,
				})
			}
		}
	}

	response.OK(w, map[string]any{
		"actor": map[string]any{
			"email": tu.Email, "full_name": tu.FullName,
			"platform_role": tu.PlatformRole, "platform_user_id": tu.PlatformUserID,
		},
		"counts": map[string]any{
			"open_tickets":     openTickets,
			"trial_ending":     trialEnding,
			"inactive_trials":  inactiveTrials,
			"open_follow_ups":  openFollowUps,
			"pending_invites":  pendingInvites,
		},
		"queue": queue,
	}, "OK")
}
