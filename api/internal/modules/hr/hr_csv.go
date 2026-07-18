package hr

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"mime/multipart"
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

const (
	hrImportMaxRows  = 500
	hrImportMaxBytes = 5 << 20
)

var employeeCSVHeaders = []string{
	"employee_no", "full_name", "department", "job_title", "hire_date", "status", "base_salary",
	"email", "tin", "sss_no", "philhealth_no", "pagibig_no", "tax_status",
}
var employeeCSVExample = []string{
	"00001", "Juan dela Cruz", "Operations", "Staff", "2024-01-15", "active", "25000",
	"juan@example.com", "123-456-789", "34-1234567-8", "12-345678901-2", "1212-3456-7890", "S",
}

var dtrCSVHeaders = []string{
	"employee_no", "work_date", "status", "hours_worked", "ot_hours", "night_diff_hours",
}
var dtrCSVExample = []string{"00001", "2026-01-15", "present", "8", "0", "0"}

type hrImportRowError struct {
	Row     int    `json:"row"`
	Message string `json:"message"`
}

type hrImportResult struct {
	Created   int                `json:"created"`
	Updated   int                `json:"updated"`
	Failed    int                `json:"failed"`
	RowErrors []hrImportRowError `json:"row_errors,omitempty"`
}

func registerEmployeeCSVRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("hr.employees", auth.AccessRead)).Get("/employees/import-template.csv", employeeImportTemplateHandler())
	r.With(auth.RequirePermission("hr.employees", auth.AccessRead)).Get("/employees/export.csv", exportEmployeesCSV(pool))
	r.With(auth.RequirePermission("hr.employees_new", auth.AccessWrite)).Post("/employees/import", importEmployeesCSV(pool))
	r.With(auth.RequirePermission("hr.employees_new", auth.AccessWrite)).Post("/employees/import-mapped", importEmployeesMappedCSV(pool))
}

func registerAttendanceCSVRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("hr.attendance", auth.AccessRead)).Get("/dtr/import-template.csv", dtrImportTemplateHandler())
	r.With(auth.RequirePermission("hr.attendance", auth.AccessWrite)).Post("/dtr/import", importDTRCSV(pool))
	r.With(auth.RequirePermission("hr.attendance", auth.AccessWrite)).Post("/dtr/import-mapped", importDTRMappedCSV(pool))
}

func registerPayrollCSVRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("hr.payroll_runs", auth.AccessRead)).Get("/pay-periods/{id}/register.csv", exportPayrollRegisterCSV(pool))
}

func employeeImportTemplateHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeCSVAttachment(w, "employees-import-template.csv", employeeCSVHeaders, [][]string{employeeCSVExample})
	}
}

func dtrImportTemplateHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeCSVAttachment(w, "dtr-import-template.csv", dtrCSVHeaders, [][]string{dtrCSVExample})
	}
}

func exportEmployeesCSV(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		where := "tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if st := strings.TrimSpace(r.URL.Query().Get("status")); st != "" {
			where += fmt.Sprintf(" and status = $%d", n)
			args = append(args, st)
			n++
		}
		if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
			where += fmt.Sprintf(" and (employee_no ilike $%d or full_name ilike $%d or department ilike $%d)", n, n, n)
			args = append(args, "%"+q+"%")
			n++
		}
		q := fmt.Sprintf(`
			select employee_no, full_name, department, job_title, hire_date::text, status, base_salary::float8,
			  coalesce(email,''), coalesce(tin,''), coalesce(sss_no,''), coalesce(philhealth_no,''),
			  coalesce(pagibig_no,''), coalesce(tax_status,'S')
			from public.hr_employees where %s order by full_name`, where)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export employees.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var data [][]string
		for rows.Next() {
			var no, name, dept, title, hire, status, email, tin, sss, ph, pag, tax string
			var salary float64
			if err := rows.Scan(&no, &name, &dept, &title, &hire, &status, &salary, &email, &tin, &sss, &ph, &pag, &tax); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read employee.", "ERR_INTERNAL")
				return
			}
			data = append(data, []string{
				no, name, dept, title, hire, status, fmt.Sprintf("%.2f", salary),
				email, tin, sss, ph, pag, tax,
			})
		}
		writeCSVAttachment(w, "employees-export.csv", employeeCSVHeaders, data)
	}
}

