package hr

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type LeaveType struct {
	ID           int64   `json:"id"`
	Code         string  `json:"code"`
	Name         string  `json:"name"`
	IsPaid       bool    `json:"is_paid"`
	IsCashable   bool    `json:"is_cashable"`
	AnnualCredit float64 `json:"annual_credit"`
	CarryOverCap float64 `json:"carry_over_cap"`
	IsActive     bool    `json:"is_active"`
	SortOrder    int     `json:"sort_order"`
}

type LeaveBalance struct {
	ID            int64   `json:"id"`
	EmployeeID    int64   `json:"employee_id"`
	EmployeeNo    string  `json:"employee_no,omitempty"`
	EmployeeName  string  `json:"employee_name,omitempty"`
	LeaveTypeID   int64   `json:"leave_type_id"`
	LeaveCode     string  `json:"leave_code,omitempty"`
	LeaveName     string  `json:"leave_name,omitempty"`
	IsCashable    bool    `json:"is_cashable"`
	BalanceYear   int     `json:"balance_year"`
	Opening       float64 `json:"opening_balance"`
	Accrued       float64 `json:"accrued"`
	Used          float64 `json:"used"`
	Reserved      float64 `json:"reserved"`
	Adjusted      float64 `json:"adjusted"`
	Available     float64 `json:"available"`
}

type LeaveRequest struct {
	ID             int64   `json:"id"`
	EmployeeID     int64   `json:"employee_id"`
	EmployeeNo     string  `json:"employee_no,omitempty"`
	EmployeeName   string  `json:"employee_name,omitempty"`
	LeaveTypeID    int64   `json:"leave_type_id"`
	LeaveCode      string  `json:"leave_code,omitempty"`
	LeaveName      string  `json:"leave_name,omitempty"`
	DateFrom       string  `json:"date_from"`
	DateTo         string  `json:"date_to"`
	Days           float64 `json:"days"`
	Status         string  `json:"status"`
	Reason         string  `json:"reason"`
	ReviewNotes    *string `json:"review_notes,omitempty"`
	ReviewedAt     *string `json:"reviewed_at,omitempty"`
}

func registerLeaveRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("hr.leave", auth.AccessRead)).Get("/leave-types", listLeaveTypes(pool))
	r.With(auth.RequirePermission("hr.leave", auth.AccessWrite)).Post("/leave-types", createLeaveType(pool))
	r.With(auth.RequirePermission("hr.leave", auth.AccessWrite)).Patch("/leave-types/{id}", patchLeaveType(pool))

	r.With(auth.RequirePermission("hr.leave", auth.AccessRead)).Get("/leave-balances", listLeaveBalances(pool))
	r.With(auth.RequirePermission("hr.leave", auth.AccessWrite)).Post("/leave-balances/accrue", accrueLeaveBalances(pool))
	r.With(auth.RequirePermission("hr.leave", auth.AccessWrite)).Post("/leave-balances/adjust", adjustLeaveBalance(pool))

	r.With(auth.RequirePermission("hr.leave", auth.AccessRead)).Get("/leave-requests", listLeaveRequests(pool))
	r.With(auth.RequirePermission("hr.leave", auth.AccessWrite)).Post("/leave-requests", createLeaveRequest(pool))
	r.With(auth.RequirePermission("hr.leave", auth.AccessWrite)).Post("/leave-requests/{id}/approve", approveLeaveRequest(pool))
	r.With(auth.RequirePermission("hr.leave", auth.AccessWrite)).Post("/leave-requests/{id}/reject", rejectLeaveRequest(pool))
	r.With(auth.RequirePermission("hr.leave", auth.AccessWrite)).Post("/leave-requests/{id}/cancel", cancelLeaveRequest(pool))
}

