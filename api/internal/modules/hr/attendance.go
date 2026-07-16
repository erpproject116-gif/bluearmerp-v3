package hr

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type Holiday struct {
	ID             int64    `json:"id"`
	HolidayDate    string   `json:"holiday_date"`
	Name           string   `json:"name"`
	HolidayType    string   `json:"holiday_type"`
	PayMultiplier  float64  `json:"pay_multiplier"`
	IsActive       bool     `json:"is_active"`
	Notes          *string  `json:"notes,omitempty"`
}

type PayCutoff struct {
	ID          int64   `json:"id"`
	Label       string  `json:"label"`
	CutoffStart string  `json:"cutoff_start"`
	CutoffEnd   string  `json:"cutoff_end"`
	PayDate     *string `json:"pay_date,omitempty"`
	Status      string  `json:"status"`
}

type DTREntry struct {
	ID              int64    `json:"id"`
	EmployeeID      int64    `json:"employee_id"`
	EmployeeNo      string   `json:"employee_no,omitempty"`
	EmployeeName    string   `json:"employee_name,omitempty"`
	WorkDate        string   `json:"work_date"`
	Source          string   `json:"source"`
	Status          string   `json:"status"`
	HoursWorked     float64  `json:"hours_worked"`
	OTHours         float64  `json:"ot_hours"`
	NightDiffHours  float64  `json:"night_diff_hours"`
	HolidayID       *int64   `json:"holiday_id,omitempty"`
	HolidayName     string   `json:"holiday_name,omitempty"`
	HolidayType     string   `json:"holiday_type,omitempty"`
	Notes           *string  `json:"notes,omitempty"`
}

func registerAttendanceRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("hr.attendance", auth.AccessRead)).Get("/holidays", listHolidays(pool))
	r.With(auth.RequirePermission("hr.attendance", auth.AccessWrite)).Post("/holidays", createHoliday(pool))
	r.With(auth.RequirePermission("hr.attendance", auth.AccessWrite)).Delete("/holidays/{id}", deleteHoliday(pool))

	r.With(auth.RequirePermission("hr.attendance", auth.AccessRead)).Get("/cutoffs", listCutoffs(pool))
	r.With(auth.RequirePermission("hr.attendance", auth.AccessWrite)).Post("/cutoffs", createCutoff(pool))

	r.With(auth.RequirePermission("hr.attendance", auth.AccessRead)).Get("/dtr", listDTR(pool))
	r.With(auth.RequirePermission("hr.attendance", auth.AccessWrite)).Post("/dtr", upsertDTR(pool))
	registerAttendanceCSVRoutes(r, pool)
}

func listHolidays(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		year := strings.TrimSpace(r.URL.Query().Get("year"))
		where := "tenant_id = $1 and is_active"
		args := []any{tu.TenantID}
		if year != "" {
			where += " and extract(year from holiday_date) = $2"
			args = append(args, year)
		}
		rows, err := pool.Query(r.Context(), fmt.Sprintf(`
			select id, holiday_date::text, name, holiday_type, pay_multiplier::float8, is_active, notes
			from public.hr_holidays where %s order by holiday_date`, where), args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list holidays.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []Holiday
		for rows.Next() {
			var h Holiday
			if err := rows.Scan(&h.ID, &h.HolidayDate, &h.Name, &h.HolidayType, &h.PayMultiplier, &h.IsActive, &h.Notes); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read holiday.", "ERR_INTERNAL")
				return
			}
			out = append(out, h)
		}
		if out == nil {
			out = []Holiday{}
		}
		response.OK(w, out, "OK")
	}
}