func importEmployeesCSV(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		records, err := readCSVUpload(r)
		if err != nil {
			response.Validation(w, map[string]string{"file": err.Error()})
			return
		}
		result, err := importEmployeesFromRecords(r.Context(), pool, tu, records)
		if err != nil {
			response.Validation(w, map[string]string{"file": err.Error()})
			return
		}
		msg := fmt.Sprintf("Imported %d, updated %d, %d failed.", result.Created, result.Updated, result.Failed)
		response.OK(w, result, msg)
	}
}

func importEmployeesMappedCSV(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		records, colMap, err := readMappedCSVUpload(r, pool, tu.TenantID, "employees")
		if err != nil {
			response.Validation(w, map[string]string{"file": err.Error()})
			return
		}
		remapped, err := remapCSVWithColumnMap(records, colMap, []string{"employee_no", "full_name"}, employeeCSVHeaders)
		if err != nil {
			response.Validation(w, map[string]string{"column_map": err.Error()})
			return
		}
		result, err := importEmployeesFromRecords(r.Context(), pool, tu, remapped)
		if err != nil {
			response.Validation(w, map[string]string{"file": err.Error()})
			return
		}
		msg := fmt.Sprintf("Imported %d, updated %d, %d failed.", result.Created, result.Updated, result.Failed)
		response.OK(w, result, msg)
	}
}