func listLeaveTypes(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, code, name, is_paid, is_cashable, annual_credit::float8, carry_over_cap::float8, is_active, sort_order
			from public.hr_leave_types where tenant_id=$1 order by sort_order, code`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load leave types.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []LeaveType{}
		for rows.Next() {
			var row LeaveType
			if err := rows.Scan(&row.ID, &row.Code, &row.Name, &row.IsPaid, &row.IsCashable, &row.AnnualCredit, &row.CarryOverCap, &row.IsActive, &row.SortOrder); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read leave type.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		response.OK(w, out, "OK")
	}
}

func createLeaveType(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body LeaveType
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		code := strings.ToUpper(strings.TrimSpace(body.Code))
		name := strings.TrimSpace(body.Name)
		if code == "" || name == "" {
			response.Validation(w, map[string]string{"code": "Code and name required."})
			return
		}
		err := pool.QueryRow(r.Context(), `
			insert into public.hr_leave_types
			  (tenant_id, code, name, is_paid, is_cashable, annual_credit, carry_over_cap, sort_order)
			values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
			tu.TenantID, code, name, body.IsPaid, body.IsCashable, body.AnnualCredit, body.CarryOverCap, body.SortOrder,
		).Scan(&body.ID)
		if err != nil {
			response.Err(w, http.StatusConflict, "Could not create leave type (duplicate code?).", "ERR_CONFLICT")
			return
		}
		body.Code, body.Name, body.IsActive = code, name, true
		response.OK(w, body, "Created.")
	}
}

func patchLeaveType(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		sets := []string{"updated_at = now()"}
		args := []any{id, tu.TenantID}
		n := 3
		if v, ok := body["name"].(string); ok {
			sets = append(sets, fmt.Sprintf("name = $%d", n))
			args = append(args, strings.TrimSpace(v))
			n++
		}
		if v, ok := body["is_paid"].(bool); ok {
			sets = append(sets, fmt.Sprintf("is_paid = $%d", n))
			args = append(args, v)
			n++
		}
		if v, ok := body["is_cashable"].(bool); ok {
			sets = append(sets, fmt.Sprintf("is_cashable = $%d", n))
			args = append(args, v)
			n++
		}
		if v, ok := body["annual_credit"].(float64); ok {
			sets = append(sets, fmt.Sprintf("annual_credit = $%d", n))
			args = append(args, v)
			n++
		}
		if v, ok := body["carry_over_cap"].(float64); ok {
			sets = append(sets, fmt.Sprintf("carry_over_cap = $%d", n))
			args = append(args, v)
			n++
		}
		if v, ok := body["is_active"].(bool); ok {
			sets = append(sets, fmt.Sprintf("is_active = $%d", n))
			args = append(args, v)
			n++
		}
		tag, err := pool.Exec(r.Context(), fmt.Sprintf(`update public.hr_leave_types set %s where id=$1 and tenant_id=$2`, strings.Join(sets, ", ")), args...)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Leave type not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Updated.")
	}
}

func availableDays(b LeaveBalance) float64 {
	return roundMoney(b.Opening + b.Accrued + b.Adjusted - b.Used - b.Reserved)
}

func listLeaveBalances(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		year := time.Now().Year()
		if y := strings.TrimSpace(r.URL.Query().Get("year")); y != "" {
			if n, err := strconv.Atoi(y); err == nil {
				year = n
			}
		}
		args := []any{tu.TenantID, year}
		where := "b.tenant_id=$1 and b.balance_year=$2"
		if emp := strings.TrimSpace(r.URL.Query().Get("employee_id")); emp != "" {
			if id, err := strconv.ParseInt(emp, 10, 64); err == nil {
				where += " and b.employee_id=$3"
				args = append(args, id)
			}
		}
		rows, err := pool.Query(r.Context(), fmt.Sprintf(`
			select b.id, b.employee_id, e.employee_no, e.full_name, b.leave_type_id, lt.code, lt.name, lt.is_cashable,
			  b.balance_year, b.opening_balance::float8, b.accrued::float8, b.used::float8, b.reserved::float8, b.adjusted::float8
			from public.hr_leave_balances b
			join public.hr_employees e on e.id=b.employee_id
			join public.hr_leave_types lt on lt.id=b.leave_type_id
			where %s
			order by e.full_name, lt.sort_order`, where), args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load balances.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []LeaveBalance{}
		for rows.Next() {
			var row LeaveBalance
			if err := rows.Scan(&row.ID, &row.EmployeeID, &row.EmployeeNo, &row.EmployeeName, &row.LeaveTypeID, &row.LeaveCode, &row.LeaveName, &row.IsCashable,
				&row.BalanceYear, &row.Opening, &row.Accrued, &row.Used, &row.Reserved, &row.Adjusted); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read balance.", "ERR_INTERNAL")
				return
			}
			row.Available = availableDays(row)
			out = append(out, row)
		}
		response.OK(w, out, "OK")
	}
}

