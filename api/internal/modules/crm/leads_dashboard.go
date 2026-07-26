package crm

import (
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type statusCount struct {
	Status string `json:"status"`
	Count  int64  `json:"count"`
}

type stageValue struct {
	Stage         string  `json:"stage"`
	Count         int64   `json:"count"`
	ExpectedValue float64 `json:"expected_value"`
}

type agingBucket struct {
	Bucket string `json:"bucket"`
	Count  int64  `json:"count"`
}

type leadsDashboardSummary struct {
	ScopedView           bool          `json:"scoped_view"`
	ByStatus             []statusCount `json:"by_status"`
	OpenLeadCount        int64         `json:"open_lead_count"`
	FollowUpsOverdue     int64         `json:"follow_ups_overdue"`
	FollowUpsDueSoon     int64         `json:"follow_ups_due_soon"`
	OpportunitiesByStage []stageValue  `json:"opportunities_by_stage"`
	Aging                []agingBucket `json:"aging"`
}

func registerLeadsDashboardRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/dashboard/leads-summary", leadsDashboardSummaryHandler(pool))
}

func leadsDashboardSummaryHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		ctx := r.Context()
		out := leadsDashboardSummary{
			ScopedView:           !tu.CanViewAllCRM(),
			ByStatus:             []statusCount{},
			OpportunitiesByStage: []stageValue{},
			Aging:                []agingBucket{},
		}

		// Leads: scope by pic_user_id (crm_leads has no created_by_user_id).
		leadArgs := []any{tu.TenantID}
		leadN := 2
		leadScope, _ := tu.PicScopeSQL("l.pic_user_id", leadN, &leadArgs)

		statusRows, err := pool.Query(ctx, fmt.Sprintf(`
			select l.status, count(*)::bigint
			from public.crm_leads l
			where l.tenant_id = $1%s
			group by l.status
			order by l.status`, leadScope), leadArgs...)
		if err == nil {
			defer statusRows.Close()
			for statusRows.Next() {
				var row statusCount
				if statusRows.Scan(&row.Status, &row.Count) == nil {
					out.ByStatus = append(out.ByStatus, row)
				}
			}
		}

		// Ensure every known status appears (zeros) so the UI is stable.
		known := []string{"new", "contacted", "qualified", "lost", "converted"}
		seen := map[string]int64{}
		for _, row := range out.ByStatus {
			seen[row.Status] = row.Count
		}
		filled := make([]statusCount, 0, len(known))
		out.OpenLeadCount = 0
		for _, st := range known {
			c := seen[st]
			filled = append(filled, statusCount{Status: st, Count: c})
			if st != "lost" && st != "converted" {
				out.OpenLeadCount += c
			}
		}
		out.ByStatus = filled

		agingRows, err := pool.Query(ctx, fmt.Sprintf(`
			select
			  case
			    when (current_date - l.updated_at::date) <= 7 then '0_7'
			    when (current_date - l.updated_at::date) <= 30 then '8_30'
			    when (current_date - l.updated_at::date) <= 90 then '31_90'
			    else '90_plus'
			  end as bucket,
			  count(*)::bigint
			from public.crm_leads l
			where l.tenant_id = $1%s
			  and l.status not in ('lost', 'converted')
			group by 1
			order by 1`, leadScope), leadArgs...)
		if err == nil {
			defer agingRows.Close()
			for agingRows.Next() {
				var row agingBucket
				if agingRows.Scan(&row.Bucket, &row.Count) == nil {
					out.Aging = append(out.Aging, row)
				}
			}
		}

		oppArgs := []any{tu.TenantID}
		oppN := 2
		oppScope, _ := tu.PicScopeSQL("o.pic_user_id", oppN, &oppArgs)
		analytics := tu.CanViewCrmAnalytics()
		oppRows, err := pool.Query(ctx, fmt.Sprintf(`
			select o.stage, count(*)::bigint,
			  coalesce(sum(o.expected_value), 0)::float8
			from public.crm_opportunities o
			where o.tenant_id = $1%s
			  and o.stage not in ('won', 'lost')
			group by o.stage
			order by o.stage`, oppScope), oppArgs...)
		if err == nil {
			defer oppRows.Close()
			for oppRows.Next() {
				var row stageValue
				if oppRows.Scan(&row.Stage, &row.Count, &row.ExpectedValue) == nil {
					if !analytics {
						row.ExpectedValue = 0
					}
					out.OpportunitiesByStage = append(out.OpportunitiesByStage, row)
				}
			}
		}

		fuArgs := []any{tu.TenantID}
		fuN := 2
		fuScope, _ := tu.PicOrCreatedScopeSQL("t", fuN, &fuArgs)
		_ = pool.QueryRow(ctx, fmt.Sprintf(`
			select count(*) from public.crm_follow_up_tasks t
			where t.tenant_id = $1 and t.stage = 'overdue'%s`, fuScope),
			fuArgs...).Scan(&out.FollowUpsOverdue)
		_ = pool.QueryRow(ctx, fmt.Sprintf(`
			select count(*) from public.crm_follow_up_tasks t
			where t.tenant_id = $1 and t.stage = 'due_soon'%s`, fuScope),
			fuArgs...).Scan(&out.FollowUpsDueSoon)

		w.Header().Set("Cache-Control", "private, max-age=30")
		response.OK(w, out, "OK")
	}
}