func createHoliday(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body struct {
			HolidayDate   string   `json:"holiday_date"`
			Name          string   `json:"name"`
			HolidayType   string   `json:"holiday_type"`
			PayMultiplier *float64 `json:"pay_multiplier"`
			Notes         *string  `json:"notes"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		d, err := time.Parse("2006-01-02", strings.TrimSpace(body.HolidayDate))
		if err != nil {
			response.Validation(w, map[string]string{"holiday_date": "Invalid date."})
			return
		}
		name := strings.TrimSpace(body.Name)
		if name == "" {
			response.Validation(w, map[string]string{"name": "Name is required."})
			return
		}
		ht := strings.ToLower(strings.TrimSpace(body.HolidayType))
		if ht == "" {
			ht = "regular"
		}
		if ht != "regular" && ht != "special_non_working" && ht != "special_working" {
			response.Validation(w, map[string]string{"holiday_type": "Invalid holiday type."})
			return
		}
		mult := 2.0
		if body.PayMultiplier != nil && *body.PayMultiplier > 0 {
			mult = *body.PayMultiplier
		} else if ht == "special_non_working" {
			mult = 1.3
		} else if ht == "special_working" {
			mult = 1.3
		}
		var id int64
		err = pool.QueryRow(r.Context(), `
			insert into public.hr_holidays (tenant_id, holiday_date, name, holiday_type, pay_multiplier, notes)
			values ($1,$2,$3,$4,$5,$6) returning id`,
			tu.TenantID, d, name, ht, mult, body.Notes).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create holiday.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "hr.holiday.create", "hr_holiday", &id, nil, body)
		response.OK(w, map[string]any{"id": id}, "Created.")
	}
}

func deleteHoliday(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.hr_holidays set is_active = false where id=$1 and tenant_id=$2`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Holiday not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Deactivated.")
	}
}

func listCutoffs(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, label, cutoff_start::text, cutoff_end::text, pay_date::text, status
			from public.hr_pay_cutoffs where tenant_id=$1
			order by cutoff_start desc limit 50`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list cut-offs.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []PayCutoff
		for rows.Next() {
			var c PayCutoff
			var payDate *string
			if err := rows.Scan(&c.ID, &c.Label, &c.CutoffStart, &c.CutoffEnd, &payDate, &c.Status); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read cut-off.", "ERR_INTERNAL")
				return
			}
			c.PayDate = payDate
			out = append(out, c)
		}
		if out == nil {
			out = []PayCutoff{}
		}
		response.OK(w, out, "OK")
	}
}

func createCutoff(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body struct {
			Label       string  `json:"label"`
			CutoffStart string  `json:"cutoff_start"`
			CutoffEnd   string  `json:"cutoff_end"`
			PayDate     *string `json:"pay_date"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		start, err := time.Parse("2006-01-02", strings.TrimSpace(body.CutoffStart))
		if err != nil {
			response.Validation(w, map[string]string{"cutoff_start": "Invalid date."})
			return
		}
		end, err := time.Parse("2006-01-02", strings.TrimSpace(body.CutoffEnd))
		if err != nil || end.Before(start) {
			response.Validation(w, map[string]string{"cutoff_end": "Invalid cut-off end."})
			return
		}
		label := strings.TrimSpace(body.Label)
		if label == "" {
			label = fmt.Sprintf("%s – %s", start.Format("Jan 2"), end.Format("Jan 2, 2006"))
		}
		var payDate any
		if body.PayDate != nil && strings.TrimSpace(*body.PayDate) != "" {
			d, err := time.Parse("2006-01-02", strings.TrimSpace(*body.PayDate))
			if err != nil {
				response.Validation(w, map[string]string{"pay_date": "Invalid pay date."})
				return
			}
			payDate = d
		}
		var id int64
		err = pool.QueryRow(r.Context(), `
			insert into public.hr_pay_cutoffs (tenant_id, label, cutoff_start, cutoff_end, pay_date)
			values ($1,$2,$3,$4,$5) returning id`, tu.TenantID, label, start, end, payDate).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create cut-off.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Created.")
	}
}