func ensureLeaveBalance(ctx context.Context, tx pgx.Tx, tenantID, empID, typeID int64, year int) (int64, error) {
	var id int64
	err := tx.QueryRow(ctx, `
		insert into public.hr_leave_balances (tenant_id, employee_id, leave_type_id, balance_year)
		values ($1,$2,$3,$4)
		on conflict (tenant_id, employee_id, leave_type_id, balance_year) do update set updated_at=now()
		returning id`, tenantID, empID, typeID, year).Scan(&id)
	return id, err
}

func accrueLeaveBalances(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body struct {
			Year       int    `json:"year"`
			EmployeeID *int64 `json:"employee_id"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		year := body.Year
		if year <= 0 {
			year = time.Now().Year()
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		typeRows, err := tx.Query(r.Context(), `
			select id, annual_credit::float8 from public.hr_leave_types
			where tenant_id=$1 and is_active and annual_credit > 0`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load types.", "ERR_INTERNAL")
			return
		}
		typeCredits := map[int64]float64{}
		for typeRows.Next() {
			var tid int64
			var credit float64
			_ = typeRows.Scan(&tid, &credit)
			typeCredits[tid] = credit
		}
		typeRows.Close()

		empQ := `select id from public.hr_employees where tenant_id=$1 and status='active'`
		args := []any{tu.TenantID}
		if body.EmployeeID != nil && *body.EmployeeID > 0 {
			empQ += ` and id=$2`
			args = append(args, *body.EmployeeID)
		}
		emps, err := tx.Query(r.Context(), empQ, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load employees.", "ERR_INTERNAL")
			return
		}
		var empIDs []int64
		for emps.Next() {
			var eid int64
			_ = emps.Scan(&eid)
			empIDs = append(empIDs, eid)
		}
		emps.Close()

		count := 0
		for _, eid := range empIDs {
			for tid, credit := range typeCredits {
				if _, err := ensureLeaveBalance(r.Context(), tx, tu.TenantID, eid, tid, year); err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to ensure balance.", "ERR_INTERNAL")
					return
				}
				tag, err := tx.Exec(r.Context(), `
					update public.hr_leave_balances set accrued=$4, updated_at=now()
					where tenant_id=$1 and employee_id=$2 and leave_type_id=$3 and balance_year=$5
					  and accrued = 0`,
					tu.TenantID, eid, tid, credit, year)
				if err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to accrue.", "ERR_INTERNAL")
					return
				}
				if tag.RowsAffected() > 0 {
					_, _ = tx.Exec(r.Context(), `
						insert into public.hr_leave_ledger
						  (tenant_id, employee_id, leave_type_id, balance_year, entry_kind, days, notes, created_by_user_id)
						values ($1,$2,$3,$4,'accrual',$5,'Annual credit',$6)`,
						tu.TenantID, eid, tid, year, credit, tu.AppUserID)
					count++
				}
			}
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"accrued_rows": count, "year": year}, "Accrual applied where opening accrued was zero.")
	}
}

func adjustLeaveBalance(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body struct {
			EmployeeID  int64   `json:"employee_id"`
			LeaveTypeID int64   `json:"leave_type_id"`
			Year        int     `json:"year"`
			Days        float64 `json:"days"`
			Notes       string  `json:"notes"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.EmployeeID <= 0 || body.LeaveTypeID <= 0 {
			response.Validation(w, map[string]string{"employee_id": "employee_id and leave_type_id required."})
			return
		}
		year := body.Year
		if year <= 0 {
			year = time.Now().Year()
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		if _, err := ensureLeaveBalance(r.Context(), tx, tu.TenantID, body.EmployeeID, body.LeaveTypeID, year); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to ensure balance.", "ERR_INTERNAL")
			return
		}
		_, err = tx.Exec(r.Context(), `
			update public.hr_leave_balances set adjusted = adjusted + $4, updated_at=now()
			where tenant_id=$1 and employee_id=$2 and leave_type_id=$3 and balance_year=$5`,
			tu.TenantID, body.EmployeeID, body.LeaveTypeID, body.Days, year)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to adjust.", "ERR_INTERNAL")
			return
		}
		_, _ = tx.Exec(r.Context(), `
			insert into public.hr_leave_ledger
			  (tenant_id, employee_id, leave_type_id, balance_year, entry_kind, days, notes, created_by_user_id)
			values ($1,$2,$3,$4,'adjustment',$5,$6,$7)`,
			tu.TenantID, body.EmployeeID, body.LeaveTypeID, year, body.Days, strings.TrimSpace(body.Notes), tu.AppUserID)
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"ok": true}, "Adjusted.")
	}
}

