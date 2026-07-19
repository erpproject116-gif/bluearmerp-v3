package hr

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type AbsenceAlert struct {
	ID               int64   `json:"id"`
	EmployeeID       int64   `json:"employee_id"`
	EmployeeNo       string  `json:"employee_no,omitempty"`
	EmployeeName     string  `json:"employee_name,omitempty"`
	RuleID           *int64  `json:"rule_id,omitempty"`
	AlertCode        string  `json:"alert_code"`
	Message          string  `json:"message"`
	OccurrenceCount  int     `json:"occurrence_count"`
	WindowStart      string  `json:"window_start"`
	WindowEnd        string  `json:"window_end"`
	Status           string  `json:"status"`
	DisciplineCaseID *int64  `json:"discipline_case_id,omitempty"`
	CreatedAt        string  `json:"created_at,omitempty"`
}

type AbsenteeismRow struct {
	EmployeeID   int64  `json:"employee_id"`
	EmployeeNo   string `json:"employee_no"`
	EmployeeName string `json:"employee_name"`
	Department   string `json:"department"`
	AbsentDays   int    `json:"absent_days"`
	AwolDays     int    `json:"awol_days"`
	LateDays     int    `json:"late_days"`
	LeaveDays    int    `json:"leave_days"`
}

func registerAbsenteeismRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("hr.attendance", auth.AccessRead)).Get("/absence-alerts", listAbsenceAlerts(pool))
	r.With(auth.RequirePermission("hr.attendance", auth.AccessWrite)).Post("/absence-alerts/{id}/acknowledge", ackAbsenceAlert(pool))
	r.With(auth.RequirePermission("hr.attendance", auth.AccessWrite)).Post("/absence-alerts/evaluate", evaluateAbsenceAlerts(pool))
	r.With(auth.RequirePermission("hr.attendance", auth.AccessRead)).Get("/absenteeism-report", absenteeismReport(pool))
}

