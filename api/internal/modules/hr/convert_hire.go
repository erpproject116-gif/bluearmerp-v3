package hr

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func registerConvertHireRoute(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("hr.employees_new", auth.AccessWrite)).
		Post("/applications/{id}/convert-hire", convertApplicationHire(pool))
}

type convertHireBody struct {
	SiteID     int64   `json:"site_id"`
	JobOrderID int64   `json:"job_order_id"`
	HireDate   string  `json:"hire_date"`
	BaseSalary float64 `json:"base_salary"`
	JobTitle   string  `json:"job_title"`
	EmployeeNo string  `json:"employee_no"`
}

func convertApplicationHire(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		appID, err := parseID(chi.URLParam(r, "id"))
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid application."})
			return
		}
		var body convertHireBody
		_ = json.NewDecoder(r.Body).Decode(&body)

		// Idempotent: already converted.
		var existingEmp int64
		err = pool.QueryRow(r.Context(), `
			select id from public.hr_employees
			where tenant_id = $1 and source_application_id = $2`, tu.TenantID, appID).Scan(&existingEmp)
		if err == nil && existingEmp > 0 {
			response.OK(w, map[string]any{"employee_id": existingEmp, "idempotent": true}, "Already converted.")
			return
		}
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			response.Err(w, http.StatusInternalServerError, "Failed to convert.", "ERR_INTERNAL")
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to convert.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var personName, email, position, status string
		var postingID *int64
		var birth, cellphone, gender, civil, city, prov, birthplace, citizen, height, weight, religion string
		var spouse, spouseOcc, skills, tin, sss, sig, emergName, emergAddr, emergPhone string
		err = tx.QueryRow(r.Context(), `
			select p.full_name, coalesce(nullif(a.email,''), coalesce(p.email,'')), a.position_desired, a.status,
			       a.job_posting_id, coalesce(a.birth_date::text,''), coalesce(a.cellphone,''), coalesce(a.gender,''),
			       coalesce(a.civil_status,''), coalesce(a.city_address,''), coalesce(a.provincial_address,''),
			       coalesce(a.birthplace,''), coalesce(a.citizenship,''), coalesce(a.height,''), coalesce(a.weight,''),
			       coalesce(a.religion,''), coalesce(a.spouse_name,''), coalesce(a.spouse_occupation,''),
			       coalesce(a.special_skills,''), coalesce(a.tin,''), coalesce(a.sss_no,''),
			       coalesce(a.signature_data_url,''), coalesce(a.emergency_name,''), coalesce(a.emergency_address,''),
			       coalesce(a.emergency_phone,'')
			from public.hr_applications a
			join public.hr_applicant_people p on p.id = a.person_id
			where a.id = $1 and a.tenant_id = $2`, appID, tu.TenantID).Scan(
			&personName, &email, &position, &status, &postingID, &birth, &cellphone, &gender, &civil,
			&city, &prov, &birthplace, &citizen, &height, &weight, &religion, &spouse, &spouseOcc, &skills,
			&tin, &sss, &sig, &emergName, &emergAddr, &emergPhone)
		if errors.Is(err, pgx.ErrNoRows) {
			response.Err(w, http.StatusNotFound, "Application not found.", "ERR_NOT_FOUND")
			return
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load application.", "ERR_INTERNAL")
			return
		}

		siteID := body.SiteID
		if siteID == 0 && postingID != nil {
			_ = tx.QueryRow(r.Context(), `
				select site_id from public.hr_job_postings where id = $1 and tenant_id = $2`, *postingID, tu.TenantID).Scan(&siteID)
		}
		jobOrderID := body.JobOrderID
		if jobOrderID > 0 && siteID > 0 {
			var orderSite int64
			err = tx.QueryRow(r.Context(), `
				select site_id from public.hr_job_orders where id = $1 and tenant_id = $2`, jobOrderID, tu.TenantID).Scan(&orderSite)
			if err != nil || orderSite != siteID {
				response.Validation(w, map[string]string{"job_order_id": "Job order must belong to the same site."})
				return
			}
		}

		empNo := strings.TrimSpace(body.EmployeeNo)
		if empNo == "" {
			empNo, err = nextConvertEmployeeNo(r.Context(), tx, tu.TenantID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to allocate employee number.", "ERR_INTERNAL")
				return
			}
		}
		hireDate := strings.TrimSpace(body.HireDate)
		if hireDate == "" {
			hireDate = time.Now().UTC().Format("2006-01-02")
		}
		title := strings.TrimSpace(body.JobTitle)
		if title == "" {
			title = strings.TrimSpace(position)
		}
		salary := body.BaseSalary
		if salary < 0 {
			salary = 0
		}

		var empID int64
		err = tx.QueryRow(r.Context(), `
			insert into public.hr_employees (
			  tenant_id, employee_no, full_name, department, job_title, hire_date, status, base_salary, email, notes,
			  tin, sss_no, birthdate, emergency_contact_name, emergency_contact_address, emergency_contact_phone,
			  source_application_id, gender, civil_status, cellphone, city_address, provincial_address, birthplace,
			  citizenship, height, weight, religion, spouse_name, spouse_occupation, special_skills, signature_data_url
			) values (
			  $1,$2,$3,'',$4,$5::date,'active',$6,$7,'Converted from application',
			  $8,$9,nullif($10,'')::date,$11,$12,$13,
			  $14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28
			) returning id`,
			tu.TenantID, empNo, personName, title, hireDate, salary, email,
			tin, sss, birth, emergName, emergAddr, emergPhone,
			appID, gender, civil, cellphone, city, prov, birthplace,
			citizen, height, weight, religion, spouse, spouseOcc, skills, sig,
		).Scan(&empID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create employee.", "ERR_INTERNAL")
			return
		}

		if siteID > 0 {
			if _, err := tx.Exec(r.Context(), `
				update public.hr_assignments set end_date = $3::date
				where tenant_id = $1 and employee_id = $2 and end_date is null`,
				tu.TenantID, empID, hireDate); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to end prior assignment.", "ERR_INTERNAL")
				return
			}
			var assignID int64
			var jobOrderArg any
			if jobOrderID > 0 {
				jobOrderArg = jobOrderID
			}
			err = tx.QueryRow(r.Context(), `
				insert into public.hr_assignments (tenant_id, employee_id, site_id, start_date, job_order_id)
				values ($1,$2,$3,$4::date,$5) returning id`,
				tu.TenantID, empID, siteID, hireDate, jobOrderArg).Scan(&assignID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to place assignment.", "ERR_INTERNAL")
				return
			}
			_ = assignID
		}

		if _, err := tx.Exec(r.Context(), `
			update public.hr_applications set status = 'hired', updated_at = now()
			where id = $1 and tenant_id = $2`, appID, tu.TenantID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update application.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to convert.", "ERR_INTERNAL")
			return
		}

		caseID, onboardErr := spawnHireOnboarding(r.Context(), pool, tu.TenantID, empID, nil)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "hr.application.convert_hire", "hr_application", &appID, nil, map[string]any{
			"employee_id": empID, "onboarding_case_id": caseID, "onboarding_error": fmt.Sprintf("%v", onboardErr),
		})
		out := map[string]any{"employee_id": empID, "application_id": appID}
		if onboardErr == nil && caseID > 0 {
			out["onboarding_case_id"] = caseID
		}
		response.OK(w, out, "Converted to employee.")
	}
}

func nextConvertEmployeeNo(ctx context.Context, tx pgx.Tx, tenantID int64) (string, error) {
	var n int
	if err := tx.QueryRow(ctx, `
		select coalesce(max(nullif(regexp_replace(employee_no, '\D', '', 'g'), '')::int), 0) + 1
		from public.hr_employees where tenant_id = $1 and deleted_at is null`, tenantID).Scan(&n); err != nil {
		return "", err
	}
	return fmt.Sprintf("HIRE-%d", n), nil
}
