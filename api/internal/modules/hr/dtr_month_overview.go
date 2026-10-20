package hr

import (
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// DTRMonthDayCell is one calendar day status for the overview grid.
type DTRMonthDayCell struct {
	Day    int    `json:"day"`
	Status string `json:"status"`
}

// DTRMonthOverviewRow is one active employee’s DTR totals for a calendar month.
type DTRMonthOverviewRow struct {
	EmployeeID        int64             `json:"employee_id"`
	EmployeeNo        string            `json:"employee_no"`
	EmployeeName      string            `json:"employee_name"`
	Department        string            `json:"department"`
	JobTitle          string            `json:"job_title"`
	PresentDays       int               `json:"present_days"`
	AbsentDays        int               `json:"absent_days"`
	AwolDays          int               `json:"awol_days"`
	LeaveDays         int               `json:"leave_days"`
	HolidayDays       int               `json:"holiday_days"`
	RestDays          int               `json:"rest_days"`
	ShortDays         int               `json:"short_days"`
	OTHoursSum        float64           `json:"ot_hours_sum"`
	NightDiffHoursSum float64           `json:"night_diff_hours_sum"`
	HoursWorkedSum    float64           `json:"hours_worked_sum"`
	Days              []DTRMonthDayCell `json:"days"`
}

// DTREmployeeMonthLine is one day on the employee DTR log.
type DTREmployeeMonthLine struct {
	ID             int64   `json:"id"`
	WorkDate       string  `json:"work_date"`
	Weekday        string  `json:"weekday"`
	Status         string  `json:"status"`
	HoursWorked    float64 `json:"hours_worked"`
	OTHours        float64 `json:"ot_hours"`
	NightDiffHours float64 `json:"night_diff_hours"`
	ActualIn       string  `json:"actual_in,omitempty"`
	ActualOut      string  `json:"actual_out,omitempty"`
	HolidayName    string  `json:"holiday_name,omitempty"`
	AbsenceReason  string  `json:"absence_reason,omitempty"`
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

// dtrStatusLetter maps a DTR status to a one-letter grid code.
func dtrStatusLetter(status string) string {
	switch status {
	case "present":
		return "P"
	case "absent":
		return "A"
	case "awol":
		return "W"
	case "leave":
		return "L"
	case "holiday":
		return "H"
	case "rest":
		return "R"
	default:
		return ""
	}
}

func parseYearMonthQuery(r *http.Request) (year, month int, from, to string, ok bool) {
	year, errY := strconv.Atoi(r.URL.Query().Get("year"))
	month, errM := strconv.Atoi(r.URL.Query().Get("month"))
	if errY != nil || errM != nil {
		now := time.Now().UTC()
		year, month = now.Year(), int(now.Month())
	}
	from, to, ok = calendarMonthBounds(year, month)
	return year, month, from, to, ok
}

func listDTRMonthOverview(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		year, month, from, to, ok := parseYearMonthQuery(r)
		if !ok {
			response.Validation(w, map[string]string{"month": "Choose a valid year and month."})
			return
		}

		rows, err := pool.Query(r.Context(), `
			select e.id, e.employee_no, e.full_name, coalesce(e.department, ''), coalesce(e.job_title, ''),
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
			group by e.id, e.employee_no, e.full_name, e.department, e.job_title
			order by e.full_name`, tu.TenantID, from, to)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load month overview.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		out := []DTRMonthOverviewRow{}
		byID := map[int64]*DTRMonthOverviewRow{}
		for rows.Next() {
			var row DTRMonthOverviewRow
			if err := rows.Scan(
				&row.EmployeeID, &row.EmployeeNo, &row.EmployeeName, &row.Department, &row.JobTitle,
				&row.PresentDays, &row.AbsentDays, &row.AwolDays, &row.LeaveDays,
				&row.HolidayDays, &row.RestDays, &row.ShortDays,
				&row.OTHoursSum, &row.NightDiffHoursSum, &row.HoursWorkedSum,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read month overview.", "ERR_INTERNAL")
				return
			}
			row.Days = []DTRMonthDayCell{}
			out = append(out, row)
			byID[row.EmployeeID] = &out[len(out)-1]
		}

		dayRows, err := pool.Query(r.Context(), `
			select d.employee_id, d.work_date::text, d.status
			from public.hr_dtr_entries d
			join public.hr_employees e on e.id = d.employee_id and e.tenant_id = d.tenant_id
			where d.tenant_id = $1 and d.work_date between $2::date and $3::date
			  and e.status = 'active' and e.deleted_at is null
			order by d.employee_id, d.work_date`, tu.TenantID, from, to)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load month days.", "ERR_INTERNAL")
			return
		}
		defer dayRows.Close()
		for dayRows.Next() {
			var empID int64
			var workDate, status string
			if err := dayRows.Scan(&empID, &workDate, &status); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read month days.", "ERR_INTERNAL")
				return
			}
			row, exists := byID[empID]
			if !exists {
				continue
			}
			t, err := time.Parse("2006-01-02", workDate[:10])
			if err != nil {
				continue
			}
			row.Days = append(row.Days, DTRMonthDayCell{Day: t.Day(), Status: status})
		}

		response.OK(w, map[string]any{
			"year":          year,
			"month":         month,
			"from":          from,
			"to":            to,
			"days_in_month": time.Date(year, time.Month(month)+1, 0, 0, 0, 0, 0, time.UTC).Day(),
			"rows":          out,
		}, "OK")
	}
}