func listAbsenceAlerts(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		status := strings.TrimSpace(r.URL.Query().Get("status"))
		where := "a.tenant_id=$1"
		args := []any{tu.TenantID}
		if status != "" {
			where += " and a.status=$2"
			args = append(args, status)
		}
		rows, err := pool.Query(r.Context(), fmt.Sprintf(`
			select a.id, a.employee_id, e.employee_no, e.full_name, a.rule_id, a.alert_code, a.message,
			  a.occurrence_count, a.window_start::text, a.window_end::text, a.status, a.discipline_case_id, a.created_at::text
			from public.hr_absence_alerts a
			join public.hr_employees e on e.id=a.employee_id
			where %s
			order by a.created_at desc
			limit 200`, where), args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load alerts.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []AbsenceAlert{}
		for rows.Next() {
			var row AbsenceAlert
			if err := rows.Scan(&row.ID, &row.EmployeeID, &row.EmployeeNo, &row.EmployeeName, &row.RuleID, &row.AlertCode, &row.Message,
				&row.OccurrenceCount, &row.WindowStart, &row.WindowEnd, &row.Status, &row.DisciplineCaseID, &row.CreatedAt); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read alert.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		response.OK(w, out, "OK")
	}
}

func ackAbsenceAlert(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.hr_absence_alerts set status='acknowledged', updated_at=now()
			where id=$1 and tenant_id=$2 and status='open'`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Alert not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Acknowledged.")
	}
}

func evaluateAbsenceAlerts(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		created, err := evaluateAbsencesForTenant(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Evaluation failed.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"alerts_created": created}, "Evaluation complete.")
	}
}

func evaluateAbsencesForTenant(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (int, error) {
	rules, err := pool.Query(ctx, `
		select id, rule_code, rule_name, status_filter, threshold_count, window_days
		from public.hr_absence_rules where tenant_id=$1 and is_active`, tenantID)
	if err != nil {
		return 0, err
	}
	defer rules.Close()
	type rule struct {
		ID, Threshold, Window int
		Code, Name, Filter    string
	}
	var ruleList []rule
	for rules.Next() {
		var rr rule
		if err := rules.Scan(&rr.ID, &rr.Code, &rr.Name, &rr.Filter, &rr.Threshold, &rr.Window); err != nil {
			return 0, err
		}
		ruleList = append(ruleList, rr)
	}
	created := 0
	today := time.Now().UTC()
	for _, rr := range ruleList {
		windowStart := today.AddDate(0, 0, -rr.Window)
		statusClause := "status = 'absent'"
		switch rr.Filter {
		case "awol":
			statusClause = "status = 'awol'"
		case "late":
			statusClause = "status = 'present' and hours_worked < 8"
		case "any":
			statusClause = "status in ('absent','awol')"
		}
		q := fmt.Sprintf(`
			select employee_id, count(*)::int
			from public.hr_dtr_entries
			where tenant_id=$1 and work_date >= $2::date and work_date <= $3::date and %s
			group by employee_id
			having count(*) >= $4`, statusClause)
		rows, err := pool.Query(ctx, q, tenantID, windowStart.Format("2006-01-02"), today.Format("2006-01-02"), rr.Threshold)
		if err != nil {
			return created, err
		}
		for rows.Next() {
			var empID int64
			var cnt int
			if err := rows.Scan(&empID, &cnt); err != nil {
				rows.Close()
				return created, err
			}
			var exists bool
			_ = pool.QueryRow(ctx, `
				select exists(
				  select 1 from public.hr_absence_alerts
				  where tenant_id=$1 and employee_id=$2 and rule_id=$3 and status in ('open','escalated')
				    and window_end >= $4::date
				)`, tenantID, empID, rr.ID, windowStart.Format("2006-01-02")).Scan(&exists)
			if exists {
				continue
			}
			msg := fmt.Sprintf("%s: %d occurrences in last %d days", rr.Name, cnt, rr.Window)
			var alertID int64
			err := pool.QueryRow(ctx, `
				insert into public.hr_absence_alerts
				  (tenant_id, employee_id, rule_id, alert_code, message, occurrence_count, window_start, window_end)
				values ($1,$2,$3,$4,$5,$6,$7::date,$8::date) returning id`,
				tenantID, empID, rr.ID, rr.Code, msg, cnt, windowStart.Format("2006-01-02"), today.Format("2006-01-02"),
			).Scan(&alertID)
			if err == nil {
				created++
				_ = audit.Log(ctx, pool, tenantID, 0, "hr.absence.alert", "hr_absence_alert", &alertID, nil, map[string]any{"employee_id": empID})
			}
		}
		rows.Close()
	}
	return created, nil
}

func absenteeismReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		from := strings.TrimSpace(r.URL.Query().Get("from"))
		to := strings.TrimSpace(r.URL.Query().Get("to"))
		if from == "" || to == "" {
			now := time.Now()
			to = now.Format("2006-01-02")
			from = now.AddDate(0, 0, -30).Format("2006-01-02")
		}
		rows, err := pool.Query(r.Context(), `
			select e.id, e.employee_no, e.full_name, e.department,
			  coalesce(sum(case when d.status='absent' then 1 else 0 end),0)::int,
			  coalesce(sum(case when d.status='awol' then 1 else 0 end),0)::int,
			  coalesce(sum(case when d.status='present' and d.hours_worked < 8 then 1 else 0 end),0)::int,
			  coalesce(sum(case when d.status='leave' then 1 else 0 end),0)::int
			from public.hr_employees e
			left join public.hr_dtr_entries d
			  on d.employee_id=e.id and d.tenant_id=e.tenant_id
			 and d.work_date between $2::date and $3::date
			where e.tenant_id=$1 and e.status='active'
			group by e.id, e.employee_no, e.full_name, e.department
			having coalesce(sum(case when d.status in ('absent','awol') then 1 else 0 end),0) > 0
			    or coalesce(sum(case when d.status='present' and d.hours_worked < 8 then 1 else 0 end),0) > 0
			order by 5 desc, 6 desc, e.full_name`, tu.TenantID, from, to)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to build report.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []AbsenteeismRow{}
		for rows.Next() {
			var row AbsenteeismRow
			if err := rows.Scan(&row.EmployeeID, &row.EmployeeNo, &row.EmployeeName, &row.Department,
				&row.AbsentDays, &row.AwolDays, &row.LateDays, &row.LeaveDays); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read report.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		response.OK(w, map[string]any{"from": from, "to": to, "rows": out}, "OK")
	}
}