func importEmployeesFromRecords(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, records [][]string) (hrImportResult, error) {
	result := hrImportResult{}
	if len(records) < 2 {
		return result, fmt.Errorf("CSV must include a header row and at least one data row")
	}
	colIdx, err := hrMapCSVHeaders(records[0], []string{"employee_no", "full_name"})
	if err != nil {
		return result, err
	}
	for i, raw := range records[1:] {
		rowNum := i + 2
		if hrIsEmptyCSVRow(raw) {
			continue
		}
		row := hrExtractCSVRow(raw, colIdx, employeeCSVHeaders)
		body := employeeBody{
			EmployeeNo:   row["employee_no"],
			FullName:     row["full_name"],
			Department:   row["department"],
			JobTitle:     row["job_title"],
			HireDate:     row["hire_date"],
			Status:       row["status"],
			Email:        strPtrOrNil(row["email"]),
			TIN:          strPtrOrNil(row["tin"]),
			SSSNo:        strPtrOrNil(row["sss_no"]),
			PhilHealthNo: strPtrOrNil(row["philhealth_no"]),
			PagibigNo:    strPtrOrNil(row["pagibig_no"]),
			TaxStatus:    strPtrOrNil(row["tax_status"]),
		}
		if salary, err := hrParseCSVFloat(row["base_salary"], "base_salary"); err != nil {
			result.Failed++
			result.RowErrors = append(result.RowErrors, hrImportRowError{Row: rowNum, Message: err.Error()})
			continue
		} else {
			body.BaseSalary = salary
		}
		if errs := validateEmployeeBody(body); errs != nil {
			result.Failed++
			msg := strings.Join(mapValues(errs), "; ")
			result.RowErrors = append(result.RowErrors, hrImportRowError{Row: rowNum, Message: msg})
			continue
		}
		hireDate, err := parseDate(body.HireDate)
		if err != nil {
			result.Failed++
			result.RowErrors = append(result.RowErrors, hrImportRowError{Row: rowNum, Message: "Invalid hire_date."})
			continue
		}
		var existingID int64
		err = pool.QueryRow(ctx, `
			select id from public.hr_employees where tenant_id=$1 and employee_no=$2`,
			tu.TenantID, strings.TrimSpace(body.EmployeeNo)).Scan(&existingID)
		if err == nil {
			_, err = pool.Exec(ctx, `
				update public.hr_employees set
				  full_name=$3, department=$4, job_title=$5, hire_date=$6, status=$7, base_salary=$8,
				  email=$9, tin=$10, sss_no=$11, philhealth_no=$12, pagibig_no=$13, tax_status=$14, updated_at=now()
				where id=$1 and tenant_id=$2`,
				existingID, tu.TenantID,
				strings.TrimSpace(body.FullName), strings.TrimSpace(body.Department), strings.TrimSpace(body.JobTitle),
				hireDate, normalizeEmployeeStatus(body.Status), body.BaseSalary,
				body.Email, strPtrVal(body.TIN), strPtrVal(body.SSSNo), strPtrVal(body.PhilHealthNo),
				strPtrVal(body.PagibigNo), normalizeTaxStatus(strPtrVal(body.TaxStatus)),
			)
			if err != nil {
				result.Failed++
				result.RowErrors = append(result.RowErrors, hrImportRowError{Row: rowNum, Message: "Update failed."})
				continue
			}
			result.Updated++
			continue
		}
		var id int64
		err = pool.QueryRow(ctx, `
			insert into public.hr_employees (
			  tenant_id, employee_no, full_name, department, job_title, hire_date, status, base_salary,
			  email, tin, sss_no, philhealth_no, pagibig_no, tax_status
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
			tu.TenantID, strings.TrimSpace(body.EmployeeNo), strings.TrimSpace(body.FullName),
			strings.TrimSpace(body.Department), strings.TrimSpace(body.JobTitle), hireDate,
			normalizeEmployeeStatus(body.Status), body.BaseSalary,
			body.Email, strPtrVal(body.TIN), strPtrVal(body.SSSNo), strPtrVal(body.PhilHealthNo),
			strPtrVal(body.PagibigNo), normalizeTaxStatus(strPtrVal(body.TaxStatus)),
		).Scan(&id)
		if err != nil {
			result.Failed++
			result.RowErrors = append(result.RowErrors, hrImportRowError{Row: rowNum, Message: "Insert failed."})
			continue
		}
		_ = audit.Log(ctx, pool, tu.TenantID, tu.AppUserID, "hr.employee.import", "hr_employee", &id, nil, body)
		result.Created++
	}
	return result, nil
}

func importDTRCSV(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		records, err := readCSVUpload(r)
		if err != nil {
			response.Validation(w, map[string]string{"file": err.Error()})
			return
		}
		result, err := importDTRFromRecords(r.Context(), pool, tu, records)
		if err != nil {
			response.Validation(w, map[string]string{"file": err.Error()})
			return
		}
		msg := fmt.Sprintf("Imported %d DTR row(s); %d failed.", result.Created, result.Failed)
		response.OK(w, result, msg)
	}
}

func importDTRMappedCSV(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		records, colMap, err := readMappedCSVUpload(r, pool, tu.TenantID, "dtr")
		if err != nil {
			response.Validation(w, map[string]string{"file": err.Error()})
			return
		}
		remapped, err := remapCSVWithColumnMap(records, colMap, []string{"employee_no", "work_date"}, dtrCSVHeaders)
		if err != nil {
			response.Validation(w, map[string]string{"column_map": err.Error()})
			return
		}
		result, err := importDTRFromRecords(r.Context(), pool, tu, remapped)
		if err != nil {
			response.Validation(w, map[string]string{"file": err.Error()})
			return
		}
		msg := fmt.Sprintf("Imported %d DTR row(s); %d failed.", result.Created, result.Failed)
		response.OK(w, result, msg)
	}
}

func importDTRFromRecords(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, records [][]string) (hrImportResult, error) {
	result := hrImportResult{}
	if len(records) < 2 {
		return result, fmt.Errorf("CSV must include a header row and at least one data row")
	}
	colIdx, err := hrMapCSVHeaders(records[0], []string{"employee_no", "work_date"})
	if err != nil {
		return result, err
	}
	for i, raw := range records[1:] {
		rowNum := i + 2
		if hrIsEmptyCSVRow(raw) {
			continue
		}
		row := hrExtractCSVRow(raw, colIdx, dtrCSVHeaders)
		empNo := strings.TrimSpace(row["employee_no"])
		if empNo == "" {
			result.Failed++
			result.RowErrors = append(result.RowErrors, hrImportRowError{Row: rowNum, Message: "employee_no is required."})
			continue
		}
		var employeeID int64
		if err := pool.QueryRow(ctx, `
			select id from public.hr_employees where tenant_id=$1 and employee_no=$2`,
			tu.TenantID, empNo).Scan(&employeeID); err != nil {
			result.Failed++
			result.RowErrors = append(result.RowErrors, hrImportRowError{Row: rowNum, Message: "Employee not found: " + empNo})
			continue
		}
		workDate, err := time.Parse("2006-01-02", strings.TrimSpace(row["work_date"]))
		if err != nil {
			result.Failed++
			result.RowErrors = append(result.RowErrors, hrImportRowError{Row: rowNum, Message: "Invalid work_date."})
			continue
		}
		st := strings.ToLower(strings.TrimSpace(row["status"]))
		if st == "" {
			st = "present"
		}
		validStatus := map[string]bool{"present": true, "absent": true, "leave": true, "holiday": true, "rest": true, "awol": true}
		if !validStatus[st] {
			result.Failed++
			result.RowErrors = append(result.RowErrors, hrImportRowError{Row: rowNum, Message: "Invalid status."})
			continue
		}
		hours, err := hrParseCSVFloat(row["hours_worked"], "hours_worked")
		if err != nil {
			result.Failed++
			result.RowErrors = append(result.RowErrors, hrImportRowError{Row: rowNum, Message: err.Error()})
			continue
		}
		ot, err := hrParseCSVFloat(row["ot_hours"], "ot_hours")
		if err != nil {
			result.Failed++
			result.RowErrors = append(result.RowErrors, hrImportRowError{Row: rowNum, Message: err.Error()})
			continue
		}
		nd, err := hrParseCSVFloat(row["night_diff_hours"], "night_diff_hours")
		if err != nil {
			result.Failed++
			result.RowErrors = append(result.RowErrors, hrImportRowError{Row: rowNum, Message: err.Error()})
			continue
		}
		if err := upsertDTRRow(ctx, pool, tu.TenantID, employeeID, workDate, "import", st, hours, ot, nd, nil); err != nil {
			result.Failed++
			result.RowErrors = append(result.RowErrors, hrImportRowError{Row: rowNum, Message: "Save failed."})
			continue
		}
		result.Created++
	}
	return result, nil
}

func upsertDTRRow(ctx context.Context, pool *pgxpool.Pool, tenantID, employeeID int64, workDate time.Time, source, status string, hours, ot, nd float64, notes *string) error {
	var holidayID *int64
	var hidVal int64
	var dummy string
	err := pool.QueryRow(ctx, `
		select id, name from public.hr_holidays
		where tenant_id=$1 and holiday_date=$2 and is_active limit 1`, tenantID, workDate).Scan(&hidVal, &dummy)
	if err == nil {
		holidayID = &hidVal
	}
	if holidayID != nil && status == "present" {
		status = "holiday"
	}
	_, err = pool.Exec(ctx, `
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
		  updated_at = now()`,
		tenantID, employeeID, workDate, source, status, hours, ot, nd, holidayID, notes)
	return err
}

func exportPayrollRegisterCSV(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		periodID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || periodID <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid pay period id."})
			return
		}
		var label string
		if err := pool.QueryRow(r.Context(), `
			select period_label from public.hr_pay_periods where id=$1 and tenant_id=$2`,
			periodID, tu.TenantID).Scan(&label); err != nil {
			response.Err(w, http.StatusNotFound, "Pay period not found.", "ERR_NOT_FOUND")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select e.employee_no, e.full_name, ps.gross_pay::float8, ps.deductions::float8, ps.net_pay::float8, ps.status,
			  coalesce((select sum(amount)::float8 from public.hr_payslip_lines pl
			    where pl.payslip_id = ps.id and pl.line_code = 'BASIC'), 0),
			  coalesce((select sum(amount)::float8 from public.hr_payslip_lines pl
			    where pl.payslip_id = ps.id and pl.line_code = 'OT_PAY'), 0),
			  coalesce((select sum(amount)::float8 from public.hr_payslip_lines pl
			    where pl.payslip_id = ps.id and pl.line_code = 'ND_PAY'), 0),
			  coalesce((select sum(amount)::float8 from public.hr_payslip_lines pl
			    where pl.payslip_id = ps.id and pl.line_code = 'HOLIDAY_PAY'), 0)
			from public.hr_payslips ps
			join public.hr_employees e on e.id = ps.employee_id
			where ps.tenant_id = $1 and ps.pay_period_id = $2
			order by e.full_name`, tu.TenantID, periodID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export register.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		headers := []string{"period_label", "employee_no", "employee_name", "basic_pay", "ot_pay", "nd_pay", "holiday_pay", "gross_pay", "deductions", "net_pay", "status"}
		var data [][]string
		for rows.Next() {
			var no, name, status string
			var gross, ded, net, basic, ot, nd, hol float64
			if err := rows.Scan(&no, &name, &gross, &ded, &net, &status, &basic, &ot, &nd, &hol); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read payslip.", "ERR_INTERNAL")
				return
			}
			data = append(data, []string{
				label, no, name,
				fmt.Sprintf("%.2f", basic), fmt.Sprintf("%.2f", ot), fmt.Sprintf("%.2f", nd), fmt.Sprintf("%.2f", hol),
				fmt.Sprintf("%.2f", gross), fmt.Sprintf("%.2f", ded), fmt.Sprintf("%.2f", net), status,
			})
		}
		writeCSVAttachment(w, fmt.Sprintf("payroll-register-%d.csv", periodID), headers, data)
	}
}

