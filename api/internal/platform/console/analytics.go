package console

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/usage"
)

func (s *service) analyticsOverview(w http.ResponseWriter, r *http.Request) {
	_, _ = usage.FinalizeAbandoned(r.Context(), s.pool)

	days := 14
	if raw := strings.TrimSpace(r.URL.Query().Get("days")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n >= 1 && n <= 90 {
			days = n
		}
	}

	var sessions, pageViews, uniqueUsers int
	var activeSeconds, idleSeconds int64
	_ = s.pool.QueryRow(r.Context(), `
		select coalesce(sum(sessions),0), coalesce(sum(page_views),0),
		       coalesce(sum(active_seconds),0), coalesce(sum(idle_seconds),0)
		from public.app_usage_daily
		where day >= (current_date - $1::int)`, days).
		Scan(&sessions, &pageViews, &activeSeconds, &idleSeconds)
	_ = s.pool.QueryRow(r.Context(), `
		select count(distinct user_id) from public.app_usage_sessions
		where started_at >= now() - ($1::int * interval '1 day')`, days).Scan(&uniqueUsers)

	var activeNow, abandoned24h int
	_ = s.pool.QueryRow(r.Context(), `
		select count(*) from public.app_usage_sessions
		where ended_at is null and last_heartbeat_at >= now() - interval '3 minutes'`).Scan(&activeNow)
	_ = s.pool.QueryRow(r.Context(), `
		select count(*) from public.app_usage_sessions
		where end_reason = 'expired' and ended_at >= now() - interval '24 hours'`).Scan(&abandoned24h)

	trend := []map[string]any{}
	rows, err := s.pool.Query(r.Context(), `
		select day::text, coalesce(sum(sessions),0), coalesce(sum(page_views),0),
		       coalesce(sum(active_seconds),0), coalesce(sum(unique_users),0)
		from public.app_usage_daily
		where day >= (current_date - $1::int)
		group by day
		order by day`, days)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var day string
			var sess, views, users int
			var active int64
			if rows.Scan(&day, &sess, &views, &active, &users) == nil {
				trend = append(trend, map[string]any{
					"day": day, "sessions": sess, "page_views": views,
					"active_seconds": active, "unique_users": users,
				})
			}
		}
	}

	topPages := []map[string]any{}
	prows, err := s.pool.Query(r.Context(), `
		select coalesce(nullif(route_pattern,''), route_path) as pattern,
		       coalesce(max(page_label), '') as label,
		       count(*)::int as views,
		       coalesce(sum(active_seconds),0)::bigint as active_seconds
		from public.app_usage_page_visits
		where entered_at >= now() - ($1::int * interval '1 day')
		group by 1
		order by views desc
		limit 20`, days)
	if err == nil {
		defer prows.Close()
		for prows.Next() {
			var pattern, label string
			var views int
			var active int64
			if prows.Scan(&pattern, &label, &views, &active) == nil {
				topPages = append(topPages, map[string]any{
					"route_pattern": pattern, "page_label": label,
					"views": views, "active_seconds": active,
				})
			}
		}
	}

	// Per-customer engagement so staff can see who the usage belongs to.
	customers := []map[string]any{}
	crows, err := s.pool.Query(r.Context(), `
		select s.tenant_id,
		       coalesce(t.company_name, '') as company_name,
		       coalesce(t.company_code, '') as company_code,
		       pc.id as customer_id,
		       coalesce(pc.company_name, pc.full_name, pc.email, '') as customer_name,
		       count(*)::int as sessions,
		       count(distinct s.user_id)::int as unique_users,
		       coalesce(sum(s.page_view_count),0)::int as page_views,
		       coalesce(sum(s.active_seconds),0)::bigint as active_seconds,
		       coalesce(sum(s.idle_seconds),0)::bigint as idle_seconds,
		       max(s.last_activity_at) as last_activity_at
		from public.app_usage_sessions s
		join public.tenants t on t.id = s.tenant_id
		left join lateral (
		  select id, company_name, full_name, email
		  from public.platform_customers
		  where tenant_id = s.tenant_id
		  order by id
		  limit 1
		) pc on true
		where s.started_at >= now() - ($1::int * interval '1 day')
		group by s.tenant_id, t.company_name, t.company_code, pc.id, pc.company_name, pc.full_name, pc.email
		order by active_seconds desc
		limit 50`, days)
	if err == nil {
		defer crows.Close()
		for crows.Next() {
			var tenantID int64
			var companyName, companyCode, customerName string
			var customerID *int64
			var sess, users, views int
			var active, idle int64
			var lastAct *time.Time
			if crows.Scan(&tenantID, &companyName, &companyCode, &customerID, &customerName,
				&sess, &users, &views, &active, &idle, &lastAct) == nil {
				customers = append(customers, map[string]any{
					"tenant_id": tenantID, "company_name": companyName, "company_code": companyCode,
					"customer_id": customerID, "customer_name": customerName,
					"sessions": sess, "unique_users": users, "page_views": views,
					"active_seconds": active, "idle_seconds": idle, "last_activity_at": lastAct,
				})
			}
		}
	}

	response.OK(w, map[string]any{
		"days": days,
		"totals": map[string]any{
			"sessions": sessions, "page_views": pageViews, "unique_users": uniqueUsers,
			"active_seconds": activeSeconds, "idle_seconds": idleSeconds,
			"active_now": activeNow, "abandoned_24h": abandoned24h,
		},
		"adoption":  s.adoptionFunnel(r.Context(), days),
		"trend":     trend,
		"top_pages": topPages,
		"customers": customers,
	}, "OK")
}