func getDTREmployeeMonth(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		empID, err := strconv.ParseInt(r.URL.Query().Get("employee_id"), 10, 64)
		if err != nil || empID <= 0 {
			response.Validation(w, map[string]string{"employee_id": "Employee is required."})
			return
		}
		year, month, from, to, ok := parseYearMonthQuery(r)
		if !ok {
			response.Validation(w, map[string]string{"month": "Choose a valid year and month."})
			return
		}

		var empNo, empName, dept, jobTitle string
		err = pool.QueryRow(r.Context(), `
			select employee_no, full_name, coalesce(department, ''), coalesce(job_title, '')
			from public.hr_employees
			where id = $1 and tenant_id = $2 and deleted_at is null`,
			empID, tu.TenantID).Scan(&empNo, &empName, &dept, &jobTitle)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Employee not found.", "ERR_NOT_FOUND")
			return
		}

		rows, err := pool.Query(r.Context(), `
			select d.id, d.work_date::text, d.status,
			  d.hours_worked::float8, d.ot_hours::float8, d.night_diff_hours::float8,
			  coalesce(h.name, ''), coalesce(d.absence_reason, '')
			from public.hr_dtr_entries d
			left join public.hr_holidays h on h.id = d.holiday_id
			where d.tenant_id = $1 and d.employee_id = $2
			  and d.work_date between $3::date and $4::date
			order by d.work_date`, tu.TenantID, empID, from, to)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load DTR log.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		out := []DTREmployeeMonthLine{}
		for rows.Next() {
			var line DTREmployeeMonthLine
			if err := rows.Scan(
				&line.ID, &line.WorkDate, &line.Status,
				&line.HoursWorked, &line.OTHours, &line.NightDiffHours,
				&line.HolidayName, &line.AbsenceReason,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read DTR log.", "ERR_INTERNAL")
				return
			}
			if t, err := time.Parse("2006-01-02", line.WorkDate[:10]); err == nil {
				line.Weekday = t.Weekday().String()[:3]
			}
			out = append(out, line)
		}

		punchRows, err := pool.Query(r.Context(), `
			select punch_at::date::text, punch_type, to_char(punch_at, 'HH24:MI')
			from public.hr_biometric_punches
			where tenant_id = $1 and employee_id = $2
			  and punch_at::date between $3::date and $4::date
			order by punch_at`, tu.TenantID, empID, from, to)
		if err == nil {
			defer punchRows.Close()
			firstIn := map[string]string{}
			lastOut := map[string]string{}
			for punchRows.Next() {
				var day, typ, hhmm string
				if err := punchRows.Scan(&day, &typ, &hhmm); err != nil {
					continue
				}
				day = day[:10]
				switch typ {
				case "in":
					if _, ok := firstIn[day]; !ok {
						firstIn[day] = hhmm
					}
				case "out":
					lastOut[day] = hhmm
				}
			}
			for i := range out {
				day := out[i].WorkDate[:10]
				out[i].ActualIn = firstIn[day]
				out[i].ActualOut = lastOut[day]
			}
		}

		var hoursSum, otSum, nightSum float64
		var absentDays int
		for _, ln := range out {
			hoursSum += ln.HoursWorked
			otSum += ln.OTHours
			nightSum += ln.NightDiffHours
			if ln.Status == "absent" || ln.Status == "awol" {
				absentDays++
			}
		}

		response.OK(w, map[string]any{
			"year":  year,
			"month": month,
			"from":  from,
			"to":    to,
			"employee": map[string]any{
				"id": empID, "employee_no": empNo, "employee_name": empName,
				"department": dept, "job_title": jobTitle,
			},
			"totals": map[string]any{
				"hours_worked_sum":     hoursSum,
				"ot_hours_sum":         otSum,
				"night_diff_hours_sum": nightSum,
				"absent_days":          absentDays,
			},
			"lines": out,
		}, "OK")
	}
}
