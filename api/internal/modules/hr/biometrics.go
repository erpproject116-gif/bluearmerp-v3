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
	EmployeeID int64  `json:"employee_id"`
	WorkDate   string `json:"work_date"`
	DTRID      int64  `json:"dtr_id,omitempty"`
	Status     string `json:"status"`
	Message    string `json:"message"`
}

func registerBiometricRoutes(r chi.Router, pool *pgxpool.Pool) {
	// Device/API key auth can be added later; for now HR attendance write.
	r.With(auth.RequirePermission("hr.attendance", auth.AccessWrite)).Post("/biometrics/punches", ingestBiometricPunch(pool))
}

// ingestBiometricPunch records a punch and upserts a minimal DTR day (source=punch).
// Full time-pair → hours calculation is Phase 4; this creates/updates the attendance row so payroll sees the day.
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
		workDate := punchAt.Format("2006-01-02")
		notes := "biometric punch"
		if body.DeviceID != "" {
			notes += " device=" + body.DeviceID
		}
		if body.PunchType != "" {
			notes += " type=" + body.PunchType
		}
		var dtrID int64
		err := pool.QueryRow(r.Context(), `
			insert into public.hr_dtr_entries
			  (tenant_id, employee_id, work_date, source, status, hours_worked, notes)
			values ($1,$2,$3::date,'punch','present',8,$4)
			on conflict (tenant_id, employee_id, work_date) do update set
			  source = 'punch',
			  notes = coalesce(public.hr_dtr_entries.notes,'') || E'\n' || excluded.notes,
			  updated_at = now()
			returning id`,
			tu.TenantID, empID, workDate, notes,
		).Scan(&dtrID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to record punch.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "hr.biometric_punch", "hr_dtr_entry", &dtrID, nil, body)
		response.OK(w, biometricPunchResult{
			EmployeeID: empID, WorkDate: workDate, DTRID: dtrID, Status: "accepted",
			Message: "Punch recorded. Pair in/out → hours calculation coming in a later release.",
		}, "Punch accepted.")
	}
}
