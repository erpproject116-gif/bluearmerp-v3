package hr

import (
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// DTRMonthOverviewRow is one active employee’s DTR totals for a calendar month.
type DTRMonthOverviewRow struct {
	EmployeeID        int64   `json:"employee_id"`
	EmployeeNo        string  `json:"employee_no"`
	EmployeeName      string  `json:"employee_name"`
	Department        string  `json:"department"`
	PresentDays       int     `json:"present_days"`
	AbsentDays        int     `json:"absent_days"`
	AwolDays          int     `json:"awol_days"`
	LeaveDays         int     `json:"leave_days"`
	HolidayDays       int     `json:"holiday_days"`
	RestDays          int     `json:"rest_days"`
	ShortDays         int     `json:"short_days"`
	OTHoursSum        float64 `json:"ot_hours_sum"`
	NightDiffHoursSum float64 `json:"night_diff_hours_sum"`
	HoursWorkedSum    float64 `json:"hours_worked_sum"`
}

// calendarMonthBounds returns inclusive first/last dates for year-month (1–12).
func calendarMonthBounds(year, month int) (from, to string, ok bool) {
	if year < 2000 || year > 2100 || month < 1 || month > 12 {
		return "", "", false
	}
	start := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
	end := start.AddDate(0, 1, -1)
	return start.Format("2006-01-02"), end.Format("2006-01-02"), true
}

// isShortDay matches absenteeism late_days: present with hours_worked under 8.
func isShortDay(status string, hoursWorked float64) bool {
	return status == "present" && hoursWorked < 8
}

func listDTRMonthOverview(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		year, errY := strconv.Atoi(r.URL.Query().Get("year"))
		month, errM := strconv.Atoi(r.URL.Query().Get("month"))
		if errY != nil || errM != nil {
			now := time.Now().UTC()
			year, month = now.Year(), int(now.Month())
		}
		from, to, ok := calendarMonthBounds(year, month)
		if !ok {
			response.Validation(w, map[string]string{"month": "Choose a valid year and month."})
			return
		}

		rows, err := pool.Query(r.Context(), `
			select e.id, e.employee_no, e.full_name, coalesce(e.department, ''),
			  coalesce(sum(case when d.status = 'present' then 1 else 0 end), 0)::int,
			  coalesce(sum(case when d.status = 'absent' then 1 else 0 end), 0)::int,
			  coalesce(sum(case when d.status = 'awol' then 1 else 0 end), 0)::int,
			  coalesce(sum(case when d.status = 'leave' then 1 else 0 end), 0)::int,
			  coalesce(sum(case when d.status = 'holiday' then 1 else 0 end), 0)::int,
			  coalesce(sum(case when d.status = 'rest' then 1 else 0 end), 0)::int,
			  coalesce(sum(case when d.status = 'present' and d.hours_worked < 8 then 1 else 0 end), 0)::int,
			  coalesce(sum(d.ot_hours), 0)::float8,
			  coalesce(sum(d.night_diff_hours), 0)::float8,
			  coalesce(sum(d.hours_worked), 0)::float8
			from public.hr_employees e
			left join public.hr_dtr_entries d
			  on d.employee_id = e.id and d.tenant_id = e.tenant_id
			 and d.work_date between $2::date and $3::date
			where e.tenant_id = $1 and e.status = 'active' and e.deleted_at is null
			group by e.id, e.employee_no, e.full_name, e.department
			order by e.full_name`, tu.TenantID, from, to)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load month overview.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		out := []DTRMonthOverviewRow{}
		for rows.Next() {
			var row DTRMonthOverviewRow
			if err := rows.Scan(
				&row.EmployeeID, &row.EmployeeNo, &row.EmployeeName, &row.Department,
				&row.PresentDays, &row.AbsentDays, &row.AwolDays, &row.LeaveDays,
				&row.HolidayDays, &row.RestDays, &row.ShortDays,
				&row.OTHoursSum, &row.NightDiffHoursSum, &row.HoursWorkedSum,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read month overview.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		response.OK(w, map[string]any{
			"year":  year,
			"month": month,
			"from":  from,
			"to":    to,
			"rows":  out,
		}, "OK")
	}
}