func writeRemittanceCSV(w http.ResponseWriter, filename string, headers []string, rows [][]string) {
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	cw := csv.NewWriter(w)
	_ = cw.Write(headers)
	for _, row := range rows {
		_ = cw.Write(row)
	}
	cw.Flush()
}

func remittanceExportHeaders(agency, format string) []string {
	switch strings.ToLower(format) {
	case "sss", "sss_r3":
		// SSS R3-inspired column layout (CSV staging before official electronic file).
		return []string{
			"SSS_NUMBER", "LAST_NAME", "FIRST_NAME", "MIDDLE_NAME",
			"EE_SS", "EE_EC", "ER_SS", "ER_EC", "TOTAL", "PERIOD_YYYYMM",
		}
	case "philhealth", "philhealth_erf":
		return []string{
			"PHILHEALTH_NUMBER", "LAST_NAME", "FIRST_NAME", "MIDDLE_NAME",
			"EE_SHARE", "ER_SHARE", "TOTAL", "PERIOD_YYYYMM",
		}
	case "pagibig", "pagibig_mcrf":
		return []string{
			"PAGIBIG_MID", "LAST_NAME", "FIRST_NAME", "MIDDLE_NAME",
			"EE_SHARE", "ER_SHARE", "TOTAL", "PERIOD_YYYYMM",
		}
	case "bir", "bir_1601c":
		return []string{
			"TIN", "EMPLOYEE_NAME", "TAX_STATUS", "TAXABLE_COMP", "WHT_AMOUNT", "PERIOD_YYYYMM",
		}
	case "generic":
		return []string{"agency", "period", "employee_no", "employee_name", "gov_id", "ee_amount", "er_amount", "other_amount", "total"}
	default:
		return []string{"agency", "period", "employee_no", "employee_name", "gov_id", "ee_amount", "er_amount", "other_amount", "total"}
	}
}

