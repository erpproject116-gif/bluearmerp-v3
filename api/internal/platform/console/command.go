package console

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func (s *service) commandOverview(w http.ResponseWriter, r *http.Request) {
	tu, _ := auth.FromContext(r.Context())
	ctx := r.Context()

	var openTickets, trialEnding, inactiveTrials, openFollowUps, pendingInvites int
	var overdueFollowUps, productGapTickets, noDocsTrials, churnRisk, pendingApprovals int
	var awaitingDay1Payment int
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
		select count(*) from public.platform_follow_up_tasks
		where stage in ('open','in_progress') and due_at is not null and due_at < now()`).Scan(&overdueFollowUps)
	_ = s.pool.QueryRow(ctx, `
		select count(*) from public.platform_user_invites
		where accepted_at is null and revoked_at is null and expires_at > now()`).Scan(&pendingInvites)
	_ = s.pool.QueryRow(ctx, `
		select count(*) from public.tenants where status = 'pending_approval'`).Scan(&pendingApprovals)
	_ = s.pool.QueryRow(ctx, `
		select count(*) from public.platform_customers where commercial_status = 'awaiting_payment'`).Scan(&awaitingDay1Payment)
	_ = s.pool.QueryRow(ctx, `
		select count(*) from public.sup_support_tickets
		where status in ('open','in_progress','waiting') and coalesce(product_gap_tag,'') <> ''`).Scan(&productGapTickets)
	_ = s.pool.QueryRow(ctx, `
		select count(distinct pc.id)
		from public.platform_customers pc
		join public.platform_subscriptions ps on ps.customer_id = pc.id
		join public.tenants t on t.id = pc.tenant_id
		where ps.status = 'trialing'
		  and t.created_at < now() - interval '7 days'
		  and not exists (
		    select 1 from public.sa_sales s where s.tenant_id = pc.tenant_id and s.deleted_at is null
		  )
		  and not exists (
		    select 1 from public.gr_goods_receipts g where g.tenant_id = pc.tenant_id
		  )`).Scan(&noDocsTrials)
	_ = s.pool.QueryRow(ctx, `
		select count(distinct pc.id)
		from public.platform_customers pc
		join public.platform_subscriptions ps on ps.customer_id = pc.id
		where ps.status = 'trialing'
		  and (
		    (ps.ends_at is not null and ps.ends_at <= now() + interval '3 days')
		    or (
		      pc.tenant_id is not null
		      and not exists (
		        select 1 from public.audit_logs al
		        where al.tenant_id = pc.tenant_id and al.created_at > now() - interval '14 days'
		      )
		    )
		  )`).Scan(&churnRisk)

	type queueRow struct {
		Kind       string  `json:"kind"`
		Title      string  `json:"title"`
		CustomerID *int64  `json:"customer_id,omitempty"`
		TenantID   *int64  `json:"tenant_id,omitempty"`
		Ref        string  `json:"ref,omitempty"`
		DueAt      *string `json:"due_at,omitempty"`
		Href       string  `json:"href,omitempty"`
		Severity   string  `json:"severity,omitempty"`
	}
	queue := []queueRow{}

	srows, err := s.pool.Query(ctx, `
		select pc.id, coalesce(pc.company_name, pc.full_name, pc.email), ps.ends_at
		from public.platform_customers pc
		join public.platform_subscriptions ps on ps.customer_id = pc.id
		where ps.status = 'trialing' and ps.ends_at is not null and ps.ends_at <= now() + interval '3 days'
		order by ps.ends_at
		limit 8`)
	if err == nil {
		defer srows.Close()
		for srows.Next() {
			var cid int64
			var name string
			var ends *time.Time
			if srows.Scan(&cid, &name, &ends) == nil {
				var dueStr *string
				if ends != nil {
					ds := ends.UTC().Format(time.RFC3339)
					dueStr = &ds
				}
				cidCopy := cid
				queue = append(queue, queueRow{
					Kind: "trial_ending", Title: "Trial ending soon — " + name,
					CustomerID: &cidCopy, DueAt: dueStr, Severity: "high",
					Href: "/app/platform-command/customers/" + strconv.FormatInt(cid, 10),
				})
			}
		}
	}

	nrows, err := s.pool.Query(ctx, `
		select pc.id, coalesce(pc.company_name, pc.full_name, pc.email)
		from public.platform_customers pc
		join public.platform_subscriptions ps on ps.customer_id = pc.id
		join public.tenants t on t.id = pc.tenant_id
		where ps.status = 'trialing'
		  and t.created_at < now() - interval '7 days'
		  and not exists (select 1 from public.sa_sales s where s.tenant_id = pc.tenant_id and s.deleted_at is null)
		  and not exists (select 1 from public.gr_goods_receipts g where g.tenant_id = pc.tenant_id)
		order by t.created_at
		limit 8`)
	if err == nil {
		defer nrows.Close()
		for nrows.Next() {
			var cid int64
			var name string
			if nrows.Scan(&cid, &name) == nil {
				cidCopy := cid
				queue = append(queue, queueRow{
					Kind: "no_documents", Title: "No sell/receive docs yet — " + name,
					CustomerID: &cidCopy, Severity: "medium",
					Href: "/app/platform-command/customers/" + strconv.FormatInt(cid, 10),
				})
			}
		}
	}

	rows, err := s.pool.Query(ctx, `
		select t.id, t.ticket_no, t.subject, t.tenant_id, pc.id, coalesce(t.product_gap_tag,'')
		from public.sup_support_tickets t
		left join lateral (
		  select id from public.platform_customers
		  where tenant_id = t.tenant_id
		  order by id
		  limit 1
		) pc on true
		where t.status in ('open','in_progress','waiting')
		order by
		  case when coalesce(t.product_gap_tag,'') <> '' then 0 else 1 end,
		  t.updated_at desc nulls last, t.created_at desc
		limit 15`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var tid, tenantID int64
			var ticketNo, subject, gap string
			var customerID *int64
			if rows.Scan(&tid, &ticketNo, &subject, &tenantID, &customerID, &gap) == nil {
				title := ticketNo + " — " + subject
				sev := "medium"
				if gap != "" {
					title = "[Gap: " + gap + "] " + title
					sev = "high"
				}
				queue = append(queue, queueRow{
					Kind: "ticket", Title: title,
					CustomerID: customerID, TenantID: &tenantID, Ref: ticketNo, Severity: sev,
					Href: "/app/platform-command/tickets/" + strconv.FormatInt(tid, 10),
				})
			}
		}
	}

	drows, err := s.pool.Query(ctx, `
		select pc.id, coalesce(pc.company_name, pc.full_name, pc.email), pc.day1_completed_at
		from public.platform_customers pc
		where pc.commercial_status = 'awaiting_payment'
		order by coalesce(pc.day1_completed_at, pc.updated_at) desc nulls last
		limit 8`)
	if err == nil {
		defer drows.Close()
		for drows.Next() {
			var cid int64
			var name string
			var completed *time.Time
			if drows.Scan(&cid, &name, &completed) == nil {
				var dueStr *string
				if completed != nil {
					ds := completed.UTC().Format(time.RFC3339)
					dueStr = &ds
				}
				cidCopy := cid
				queue = append(queue, queueRow{
					Kind: "day1_payment", Title: "Day 1 payment — " + name,
					CustomerID: &cidCopy, DueAt: dueStr, Severity: "high",
					Href: "/app/platform-command/day1-payments",
				})
			}
		}
	}

	frows, err := s.pool.Query(ctx, `
		select id, title, platform_customer_id, tenant_id, due_at
		from public.platform_follow_up_tasks
		where stage in ('open','in_progress')
		order by
		  case when due_at is not null and due_at < now() then 0 else 1 end,
		  due_at nulls last, created_at desc
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
				sev := "low"
				if dueAt != nil {
					ds := dueAt.UTC().Format(time.RFC3339)
					dueStr = &ds
					if dueAt.Before(time.Now()) {
						sev = "high"
						title = "OVERDUE — " + title
					}
				}
				cid := customerID
				queue = append(queue, queueRow{
					Kind: "follow_up", Title: title, CustomerID: &cid, TenantID: tenantID,
					DueAt: dueStr, Severity: sev,
					Href: "/app/platform-command/customers/" + strconv.FormatInt(customerID, 10),
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
			"open_tickets":           openTickets,
			"trial_ending":           trialEnding,
			"inactive_trials":        inactiveTrials,
			"open_follow_ups":        openFollowUps,
			"overdue_follow_ups":     overdueFollowUps,
			"pending_invites":        pendingInvites,
			"pending_approvals":      pendingApprovals,
			"awaiting_day1_payment":  awaitingDay1Payment,
			"product_gap_tickets":    productGapTickets,
			"no_docs_trials":         noDocsTrials,
			"churn_risk":             churnRisk,
		},
		"queue": queue,
	}, "OK")
}