func listDTR(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "work_date", map[string]string{"work_date": "d.work_date"})
		offset := httputil.Offset(p)
		where := "d.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if from := strings.TrimSpace(r.URL.Query().Get("from")); from != "" {
			where += fmt.Sprintf(" and d.work_date >= $%d", n)
			args = append(args, from)
			n++
		}
		if to := strings.TrimSpace(r.URL.Query().Get("to")); to != "" {
			where += fmt.Sprintf(" and d.work_date <= $%d", n)
			args = append(args, to)
			n++
		}
		if eid := strings.TrimSpace(r.URL.Query().Get("employee_id")); eid != "" {
			where += fmt.Sprintf(" and d.employee_id = $%d", n)
			args = append(args, eid)
			n++
		}
		q := fmt.Sprintf(`
			select d.id, d.employee_id, e.employee_no, e.full_name, d.work_date::text, d.source, d.status,
			  d.hours_worked::float8, d.ot_hours::float8, d.night_diff_hours::float8,
			  d.holiday_id, coalesce(h.name,''), coalesce(h.holiday_type,''), d.notes,
			  count(*) over()
			from public.hr_dtr_entries d
			join public.hr_employees e on e.id = d.employee_id
			left join public.hr_holidays h on h.id = d.holiday_id
			where %s order by d.work_date desc, e.full_name
			limit $%d offset $%d`, where, n, n+1)
		args = append(args, p.PageSize, offset)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list DTR.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []DTREntry
		var total int64
		for rows.Next() {
			var row DTREntry
			if err := rows.Scan(&row.ID, &row.EmployeeID, &row.EmployeeNo, &row.EmployeeName, &row.WorkDate,
				&row.Source, &row.Status, &row.HoursWorked, &row.OTHours, &row.NightDiffHours,
				&row.HolidayID, &row.HolidayName, &row.HolidayType, &row.Notes, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read DTR.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []DTREntry{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func upsertDTR(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body struct {
			EmployeeID     int64    `json:"employee_id"`
			WorkDate       string   `json:"work_date"`
			Source         string   `json:"source"`
			Status         string   `json:"status"`
			HoursWorked    float64  `json:"hours_worked"`
			OTHours        float64  `json:"ot_hours"`
			NightDiffHours float64  `json:"night_diff_hours"`
			Notes          *string  `json:"notes"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.EmployeeID <= 0 {
			response.Validation(w, map[string]string{"employee_id": "Employee is required."})
			return
		}
		d, err := time.Parse("2006-01-02", strings.TrimSpace(body.WorkDate))
		if err != nil {
			response.Validation(w, map[string]string{"work_date": "Invalid date."})
			return
		}
		src := strings.ToLower(strings.TrimSpace(body.Source))
		if src == "" {
			src = "manual"
		}
		st := strings.ToLower(strings.TrimSpace(body.Status))
		if st == "" {
			st = "present"
		}
		validStatus := map[string]bool{"present": true, "absent": true, "leave": true, "holiday": true, "rest": true, "awol": true}
		if !validStatus[st] {
			response.Validation(w, map[string]string{"status": "Invalid status."})
			return
		}

		var holidayID *int64
		var holName, holType string
		var hid sql.NullInt64
		_ = pool.QueryRow(r.Context(), `
			select id, name, holiday_type from public.hr_holidays
			where tenant_id=$1 and holiday_date=$2 and is_active limit 1`, tu.TenantID, d).Scan(&hid, &holName, &holType)
		if hid.Valid {
			v := hid.Int64
			holidayID = &v
		}
		if holidayID != nil && st == "present" {
			st = "holiday"
		}

		var id int64
		err = pool.QueryRow(r.Context(), `
			insert into public.hr_dtr_entries (
			  tenant_id, employee_id, work_date, source, status, hours_worked, ot_hours, night_diff_hours, holiday_id, notes
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
			on conflict (tenant_id, employee_id, work_date) do update set
			  source = excluded.source,
			  status = excluded.status,
			  hours_worked = excluded.hours_worked,
			  ot_hours = excluded.ot_hours,
			  night_diff_hours = excluded.night_diff_hours,
			  holiday_id = excluded.holiday_id,
			  notes = excluded.notes,
			  updated_at = now()
			returning id`,
			tu.TenantID, body.EmployeeID, d, src, st, body.HoursWorked, body.OTHours, body.NightDiffHours, holidayID, body.Notes,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save DTR.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{
			"id": id, "status": st, "holiday_name": holName, "holiday_type": holType,
		}, "Saved.")
	}
}
