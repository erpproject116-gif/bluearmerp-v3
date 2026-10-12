package hr

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const hrOverviewSQL = `
select
  (select count(*)::int from public.hr_employees where tenant_id=$1 and status='active'),
  (select count(*)::int from public.hr_discipline_cases where tenant_id=$1 and status not in ('closed','cancelled')),
  (select count(*)::int from public.hr_leave_requests where tenant_id=$1 and status='submitted'),
  (select count(*)::int from public.hr_absence_alerts where tenant_id=$1 and status='open')`

const disciplineReportSQL = `
select c.case_no, e.employee_no, e.full_name, c.case_type, c.status, ` + disciplineHasRealFileSQL + `
from public.hr_discipline_cases c
join public.hr_employees e on e.id = c.employee_id and e.tenant_id = c.tenant_id
where c.tenant_id=$1
  and c.created_at::date between $2::date and $3::date
order by c.created_at desc, c.id desc
limit 500`

func registerHrDeskRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/overview", getHrOverview(pool))
	r.Get("/reports/discipline", listDisciplineOpenedReport(pool))
}

func getHrOverview(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var active, discipline, leave, alerts int
		err := pool.QueryRow(r.Context(), hrOverviewSQL, tu.TenantID).Scan(&active, &discipline, &leave, &alerts)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load HR overview.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]int{
			"active_employees":      active,
			"open_discipline_cases": discipline,
			"pending_leave":         leave,
			"open_absence_alerts":   alerts,
		}, "OK")
	}
}

type disciplineReportRow struct {
	CaseNo       string `json:"case_no"`
	EmployeeNo   string `json:"employee_no"`
	EmployeeName string `json:"employee_name"`
	CaseType     string `json:"case_type"`
	Status       string `json:"status"`
	HasRealFile  bool   `json:"has_real_file"`
}

func listDisciplineOpenedReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		from, to, ok := disciplineReportRange(r.URL.Query().Get("from"), r.URL.Query().Get("to"), time.Now())
		if !ok {
			response.Err(w, http.StatusBadRequest, "Use dates as YYYY-MM-DD, with the start on or before the end.", "ERR_VALIDATION")
			return
		}
		rows, err := pool.Query(r.Context(), disciplineReportSQL, tu.TenantID, from, to)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load the discipline report.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []disciplineReportRow{}
		for rows.Next() {
			var row disciplineReportRow
			if err := rows.Scan(&row.CaseNo, &row.EmployeeNo, &row.EmployeeName, &row.CaseType, &row.Status, &row.HasRealFile); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read the discipline report.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		response.OK(w, map[string]any{"from": from, "to": to, "rows": out}, "OK")
	}
}

func disciplineReportRange(fromRaw, toRaw string, now time.Time) (string, string, bool) {
	from := strings.TrimSpace(fromRaw)
	to := strings.TrimSpace(toRaw)
	if from == "" && to == "" {
		to = now.Format("2006-01-02")
		from = now.AddDate(0, 0, -30).Format("2006-01-02")
		return from, to, true
	}
	if _, err := time.Parse("2006-01-02", from); err != nil {
		return "", "", false
	}
	if _, err := time.Parse("2006-01-02", to); err != nil {
		return "", "", false
	}
	if from > to {
		return "", "", false
	}
	return from, to, true
}