func splitPersonName(full string) (last, first, middle string) {
	parts := strings.Fields(strings.TrimSpace(full))
	switch len(parts) {
	case 0:
		return "", "", ""
	case 1:
		return parts[0], "", ""
	case 2:
		return parts[1], parts[0], ""
	default:
		return parts[len(parts)-1], parts[0], strings.Join(parts[1:len(parts)-1], " ")
	}
}

func remittanceExportRow(agency, label, format string, no, name, gov string, ee, er, other float64) []string {
	total := ee + er + other
	last, first, middle := splitPersonName(name)
	period := strings.ReplaceAll(label, " ", "")
	switch strings.ToLower(format) {
	case "sss", "sss_r3":
		return []string{
			gov, last, first, middle,
			fmt.Sprintf("%.2f", ee), "0.00", fmt.Sprintf("%.2f", er), fmt.Sprintf("%.2f", other),
			fmt.Sprintf("%.2f", total), period,
		}
	case "philhealth", "philhealth_erf":
		return []string{
			gov, last, first, middle,
			fmt.Sprintf("%.2f", ee), fmt.Sprintf("%.2f", er), fmt.Sprintf("%.2f", total), period,
		}
	case "pagibig", "pagibig_mcrf":
		return []string{
			gov, last, first, middle,
			fmt.Sprintf("%.2f", ee), fmt.Sprintf("%.2f", er), fmt.Sprintf("%.2f", total), period,
		}
	case "bir", "bir_1601c":
		return []string{gov, name, "", "", fmt.Sprintf("%.2f", ee), period}
	case "generic":
		return []string{
			agency, label, no, name, gov,
			fmt.Sprintf("%.2f", ee), fmt.Sprintf("%.2f", er), fmt.Sprintf("%.2f", other),
			fmt.Sprintf("%.2f", total),
		}
	default:
		return []string{
			agency, label, no, name, gov,
			fmt.Sprintf("%.2f", ee), fmt.Sprintf("%.2f", er), fmt.Sprintf("%.2f", other),
			fmt.Sprintf("%.2f", total),
		}
	}
}

