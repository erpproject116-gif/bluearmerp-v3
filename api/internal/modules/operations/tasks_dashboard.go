package operations

import (
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type namedCount struct {
	Key   string `json:"key"`
	Count int64  `json:"count"`
}

type taskListItem struct {
	ID             int64   `json:"id"`
	Title          string  `json:"title"`
	Status         string  `json:"status"`
	Priority       string  `json:"priority"`
	EndDate        *string `json:"end_date,omitempty"`
	AssigneeUserID *int64  `json:"assignee_user_id,omitempty"`
	AssigneeName   string  `json:"assignee_name,omitempty"`
	Overdue        bool    `json:"overdue"`
}

type tasksDashboardSummary struct {
	MyOpen               int64          `json:"my_open"`
	MyOverdue            int64          `json:"my_overdue"`
	WorkspaceOverdue     int64          `json:"workspace_overdue"`
	DueThisWeek          int64          `json:"due_this_week"`
	ByStatus             []namedCount   `json:"by_status"`
	ByPriority           []namedCount   `json:"by_priority"`
	OverdueOrSoon        []taskListItem `json:"overdue_or_soon"`
	CrmFollowUpsOpen     int64          `json:"crm_follow_ups_open"`
	CrmFollowUpsDeepLink string         `json:"crm_follow_ups_deep_link"`
}

func tasksDashboardSummaryHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		wsID, err := strconv.ParseInt(r.URL.Query().Get("workspace_id"), 10, 64)
		if err != nil || wsID <= 0 {
			response.Validation(w, map[string]string{"workspace_id": "Required."})
			return
		}
		if !workspaceBelongsToTenant(r.Context(), pool, tu.TenantID, wsID) {
			response.Err(w, http.StatusNotFound, "Workspace not found.", "ERR_NOT_FOUND")
			return
		}

		ctx := r.Context()
		out := tasksDashboardSummary{
			ByStatus:             []namedCount{},
			ByPriority:           []namedCount{},
			OverdueOrSoon:        []taskListItem{},
			CrmFollowUpsDeepLink: "/app/crm/follow-up-tasks",
		}

		_ = pool.QueryRow(ctx, `
			select count(*)::bigint
			from public.wm_work_items
			where tenant_id = $1 and workspace_id = $2
			  and assignee_user_id = $3
			  and status <> 'done'`,
			tu.TenantID, wsID, tu.AppUserID).Scan(&out.MyOpen)

		_ = pool.QueryRow(ctx, `
			select count(*)::bigint
			from public.wm_work_items
			where tenant_id = $1 and workspace_id = $2
			  and assignee_user_id = $3
			  and status <> 'done'
			  and end_date is not null and end_date < current_date`,
			tu.TenantID, wsID, tu.AppUserID).Scan(&out.MyOverdue)

		_ = pool.QueryRow(ctx, `
			select count(*)::bigint
			from public.wm_work_items
			where tenant_id = $1 and workspace_id = $2
			  and status <> 'done'
			  and end_date is not null and end_date < current_date`,
			tu.TenantID, wsID).Scan(&out.WorkspaceOverdue)

		_ = pool.QueryRow(ctx, `
			select count(*)::bigint
			from public.wm_work_items
			where tenant_id = $1 and workspace_id = $2
			  and status <> 'done'
			  and end_date is not null
			  and end_date >= current_date
			  and end_date < (current_date + interval '7 days')::date`,
			tu.TenantID, wsID).Scan(&out.DueThisWeek)

		statusRows, err := pool.Query(ctx, `
			select status, count(*)::bigint
			from public.wm_work_items
			where tenant_id = $1 and workspace_id = $2
			group by status
			order by status`, tu.TenantID, wsID)
		if err == nil {
			defer statusRows.Close()
			seen := map[string]int64{}
			for statusRows.Next() {
				var row namedCount
				if statusRows.Scan(&row.Key, &row.Count) == nil {
					seen[row.Key] = row.Count
				}
			}
			for _, key := range []string{"open", "in_progress", "done", "blocked"} {
				out.ByStatus = append(out.ByStatus, namedCount{Key: key, Count: seen[key]})
			}
		}

		priRows, err := pool.Query(ctx, `
			select priority, count(*)::bigint
			from public.wm_work_items
			where tenant_id = $1 and workspace_id = $2
			group by priority
			order by priority`, tu.TenantID, wsID)
		if err == nil {
			defer priRows.Close()
			seen := map[string]int64{}
			for priRows.Next() {
				var row namedCount
				if priRows.Scan(&row.Key, &row.Count) == nil {
					seen[row.Key] = row.Count
				}
			}
			for _, key := range []string{"low", "normal", "high", "urgent"} {
				out.ByPriority = append(out.ByPriority, namedCount{Key: key, Count: seen[key]})
			}
		}

		itemRows, err := pool.Query(ctx, `
			select wi.id, wi.title, wi.status, wi.priority,
			  wi.end_date::text, wi.assignee_user_id, coalesce(u.full_name, ''),
			  (wi.end_date is not null and wi.end_date < current_date) as overdue
			from public.wm_work_items wi
			left join public.users u on u.id = wi.assignee_user_id
			where wi.tenant_id = $1 and wi.workspace_id = $2
			  and wi.status <> 'done'
			  and wi.end_date is not null
			  and wi.end_date < (current_date + interval '7 days')::date
			order by wi.end_date asc nulls last, wi.priority desc, wi.id
			limit 50`, tu.TenantID, wsID)
		if err == nil {
			defer itemRows.Close()
			for itemRows.Next() {
				var row taskListItem
				if itemRows.Scan(
					&row.ID, &row.Title, &row.Status, &row.Priority,
					&row.EndDate, &row.AssigneeUserID, &row.AssigneeName, &row.Overdue,
				) == nil {
					out.OverdueOrSoon = append(out.OverdueOrSoon, row)
				}
			}
		}

		_ = pool.QueryRow(ctx, `
			select count(*)::bigint
			from public.crm_follow_up_tasks t
			where t.tenant_id = $1
			  and t.stage in ('scheduled', 'due_soon', 'overdue')
			  and (t.pic_user_id = $2 or t.created_by_user_id = $2)`,
			tu.TenantID, tu.AppUserID).Scan(&out.CrmFollowUpsOpen)

		w.Header().Set("Cache-Control", "private, max-age=30")
		response.OK(w, out, "OK")
	}
}