func (s *service) adoptionFunnel(ctx context.Context, days int) map[string]any {
	var tenants, withLogin, withSales, withGR, withOR int
	_ = s.pool.QueryRow(ctx, `select count(*) from public.tenants where status = 'active'`).Scan(&tenants)
	_ = s.pool.QueryRow(ctx, `
		select count(distinct tenant_id) from public.app_usage_sessions
		where started_at >= now() - ($1::int * interval '1 day')`, days).Scan(&withLogin)
	_ = s.pool.QueryRow(ctx, `
		select count(distinct tenant_id) from public.sa_sales
		where deleted_at is null and created_at >= now() - ($1::int * interval '1 day')`, days).Scan(&withSales)
	_ = s.pool.QueryRow(ctx, `
		select count(distinct tenant_id) from public.gr_goods_receipts
		where created_at >= now() - ($1::int * interval '1 day')`, days).Scan(&withGR)
	_ = s.pool.QueryRow(ctx, `
		select count(distinct tenant_id) from public.fin_official_receipts
		where deleted_at is null and created_at >= now() - ($1::int * interval '1 day')`, days).Scan(&withOR)
	return map[string]any{
		"active_tenants": tenants,
		"logged_in":      withLogin,
		"first_sale":     withSales,
		"first_gr":       withGR,
		"first_or":       withOR,
		"days":           days,
	}
}

func (s *service) customerEngagement(w http.ResponseWriter, r *http.Request) {
	_, _ = usage.FinalizeAbandoned(r.Context(), s.pool)

	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	c, err := s.resolveCustomer(r.Context(), id)
	if err != nil || c.TenantID == nil {
		response.Err(w, http.StatusNotFound, "Customer tenant not found.", "ERR_NOT_FOUND")
		return
	}
	tenantID := *c.TenantID

	var lastLogin, lastLogout, lastActivity *time.Time
	var lastEndReason *string
	_ = s.pool.QueryRow(r.Context(), `
		select max(started_at) from public.app_usage_sessions where tenant_id = $1`, tenantID).Scan(&lastLogin)
	_ = s.pool.QueryRow(r.Context(), `
		select ended_at, end_reason from public.app_usage_sessions
		where tenant_id = $1 and ended_at is not null
		order by ended_at desc nulls last limit 1`, tenantID).Scan(&lastLogout, &lastEndReason)
	_ = s.pool.QueryRow(r.Context(), `
		select max(last_activity_at) from public.app_usage_sessions where tenant_id = $1`, tenantID).Scan(&lastActivity)

	var inactiveSeconds *int64
	if lastActivity != nil {
		sec := int64(time.Since(*lastActivity).Seconds())
		if sec < 0 {
			sec = 0
		}
		inactiveSeconds = &sec
	}

	users := []map[string]any{}
	urows, err := s.pool.Query(r.Context(), `
		select u.id, u.full_name, u.email,
		       (select max(s.started_at) from public.app_usage_sessions s where s.user_id = u.id) as last_login,
		       (select max(s.ended_at) from public.app_usage_sessions s where s.user_id = u.id and s.ended_at is not null) as last_logout,
		       (select max(s.last_activity_at) from public.app_usage_sessions s where s.user_id = u.id) as last_activity,
		       (select s.end_reason from public.app_usage_sessions s
		         where s.user_id = u.id and s.ended_at is not null
		         order by s.ended_at desc nulls last limit 1) as last_end_reason
		from public.users u
		where u.tenant_id = $1 and u.status = 'active'
		order by u.full_name`, tenantID)
	if err == nil {
		defer urows.Close()
		for urows.Next() {
			var uid int64
			var name, email string
			var login, logout, activity *time.Time
			var reason *string
			if urows.Scan(&uid, &name, &email, &login, &logout, &activity, &reason) == nil {
				var inactive *int64
				if activity != nil {
					sec := int64(time.Since(*activity).Seconds())
					if sec < 0 {
						sec = 0
					}
					inactive = &sec
				}
				users = append(users, map[string]any{
					"id": uid, "full_name": name, "email": email,
					"last_login_at": login, "last_logout_at": logout,
					"last_activity_at": activity, "last_end_reason": reason,
					"inactive_seconds": inactive,
				})
			}
		}
	}

	sessions := []map[string]any{}
	srows, err := s.pool.Query(r.Context(), `
		select s.id, s.user_id, coalesce(u.full_name,''), s.started_at, s.ended_at,
		       s.last_activity_at, s.active_seconds, s.idle_seconds, s.page_view_count,
		       coalesce(s.end_reason,''), s.client_session_id::text
		from public.app_usage_sessions s
		join public.users u on u.id = s.user_id
		where s.tenant_id = $1
		order by s.started_at desc
		limit 40`, tenantID)
	if err == nil {
		defer srows.Close()
		for srows.Next() {
			var sid, uid int64
			var name, reason, clientSID string
			var started time.Time
			var ended, lastAct *time.Time
			var active, idle, pages int
			if srows.Scan(&sid, &uid, &name, &started, &ended, &lastAct, &active, &idle, &pages, &reason, &clientSID) == nil {
				sessions = append(sessions, map[string]any{
					"id": sid, "user_id": uid, "user_name": name,
					"started_at": started, "ended_at": ended, "last_activity_at": lastAct,
					"active_seconds": active, "idle_seconds": idle, "page_view_count": pages,
					"end_reason": reason, "client_session_id": clientSID,
					"end_exact": reason == "logout" || reason == "idle_timeout",
				})
			}
		}
	}

	response.OK(w, map[string]any{
		"tenant_id": tenantID,
		"summary": map[string]any{
			"last_login_at": lastLogin, "last_logout_at": lastLogout,
			"last_activity_at": lastActivity, "last_end_reason": lastEndReason,
			"inactive_seconds": inactiveSeconds,
		},
		"users":    users,
		"sessions": sessions,
	}, "OK")
}