func readCSVUpload(r *http.Request) ([][]string, error) {
	if err := r.ParseMultipartForm(hrImportMaxBytes); err != nil {
		return nil, fmt.Errorf("invalid upload")
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		return nil, fmt.Errorf("CSV file is required")
	}
	defer file.Close()
	return readCSVFile(file)
}

// readMappedCSVUpload reads the CSV file and resolves column_map from profile_id
// or a column_map JSON form field.
func readMappedCSVUpload(r *http.Request, pool *pgxpool.Pool, tenantID int64, expectKind string) ([][]string, map[string]string, error) {
	if err := r.ParseMultipartForm(hrImportMaxBytes); err != nil {
		return nil, nil, fmt.Errorf("invalid upload")
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		return nil, nil, fmt.Errorf("CSV file is required")
	}
	defer file.Close()
	records, err := readCSVFile(file)
	if err != nil {
		return nil, nil, err
	}
	colMap, err := resolveColumnMapFromForm(r, pool, tenantID, expectKind)
	if err != nil {
		return nil, nil, err
	}
	return records, colMap, nil
}

func resolveColumnMapFromForm(r *http.Request, pool *pgxpool.Pool, tenantID int64, expectKind string) (map[string]string, error) {
	if rawID := strings.TrimSpace(r.FormValue("profile_id")); rawID != "" {
		profileID, err := strconv.ParseInt(rawID, 10, 64)
		if err != nil || profileID <= 0 {
			return nil, fmt.Errorf("invalid profile_id")
		}
		colMap, err := loadImportProfileColumnMap(r.Context(), pool, tenantID, profileID, expectKind)
		if err != nil {
			if err == errImportProfileKindMismatch {
				return nil, fmt.Errorf("import profile kind does not match %s", expectKind)
			}
			return nil, fmt.Errorf("import profile not found")
		}
		return colMap, nil
	}
	rawMap := strings.TrimSpace(r.FormValue("column_map"))
	if rawMap == "" {
		return nil, fmt.Errorf("profile_id or column_map is required")
	}
	var colMap map[string]string
	if err := json.Unmarshal([]byte(rawMap), &colMap); err != nil {
		return nil, fmt.Errorf("column_map must be valid JSON object")
	}
	if colMap == nil {
		colMap = map[string]string{}
	}
	return colMap, nil
}

