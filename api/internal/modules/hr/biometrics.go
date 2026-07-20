package hr

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type biometricPunchBody struct {
	EmployeeNo string `json:"employee_no"`
	EmployeeID *int64 `json:"employee_id"`
	PunchAt    string `json:"punch_at"` // RFC3339 or YYYY-MM-DD HH:MM:SS
	DeviceID   string `json:"device_id"`
	PunchType  string `json:"punch_type"` // in | out | break_in | break_out
}

type biometricPunchResult struct {
	EmployeeID  int64   `json:"employee_id"`
	WorkDate    string  `json:"work_date"`
	DTRID       int64   `json:"dtr_id,omitempty"`
	Status      string  `json:"status"`
	HoursWorked float64 `json:"hours_worked"`
	Message     string  `json:"message"`
}

func registerBiometricRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("hr.attendance", auth.AccessWrite)).Post("/biometrics/punches", ingestBiometricPunch(pool))
}

func ingestBiometricPunch(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body biometricPunchBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		var empID int64
		if body.EmployeeID != nil && *body.EmployeeID > 0 {
			empID = *body.EmployeeID
		} else {
			no := strings.TrimSpace(body.EmployeeNo)
			if no == "" {
				response.Validation(w, map[string]string{"employee_no": "employee_no or employee_id required."})
				return
			}
			if err := pool.QueryRow(r.Context(), `
				select id from public.hr_employees where tenant_id=$1 and employee_no=$2 and status='active'`,
				tu.TenantID, no).Scan(&empID); err != nil {
				response.Err(w, http.StatusNotFound, "Employee not found.", "ERR_NOT_FOUND")
				return
			}
		}
		punchAt := time.Now()
		if s := strings.TrimSpace(body.PunchAt); s != "" {
			if t, err := time.Parse(time.RFC3339, s); err == nil {
				punchAt = t
			} else if t, err := time.Parse("2006-01-02 15:04:05", s); err == nil {
				punchAt = t
			} else if t, err := time.Parse("2006-01-02", s); err == nil {
				punchAt = t
			}
		}
		punchType := strings.ToLower(strings.TrimSpace(body.PunchType))
		if punchType == "" {
			punchType = "in"
		}
		validPunch := map[string]bool{"in": true, "out": true, "break_in": true, "break_out": true}
		if !validPunch[punchType] {
			punchType = "in"
		}
		workDate := punchAt.Format("2006-01-02")
		_, err := pool.Exec(r.Context(), `
			insert into public.hr_biometric_punches (tenant_id, employee_id, punch_at, punch_type, device_id)
			values ($1,$2,$3,$4,$5)`,
			tu.TenantID, empID, punchAt, punchType, strings.TrimSpace(body.DeviceID))
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to store punch.", "ERR_INTERNAL")
			return
		}
		hours := reconstructPunchHours(r, pool, tu.TenantID, empID, workDate)
		if hours <= 0 {
			hours = 8 // default until second punch arrives
		}
		notes := "biometric punch"
		if body.DeviceID != "" {
			notes += " device=" + body.DeviceID
		}
		notes += " type=" + punchType
		var dtrID int64
		err = pool.QueryRow(r.Context(), `
			insert into public.hr_dtr_entries
			  (tenant_id, employee_id, work_date, source, status, hours_worked, notes)
			values ($1,$2,$3::date,'punch','present',$4,$5)
			on conflict (tenant_id, employee_id, work_date) do update set
			  source = 'punch',
			  hours_worked = excluded.hours_worked,
			  notes = coalesce(public.hr_dtr_entries.notes,'') || E'\n' || excluded.notes,
			  updated_at = now()
			returning id`,
			tu.TenantID, empID, workDate, hours, notes,
		).Scan(&dtrID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to record punch DTR.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "hr.biometric_punch", "hr_dtr_entry", &dtrID, nil, body)
		response.OK(w, biometricPunchResult{
			EmployeeID: empID, WorkDate: workDate, DTRID: dtrID, Status: "accepted",
			HoursWorked: hours, Message: "Punch stored; hours reconstructed from in/out pairs when available.",
		}, "OK")
	}
}

func reconstructPunchHours(r *http.Request, pool *pgxpool.Pool, tenantID, empID int64, workDate string) float64 {
	rows, err := pool.Query(r.Context(), `
		select punch_at, punch_type from public.hr_biometric_punches
		where tenant_id=$1 and employee_id=$2 and punch_at::date = $3::date
		order by punch_at`, tenantID, empID, workDate)
	if err != nil {
		return 0
	}
	defer rows.Close()
	var lastIn *time.Time
	var total time.Duration
	for rows.Next() {
		var at time.Time
		var typ string
		if err := rows.Scan(&at, &typ); err != nil {
			continue
		}
		switch typ {
		case "in", "break_out":
			t := at
			lastIn = &t
		case "out", "break_in":
			if lastIn != nil && at.After(*lastIn) {
				total += at.Sub(*lastIn)
				lastIn = nil
			}
		}
	}
	hours := total.Hours()
	if hours < 0 {
		hours = 0
	}
	if hours > 24 {
		hours = 24
	}
	return roundMoney(hours)
}
