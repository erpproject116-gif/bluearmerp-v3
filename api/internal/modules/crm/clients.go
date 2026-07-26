package crm

import (
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type clientHealthRow struct {
	PartnerID          int64    `json:"partner_id"`
	PartnerCode        string   `json:"partner_code"`
	CompanyName        string   `json:"company_name"`
	OpenARBalance      float64  `json:"open_ar_balance"`
	CreditLimit        *float64 `json:"credit_limit,omitempty"`
	CreditLimitOnHold  bool     `json:"credit_limit_on_hold"`
	OpenFollowUps      int64    `json:"open_follow_ups"`
	OverdueFollowUps   int64    `json:"overdue_follow_ups"`
	OpenWorkItems      int64    `json:"open_work_items"`
	OverdueWorkItems   int64    `json:"overdue_work_items"`
	LastActivityDate   *string  `json:"last_activity_date,omitempty"`
	DaysSinceActivity  *int     `json:"days_since_activity,omitempty"`
	HealthScore        int      `json:"health_score"`
}

type clientHealthDetail struct {
	clientHealthRow
	FollowUpIDs []int64 `json:"follow_up_ids"`
	WorkItemIDs []int64 `json:"work_item_ids"`
}

func registerClientsRoutes(r chi.Router, pool *pgxpool.Pool) {
	cr := r.With(auth.RequirePermission("crm.clients", auth.AccessRead))
	cr.Get("/clients/health-summary", clientsHealthSummary(pool))
	cr.Get("/clients/{partnerId}/health", clientHealthDetailHandler(pool))
}

func clientsHealthSummary(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "company_name", map[string]string{
			"company_name":    "company_name",
			"open_ar_balance": "open_ar_balance",
		})
		offset := httputil.Offset(p)
		ctx := r.Context()
		args := []any{tu.TenantID}
		n := 2
		whereExtra := ""
		if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
			whereExtra = fmt.Sprintf(" and (p.company_name ilike $%d or p.partner_code ilike $%d)", n, n)
			args = append(args, "%"+q+"%")
			n++
		}
		limitArg, offsetArg := n, n+1
		args = append(args, p.PageSize, offset)

		q := fmt.Sprintf(`
			select partner_id, partner_code, company_name, open_ar_balance, credit_limit, credit_limit_on_hold,
			  open_follow_ups, overdue_follow_ups, open_work_items, overdue_work_items,
			  last_activity_date, days_since_activity, total_count
			from (
			  select p.id as partner_id,
			    p.partner_code,
			    p.company_name,
			    coalesce(ar.open_balance, 0)::float8 as open_ar_balance,
			    p.credit_limit::float8 as credit_limit,
			    coalesce(p.credit_limit_on_hold, false) as credit_limit_on_hold,
			    coalesce(fu.open_count, 0)::bigint as open_follow_ups,
			    coalesce(fu.overdue_count, 0)::bigint as overdue_follow_ups,
			    coalesce(wi.open_count, 0)::bigint as open_work_items,
			    coalesce(wi.overdue_count, 0)::bigint as overdue_work_items,
			    act.last_activity_date::text as last_activity_date,
			    case when act.last_activity_date is null then null
			      else (current_date - act.last_activity_date)::int end as days_since_activity,
			    count(*) over() as total_count
			  from public.inv_partners p
			  left join lateral (
			    select coalesce(sum(s.grand_total - coalesce(recv.received, 0)), 0)::float8 as open_balance
			    from public.sa_sales s
			    left join lateral (
			      select coalesce(sum(a.applied_amount), 0)::float8 as received
			      from public.fin_receipt_applications a
			      join public.fin_official_receipts rcp on rcp.id = a.official_receipt_id
			      where a.sales_id = s.id and rcp.deleted_at is null
			    ) recv on true
			    where s.tenant_id = p.tenant_id and s.partner_id = p.id and s.deleted_at is null
			  ) ar on true
			  left join lateral (
			    select
			      count(*) filter (where stage in ('scheduled','due_soon','overdue'))::bigint as open_count,
			      count(*) filter (where stage = 'overdue')::bigint as overdue_count
			    from public.crm_follow_up_tasks t
			    where t.tenant_id = p.tenant_id and t.partner_id = p.id
			  ) fu on true
			  left join lateral (
			    select
			      count(*) filter (where status <> 'done')::bigint as open_count,
			      count(*) filter (
			        where status <> 'done' and end_date is not null and end_date < current_date
			      )::bigint as overdue_count
			    from public.wm_work_items wi
			    where wi.tenant_id = p.tenant_id and wi.partner_id = p.id
			  ) wi on true
			  left join lateral (
			    select max(d)::date as last_activity_date
			    from (
			      select max(q.order_date) as d from public.quo_quotations q
			      where q.tenant_id = p.tenant_id and q.partner_id = p.id and q.deleted_at is null
			      union all
			      select max(s.order_date) from public.sa_sales s
			      where s.tenant_id = p.tenant_id and s.partner_id = p.id and s.deleted_at is null
			      union all
			      select max(so.order_date) from public.so_sales_orders so
			      where so.tenant_id = p.tenant_id and so.partner_id = p.id and so.deleted_at is null
			    ) dates
			  ) act on true
			  where p.tenant_id = $1 and p.deleted_at is null
			    and p.partner_kind in ('customer', 'both')%s
			) ranked
			order by %s %s
			limit $%d offset $%d`, whereExtra, p.Sort, orderSQLClients(p.Order), limitArg, offsetArg)

		rows, err := pool.Query(ctx, q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load client health.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []clientHealthRow
		var total int64
		for rows.Next() {
			var row clientHealthRow
			if err := rows.Scan(
				&row.PartnerID, &row.PartnerCode, &row.CompanyName, &row.OpenARBalance,
				&row.CreditLimit, &row.CreditLimitOnHold,
				&row.OpenFollowUps, &row.OverdueFollowUps,
				&row.OpenWorkItems, &row.OverdueWorkItems,
				&row.LastActivityDate, &row.DaysSinceActivity, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read client health.", "ERR_INTERNAL")
				return
			}
			row.HealthScore = computeClientHealthScore(row)
			out = append(out, row)
		}
		if out == nil {
			out = []clientHealthRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func clientHealthDetailHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		partnerID, err := strconv.ParseInt(chi.URLParam(r, "partnerId"), 10, 64)
		if err != nil || partnerID <= 0 {
			response.Validation(w, map[string]string{"partnerId": "Invalid id."})
			return
		}
		ctx := r.Context()
		var row clientHealthDetail
		err = pool.QueryRow(ctx, `
			select p.id, p.partner_code, p.company_name,
			  coalesce(ar.open_balance, 0)::float8,
			  p.credit_limit::float8,
			  coalesce(p.credit_limit_on_hold, false),
			  coalesce(fu.open_count, 0)::bigint,
			  coalesce(fu.overdue_count, 0)::bigint,
			  coalesce(wi.open_count, 0)::bigint,
			  coalesce(wi.overdue_count, 0)::bigint,
			  act.last_activity_date::text,
			  case when act.last_activity_date is null then null
			    else (current_date - act.last_activity_date)::int end
			from public.inv_partners p
			left join lateral (
			  select coalesce(sum(s.grand_total - coalesce(recv.received, 0)), 0)::float8 as open_balance
			  from public.sa_sales s
			  left join lateral (
			    select coalesce(sum(a.applied_amount), 0)::float8 as received
			    from public.fin_receipt_applications a
			    join public.fin_official_receipts rcp on rcp.id = a.official_receipt_id
			    where a.sales_id = s.id and rcp.deleted_at is null
			  ) recv on true
			  where s.tenant_id = p.tenant_id and s.partner_id = p.id and s.deleted_at is null
			) ar on true
			left join lateral (
			  select
			    count(*) filter (where stage in ('scheduled','due_soon','overdue'))::bigint as open_count,
			    count(*) filter (where stage = 'overdue')::bigint as overdue_count
			  from public.crm_follow_up_tasks t
			  where t.tenant_id = p.tenant_id and t.partner_id = p.id
			) fu on true
			left join lateral (
			  select
			    count(*) filter (where status <> 'done')::bigint as open_count,
			    count(*) filter (
			      where status <> 'done' and end_date is not null and end_date < current_date
			    )::bigint as overdue_count
			  from public.wm_work_items wi
			  where wi.tenant_id = p.tenant_id and wi.partner_id = p.id
			) wi on true
			left join lateral (
			  select max(d)::date as last_activity_date
			  from (
			    select max(q.order_date) as d from public.quo_quotations q
			    where q.tenant_id = p.tenant_id and q.partner_id = p.id and q.deleted_at is null
			    union all
			    select max(s.order_date) from public.sa_sales s
			    where s.tenant_id = p.tenant_id and s.partner_id = p.id and s.deleted_at is null
			    union all
			    select max(so.order_date) from public.so_sales_orders so
			    where so.tenant_id = p.tenant_id and so.partner_id = p.id and so.deleted_at is null
			  ) dates
			) act on true
			where p.id = $1 and p.tenant_id = $2 and p.deleted_at is null
			  and p.partner_kind in ('customer', 'both')`,
			partnerID, tu.TenantID,
		).Scan(
			&row.PartnerID, &row.PartnerCode, &row.CompanyName, &row.OpenARBalance,
			&row.CreditLimit, &row.CreditLimitOnHold,
			&row.OpenFollowUps, &row.OverdueFollowUps,
			&row.OpenWorkItems, &row.OverdueWorkItems,
			&row.LastActivityDate, &row.DaysSinceActivity,
		)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Client not found.", "ERR_NOT_FOUND")
			return
		}
		row.HealthScore = computeClientHealthScore(row.clientHealthRow)
		row.FollowUpIDs = []int64{}
		row.WorkItemIDs = []int64{}

		fuRows, _ := pool.Query(ctx, `
			select id from public.crm_follow_up_tasks
			where tenant_id = $1 and partner_id = $2
			  and stage in ('scheduled','due_soon','overdue')
			order by due_date asc limit 20`, tu.TenantID, partnerID)
		if fuRows != nil {
			defer fuRows.Close()
			for fuRows.Next() {
				var id int64
				if fuRows.Scan(&id) == nil {
					row.FollowUpIDs = append(row.FollowUpIDs, id)
				}
			}
		}
		wiRows, _ := pool.Query(ctx, `
			select id from public.wm_work_items
			where tenant_id = $1 and partner_id = $2 and status <> 'done'
			order by end_date asc nulls last limit 20`, tu.TenantID, partnerID)
		if wiRows != nil {
			defer wiRows.Close()
			for wiRows.Next() {
				var id int64
				if wiRows.Scan(&id) == nil {
					row.WorkItemIDs = append(row.WorkItemIDs, id)
				}
			}
		}

		w.Header().Set("Cache-Control", "private, max-age=30")
		response.OK(w, row, "OK")
	}
}

// computeClientHealthScore is a fixed rule table (not ML). See ops-intelligence-dashboards runbook.
func computeClientHealthScore(row clientHealthRow) int {
	score := 100.0
	if row.OpenARBalance > 0.0001 {
		score -= 25
	}
	if row.CreditLimitOnHold {
		score -= 15
	}
	overdueTasks := row.OverdueFollowUps + row.OverdueWorkItems
	if overdueTasks > 0 {
		score -= math.Min(30, float64(overdueTasks)*10)
	}
	if row.DaysSinceActivity != nil {
		if *row.DaysSinceActivity > 180 {
			score -= 35
		} else if *row.DaysSinceActivity > 90 {
			score -= 25
		}
	} else {
		// Never had commercial activity — mild penalty.
		score -= 10
	}
	if score < 0 {
		score = 0
	}
	if score > 100 {
		score = 100
	}
	return int(math.Round(score))
}

func orderSQLClients(order string) string {
	if order == "desc" {
		return "desc"
	}
	return "asc"
}