// remapCSVWithColumnMap remaps CSV rows so headers become canonical keys.
// columnMap maps canonical key → source CSV header name in the uploaded file.
func remapCSVWithColumnMap(records [][]string, columnMap map[string]string, required, canonicalHeaders []string) ([][]string, error) {
	if err := validateColumnMapRequired(columnMap, required); err != nil {
		return nil, err
	}
	if len(records) < 1 {
		return nil, fmt.Errorf("CSV must include a header row")
	}
	fileIdx := map[string]int{}
	for i, h := range records[0] {
		key := strings.ToLower(strings.TrimSpace(h))
		if key != "" {
			fileIdx[key] = i
		}
	}
	srcIdx := map[string]int{}
	for canonical, sourceHeader := range columnMap {
		canonical = strings.ToLower(strings.TrimSpace(canonical))
		sourceHeader = strings.TrimSpace(sourceHeader)
		if canonical == "" || sourceHeader == "" {
			continue
		}
		i, ok := fileIdx[strings.ToLower(sourceHeader)]
		if !ok {
			return nil, fmt.Errorf("column_map source header not found in file: %s", sourceHeader)
		}
		srcIdx[canonical] = i
	}
	for _, col := range required {
		if _, ok := srcIdx[col]; !ok {
			return nil, fmt.Errorf("missing required column mapping: %s", col)
		}
	}
	out := make([][]string, 0, len(records))
	out = append(out, append([]string(nil), canonicalHeaders...))
	for _, raw := range records[1:] {
		if hrIsEmptyCSVRow(raw) {
			continue
		}
		row := make([]string, len(canonicalHeaders))
		for i, col := range canonicalHeaders {
			if idx, ok := srcIdx[col]; ok && idx < len(raw) {
				row[i] = strings.TrimSpace(raw[idx])
			}
		}
		out = append(out, row)
	}
	if len(out) < 2 {
		return nil, fmt.Errorf("CSV must include a header row and at least one data row")
	}
	return out, nil
}

// validateColumnMapRequired ensures required canonical keys are present in the map
// with non-empty source header names.
func validateColumnMapRequired(columnMap map[string]string, required []string) error {
	if columnMap == nil {
		return fmt.Errorf("column_map is required")
	}
	var missing []string
	for _, col := range required {
		src, ok := columnMap[col]
		if !ok || strings.TrimSpace(src) == "" {
			missing = append(missing, col)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("missing required column mapping: %s", strings.Join(missing, ", "))
	}
	return nil
}

func readCSVFile(file multipart.File) ([][]string, error) {
	records, err := csv.NewReader(file).ReadAll()
	if err != nil {
		return nil, fmt.Errorf("could not read CSV")
	}
	if len(records) < 2 {
		return nil, fmt.Errorf("CSV must include a header row and at least one data row")
	}
	if len(records)-1 > hrImportMaxRows {
		return nil, fmt.Errorf("maximum %d rows per import", hrImportMaxRows)
	}
	return records, nil
}

func writeCSVAttachment(w http.ResponseWriter, filename string, headers []string, rows [][]string) {
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	cw := csv.NewWriter(w)
	_ = cw.Write(headers)
	for _, row := range rows {
		_ = cw.Write(row)
	}
	cw.Flush()
}

func hrMapCSVHeaders(headerRow []string, required []string) (map[string]int, error) {
	idx := map[string]int{}
	for i, h := range headerRow {
		key := strings.ToLower(strings.TrimSpace(h))
		if key != "" {
			idx[key] = i
		}
	}
	for _, col := range required {
		if _, ok := idx[col]; !ok {
			return nil, fmt.Errorf("missing required column: %s", col)
		}
	}
	return idx, nil
}

func hrExtractCSVRow(raw []string, colIdx map[string]int, headers []string) map[string]string {
	row := make(map[string]string, len(headers))
	for _, col := range headers {
		if i, ok := colIdx[col]; ok && i < len(raw) {
			row[col] = strings.TrimSpace(raw[i])
		}
	}
	return row
}

func hrIsEmptyCSVRow(row []string) bool {
	for _, c := range row {
		if strings.TrimSpace(c) != "" {
			return false
		}
	}
	return true
}

func hrParseCSVFloat(raw, field string) (float64, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0, nil
	}
	v, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return 0, fmt.Errorf("%s must be a number", field)
	}
	return v, nil
}

func strPtrOrNil(s string) *string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return &s
}

func mapValues(m map[string]string) []string {
	out := make([]string, 0, len(m))
	for _, v := range m {
		if v != "" {
			out = append(out, v)
		}
	}
	return out
}