func listLeaveRequests(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "created_at", map[string]string{"created_at": "lr.created_at"})
		offset := httputil.Offset(p)
		where := "lr.tenant_id=$1"
		args := []any{tu.TenantID}
		n := 2
		if st := strings.TrimSpace(r.URL.Query().Get("status")); st != "" {
			where += fmt.Sprintf(" and lr.status=$%d", n)
			args = append(args, st)
			n++
		}
		if emp := strings.TrimSpace(r.URL.Query().Get("employee_id")); emp != "" {
			if id, err := strconv.ParseInt(emp, 10, 64); err == nil {
				where += fmt.Sprintf(" and lr.employee_id=$%d", n)
				args = append(args, id)
				n++
			}
		}
		rows, err := pool.Query(r.Context(), fmt.Sprintf(`
			select lr.id, lr.employee_id, e.employee_no, e.full_name, lr.leave_type_id, lt.code, lt.name,
			  lr.date_from::text, lr.date_to::text, lr.days::float8, lr.status, lr.reason,
			  lr.review_notes, lr.reviewed_at::text,
			  count(*) over() as total
			from public.hr_leave_requests lr
			join public.hr_employees e on e.id=lr.employee_id
			join public.hr_leave_types lt on lt.id=lr.leave_type_id
			where %s
			order by lr.created_at desc
			limit $%d offset $%d`, where, n, n+1), append(args, p.PageSize, offset)...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load leave requests.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []LeaveRequest{}
		var total int64
		for rows.Next() {
			var row LeaveRequest
			var notes, reviewed sql.NullString
			if err := rows.Scan(&row.ID, &row.EmployeeID, &row.EmployeeNo, &row.EmployeeName, &row.LeaveTypeID, &row.LeaveCode, &row.LeaveName,
				&row.DateFrom, &row.DateTo, &row.Days, &row.Status, &row.Reason, &notes, &reviewed, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read request.", "ERR_INTERNAL")
				return
			}
			if notes.Valid {
				row.ReviewNotes = &notes.String
			}
			if reviewed.Valid {
				row.ReviewedAt = &reviewed.String
			}
			out = append(out, row)
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func businessDaysInclusive(from, to time.Time) float64 {
	if to.Before(from) {
		return 0
	}
	days := 0.0
	for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
		wd := d.Weekday()
		if wd != time.Saturday && wd != time.Sunday {
			days++
		}
	}
	return days
}

func createLeaveRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body struct {
			EmployeeID  int64  `json:"employee_id"`
			LeaveTypeID int64  `json:"leave_type_id"`
			DateFrom    string `json:"date_from"`
			DateTo      string `json:"date_to"`
			Days        float64 `json:"days"`
			Reason      string `json:"reason"`
			Status      string `json:"status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		from, err1 := time.Parse("2006-01-02", strings.TrimSpace(body.DateFrom))
		to, err2 := time.Parse("2006-01-02", strings.TrimSpace(body.DateTo))
		if body.EmployeeID <= 0 || body.LeaveTypeID <= 0 || err1 != nil || err2 != nil || to.Before(from) {
			response.Validation(w, map[string]string{"date_from": "Valid employee, leave type, and date range required."})
			return
		}
		days := body.Days
		if days <= 0 {
			days = businessDaysInclusive(from, to)
		}
		if days <= 0 {
			response.Validation(w, map[string]string{"days": "No business days in range."})
			return
		}
		status := strings.ToLower(strings.TrimSpace(body.Status))
		if status == "" {
			status = "submitted"
		}
		if status != "draft" && status != "submitted" {
			status = "submitted"
		}
		year := from.Year()
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		if _, err := ensureLeaveBalance(r.Context(), tx, tu.TenantID, body.EmployeeID, body.LeaveTypeID, year); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to ensure balance.", "ERR_INTERNAL")
			return
		}
		var bal LeaveBalance
		if err := tx.QueryRow(r.Context(), `
			select opening_balance::float8, accrued::float8, used::float8, reserved::float8, adjusted::float8
			from public.hr_leave_balances
			where tenant_id=$1 and employee_id=$2 and leave_type_id=$3 and balance_year=$4`,
			tu.TenantID, body.EmployeeID, body.LeaveTypeID, year,
		).Scan(&bal.Opening, &bal.Accrued, &bal.Used, &bal.Reserved, &bal.Adjusted); err != nil {
			response.Err(w, http.StatusInternalServerError, "Balance not found.", "ERR_INTERNAL")
			return
		}
		if status == "submitted" && availableDays(bal) < days {
			response.Err(w, http.StatusConflict, "Insufficient leave balance.", "ERR_CONFLICT")
			return
		}
		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.hr_leave_requests
			  (tenant_id, employee_id, leave_type_id, date_from, date_to, days, status, reason, created_by_user_id)
			values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
			tu.TenantID, body.EmployeeID, body.LeaveTypeID, from, to, days, status, strings.TrimSpace(body.Reason), tu.AppUserID,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create request.", "ERR_INTERNAL")
			return
		}
		if status == "submitted" {
			_, _ = tx.Exec(r.Context(), `
				update public.hr_leave_balances set reserved = reserved + $4, updated_at=now()
				where tenant_id=$1 and employee_id=$2 and leave_type_id=$3 and balance_year=$5`,
				tu.TenantID, body.EmployeeID, body.LeaveTypeID, days, year)
			_, _ = tx.Exec(r.Context(), `
				insert into public.hr_leave_ledger
				  (tenant_id, employee_id, leave_type_id, balance_year, entry_kind, days, leave_request_id, notes, created_by_user_id)
				values ($1,$2,$3,$4,'reserve',$5,$6,'Reserved on submit',$7)`,
				tu.TenantID, body.EmployeeID, body.LeaveTypeID, year, days, id, tu.AppUserID)
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "hr.leave.request", "hr_leave_request", &id, nil, body)
		response.OK(w, map[string]any{"id": id, "days": days, "status": status}, "Created.")
	}
}

func loadLeaveRequestTX(ctx context.Context, tx pgx.Tx, tenantID, id int64) (empID, typeID int64, days float64, status, dateFrom, dateTo string, err error) {
	err = tx.QueryRow(ctx, `
		select employee_id, leave_type_id, days::float8, status, date_from::text, date_to::text
		from public.hr_leave_requests where id=$1 and tenant_id=$2`, id, tenantID,
	).Scan(&empID, &typeID, &days, &status, &dateFrom, &dateTo)
	return
}

func stampLeaveDTR(ctx context.Context, tx pgx.Tx, tenantID, empID int64, fromS, toS string) {
	from, err1 := time.Parse("2006-01-02", fromS)
	to, err2 := time.Parse("2006-01-02", toS)
	if err1 != nil || err2 != nil {
		return
	}
	for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
		if d.Weekday() == time.Saturday || d.Weekday() == time.Sunday {
			continue
		}
		_, _ = tx.Exec(ctx, `
			insert into public.hr_dtr_entries
			  (tenant_id, employee_id, work_date, source, status, hours_worked, notes)
			values ($1,$2,$3::date,'manual','leave',0,'Approved leave')
			on conflict (tenant_id, employee_id, work_date) do update set
			  status='leave', hours_worked=0, notes=coalesce(public.hr_dtr_entries.notes,'') || E'\nApproved leave', updated_at=now()`,
			tenantID, empID, d.Format("2006-01-02"))
	}
}

func approveLeaveRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body struct {
			Notes string `json:"notes"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		empID, typeID, days, status, fromS, toS, err := loadLeaveRequestTX(r.Context(), tx, tu.TenantID, id)
		if err != nil || status != "submitted" {
			response.Err(w, http.StatusConflict, "Request not found or not submitted.", "ERR_CONFLICT")
			return
		}
		from, _ := time.Parse("2006-01-02", fromS)
		year := from.Year()
		_, err = tx.Exec(r.Context(), `
			update public.hr_leave_balances
			set reserved = greatest(reserved - $4, 0), used = used + $4, updated_at=now()
			where tenant_id=$1 and employee_id=$2 and leave_type_id=$3 and balance_year=$5`,
			tu.TenantID, empID, typeID, days, year)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update balance.", "ERR_INTERNAL")
			return
		}
		_, _ = tx.Exec(r.Context(), `
			insert into public.hr_leave_ledger
			  (tenant_id, employee_id, leave_type_id, balance_year, entry_kind, days, leave_request_id, notes, created_by_user_id)
			values
			  ($1,$2,$3,$4,'release',$5,$6,'Released reservation on approve',$7),
			  ($1,$2,$3,$4,'usage',$5,$6,'Approved usage',$7)`,
			tu.TenantID, empID, typeID, year, days, id, tu.AppUserID)
		_, _ = tx.Exec(r.Context(), `
			update public.hr_leave_requests
			set status='approved', reviewer_user_id=$3, reviewed_at=now(), review_notes=$4, updated_at=now()
			where id=$1 and tenant_id=$2`, id, tu.TenantID, tu.AppUserID, strings.TrimSpace(body.Notes))
		stampLeaveDTR(r.Context(), tx, tu.TenantID, empID, fromS, toS)
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "hr.leave.approve", "hr_leave_request", &id, nil, body)
		response.OK(w, map[string]any{"id": id, "status": "approved"}, "Approved.")
	}
}

func rejectLeaveRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body struct {
			Notes string `json:"notes"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		empID, typeID, days, status, fromS, _, err := loadLeaveRequestTX(r.Context(), tx, tu.TenantID, id)
		if err != nil || status != "submitted" {
			response.Err(w, http.StatusConflict, "Request not found or not submitted.", "ERR_CONFLICT")
			return
		}
		from, _ := time.Parse("2006-01-02", fromS)
		year := from.Year()
		_, _ = tx.Exec(r.Context(), `
			update public.hr_leave_balances set reserved = greatest(reserved - $4, 0), updated_at=now()
			where tenant_id=$1 and employee_id=$2 and leave_type_id=$3 and balance_year=$5`,
			tu.TenantID, empID, typeID, days, year)
		_, _ = tx.Exec(r.Context(), `
			insert into public.hr_leave_ledger
			  (tenant_id, employee_id, leave_type_id, balance_year, entry_kind, days, leave_request_id, notes, created_by_user_id)
			values ($1,$2,$3,$4,'release',$5,$6,'Released on reject',$7)`,
			tu.TenantID, empID, typeID, year, days, id, tu.AppUserID)
		_, _ = tx.Exec(r.Context(), `
			update public.hr_leave_requests
			set status='rejected', reviewer_user_id=$3, reviewed_at=now(), review_notes=$4, updated_at=now()
			where id=$1 and tenant_id=$2`, id, tu.TenantID, tu.AppUserID, strings.TrimSpace(body.Notes))
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": id, "status": "rejected"}, "Rejected.")
	}
}

func cancelLeaveRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		empID, typeID, days, status, fromS, _, err := loadLeaveRequestTX(r.Context(), tx, tu.TenantID, id)
		if err != nil || (status != "submitted" && status != "draft") {
			response.Err(w, http.StatusConflict, "Only draft/submitted requests can be cancelled.", "ERR_CONFLICT")
			return
		}
		if status == "submitted" {
			from, _ := time.Parse("2006-01-02", fromS)
			year := from.Year()
			_, _ = tx.Exec(r.Context(), `
				update public.hr_leave_balances set reserved = greatest(reserved - $4, 0), updated_at=now()
				where tenant_id=$1 and employee_id=$2 and leave_type_id=$3 and balance_year=$5`,
				tu.TenantID, empID, typeID, days, year)
			_, _ = tx.Exec(r.Context(), `
				insert into public.hr_leave_ledger
				  (tenant_id, employee_id, leave_type_id, balance_year, entry_kind, days, leave_request_id, notes, created_by_user_id)
				values ($1,$2,$3,$4,'release',$5,$6,'Released on cancel',$7)`,
				tu.TenantID, empID, typeID, year, days, id, tu.AppUserID)
		}
		_, _ = tx.Exec(r.Context(), `
			update public.hr_leave_requests set status='cancelled', updated_at=now() where id=$1 and tenant_id=$2`, id, tu.TenantID)
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": id, "status": "cancelled"}, "Cancelled.")
	}
}

// sumCashableLeaveDays returns available cashable leave days for final pay.
func sumCashableLeaveDays(ctx context.Context, tx pgx.Tx, tenantID, empID int64, asOf time.Time) (float64, error) {
	year := asOf.Year()
	var total float64
	err := tx.QueryRow(ctx, `
		select coalesce(sum(
		  b.opening_balance + b.accrued + b.adjusted - b.used - b.reserved
		), 0)::float8
		from public.hr_leave_balances b
		join public.hr_leave_types lt on lt.id = b.leave_type_id
		where b.tenant_id=$1 and b.employee_id=$2 and b.balance_year=$3
		  and lt.is_cashable and lt.is_paid`,
		tenantID, empID, year).Scan(&total)
	if err != nil {
		return 0, err
	}
	if total < 0 {
		total = 0
	}
	return total, nil
}

func cashOutLeaveOnFinalPay(ctx context.Context, tx pgx.Tx, tenantID, empID, userID int64, asOf time.Time, days float64) error {
	if days <= 0 {
		return nil
	}
	year := asOf.Year()
	rows, err := tx.Query(ctx, `
		select b.leave_type_id,
		  (b.opening_balance + b.accrued + b.adjusted - b.used - b.reserved)::float8 as avail
		from public.hr_leave_balances b
		join public.hr_leave_types lt on lt.id = b.leave_type_id
		where b.tenant_id=$1 and b.employee_id=$2 and b.balance_year=$3
		  and lt.is_cashable and lt.is_paid
		order by lt.sort_order`, tenantID, empID, year)
	if err != nil {
		return err
	}
	defer rows.Close()
	remaining := days
	for rows.Next() && remaining > 0 {
		var typeID int64
		var avail float64
		if err := rows.Scan(&typeID, &avail); err != nil {
			return err
		}
		if avail <= 0 {
			continue
		}
		take := avail
		if take > remaining {
			take = remaining
		}
		if _, err := tx.Exec(ctx, `
			update public.hr_leave_balances set used = used + $4, updated_at=now()
			where tenant_id=$1 and employee_id=$2 and leave_type_id=$3 and balance_year=$5`,
			tenantID, empID, typeID, take, year); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			insert into public.hr_leave_ledger
			  (tenant_id, employee_id, leave_type_id, balance_year, entry_kind, days, notes, created_by_user_id)
			values ($1,$2,$3,$4,'cashout',$5,'Final pay leave cash-out',$6)`,
			tenantID, empID, typeID, year, take, userID); err != nil {
			return err
		}
		remaining -= take
	}
	return nil
}