// computeCustomerHealth returns 0–100 score and signal labels for Customer 360.
func (s *service) computeCustomerHealth(ctx context.Context, customerID int64, tenantID *int64) (int, []map[string]string, map[string]any) {
	score := 100
	signals := []map[string]string{}
	usage := map[string]any{}

	var planKind, subStatus *string
	var endsAt *time.Time
	_ = s.pool.QueryRow(ctx, `
		select plan_kind, status, ends_at from public.platform_subscriptions
		where customer_id = $1 order by created_at desc limit 1`, customerID).
		Scan(&planKind, &subStatus, &endsAt)
	usage["subscription_status"] = subStatus
	usage["plan_kind"] = planKind
	usage["ends_at"] = endsAt

	if subStatus != nil && *subStatus == "trialing" && endsAt != nil {
		days := int(time.Until(*endsAt).Hours() / 24)
		usage["trial_days_left"] = days
		if days <= 3 {
			score -= 25
			signals = append(signals, map[string]string{"code": "trial_ending", "label": "Trial ends in ≤3 days", "severity": "high"})
		} else if days <= 14 {
			score -= 10
			signals = append(signals, map[string]string{"code": "trial_window", "label": "Trial ending within 14 days", "severity": "medium"})
		}
	}

	var openTickets, openFollowUps int
	if tenantID != nil {
		_ = s.pool.QueryRow(ctx, `
			select count(*) from public.sup_support_tickets
			where tenant_id = $1 and status in ('open','in_progress','waiting')`, *tenantID).Scan(&openTickets)
	}
	_ = s.pool.QueryRow(ctx, `
		select count(*) from public.platform_follow_up_tasks
		where platform_customer_id = $1 and stage in ('open','in_progress')`, customerID).Scan(&openFollowUps)
	usage["open_tickets"] = openTickets
	usage["open_follow_ups"] = openFollowUps
	if openTickets > 0 {
		pen := openTickets * 8
		if pen > 24 {
			pen = 24
		}
		score -= pen
		signals = append(signals, map[string]string{"code": "open_tickets", "label": "Open support tickets", "severity": "medium"})
	}

	if tenantID != nil {
		var lastAudit *time.Time
		_ = s.pool.QueryRow(ctx, `
			select max(created_at) from public.audit_logs where tenant_id = $1`, *tenantID).Scan(&lastAudit)
		usage["last_activity_at"] = lastAudit
		if lastAudit == nil || lastAudit.Before(time.Now().Add(-7*24*time.Hour)) {
			score -= 20
			signals = append(signals, map[string]string{"code": "inactive", "label": "No activity in 7+ days", "severity": "high"})
		}

		var sales, gr int
		_ = s.pool.QueryRow(ctx, `select count(*) from public.sa_sales where tenant_id = $1 and deleted_at is null`, *tenantID).Scan(&sales)
		_ = s.pool.QueryRow(ctx, `select count(*) from public.gr_goods_receipts where tenant_id = $1`, *tenantID).Scan(&gr)
		usage["sales_count"] = sales
		usage["gr_count"] = gr
		var tenantAgeDays int
		_ = s.pool.QueryRow(ctx, `
			select greatest(0, floor(extract(epoch from (now() - created_at))/86400)::int)
			from public.tenants where id = $1`, *tenantID).Scan(&tenantAgeDays)
		usage["tenant_age_days"] = tenantAgeDays
		if tenantAgeDays >= 7 && sales == 0 && gr == 0 {
			score -= 15
			signals = append(signals, map[string]string{"code": "no_docs", "label": "No sales or goods receipts after 7 days", "severity": "medium"})
		}

		var done, total int
		_ = s.pool.QueryRow(ctx, `
			select
			  count(*) filter (where status in ('done','auto','skipped')),
			  count(*)
			from public.platform_cs_playbook_steps where platform_customer_id = $1`, customerID).Scan(&done, &total)
		onboardingPct := 0
		if total > 0 {
			onboardingPct = (done * 100) / total
		}
		usage["cs_playbook_percent"] = onboardingPct
		if total > 0 && onboardingPct < 50 {
			score -= 10
			signals = append(signals, map[string]string{"code": "playbook_lag", "label": "CS playbook under 50%", "severity": "low"})
		}
	} else {
		score -= 30
		signals = append(signals, map[string]string{"code": "no_tenant", "label": "No workspace linked yet", "severity": "high"})
	}

	if score < 0 {
		score = 0
	}
	if score > 100 {
		score = 100
	}
	return score, signals, usage
}