func (s *service) customerSessionDetail(w http.ResponseWriter, r *http.Request) {
	customerID, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	sessionID, _ := strconv.ParseInt(chi.URLParam(r, "sessionId"), 10, 64)
	c, err := s.resolveCustomer(r.Context(), customerID)
	if err != nil || c.TenantID == nil {
		response.Err(w, http.StatusNotFound, "Customer tenant not found.", "ERR_NOT_FOUND")
		return
	}

	var sid, uid int64
	var name, reason, clientSID string
	var started time.Time
	var ended, lastAct *time.Time
	var active, idle, pages int
	err = s.pool.QueryRow(r.Context(), `
		select s.id, s.user_id, coalesce(u.full_name,''), s.started_at, s.ended_at,
		       s.last_activity_at, s.active_seconds, s.idle_seconds, s.page_view_count,
		       coalesce(s.end_reason,''), s.client_session_id::text
		from public.app_usage_sessions s
		join public.users u on u.id = s.user_id
		where s.id = $1 and s.tenant_id = $2`, sessionID, *c.TenantID).
		Scan(&sid, &uid, &name, &started, &ended, &lastAct, &active, &idle, &pages, &reason, &clientSID)
	if err != nil {
		if err == pgx.ErrNoRows {
			response.Err(w, http.StatusNotFound, "Session not found.", "ERR_NOT_FOUND")
			return
		}
		response.Err(w, http.StatusInternalServerError, "Failed to load session.", "ERR_INTERNAL")
		return
	}

	pagesOut := []map[string]any{}
	rows, err := s.pool.Query(r.Context(), `
		select id, seq, route_path, route_pattern, page_label, entered_at, exited_at,
		       active_seconds, idle_seconds
		from public.app_usage_page_visits
		where session_id = $1
		order by seq, entered_at`, sessionID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var pid int64
			var seq, aSec, iSec int
			var path, pattern, label string
			var entered time.Time
			var exited *time.Time
			if rows.Scan(&pid, &seq, &path, &pattern, &label, &entered, &exited, &aSec, &iSec) == nil {
				pagesOut = append(pagesOut, map[string]any{
					"id": pid, "seq": seq, "route_path": path, "route_pattern": pattern,
					"page_label": label, "entered_at": entered, "exited_at": exited,
					"active_seconds": aSec, "idle_seconds": iSec,
				})
			}
		}
	}

	response.OK(w, map[string]any{
		"session": map[string]any{
			"id": sid, "user_id": uid, "user_name": name,
			"started_at": started, "ended_at": ended, "last_activity_at": lastAct,
			"active_seconds": active, "idle_seconds": idle, "page_view_count": pages,
			"end_reason": reason, "client_session_id": clientSID,
			"end_exact": reason == "logout" || reason == "idle_timeout",
		},
		"pages": pagesOut,
	}, "OK")
}
