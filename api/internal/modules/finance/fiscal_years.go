package finance

import (
	"context"
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
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/fiscalyear"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type FiscalYear struct {
	ID        int64  `json:"id"`
	YearCode  string `json:"year_code"`
	YearName  string `json:"year_name"`
	StartDate string `json:"start_date"`
	EndDate   string `json:"end_date"`
	IsActive  bool   `json:"is_active"`
	IsClosed  bool   `json:"is_closed"`
}

type fiscalYearBody struct {
	YearCode  string `json:"year_code"`
	YearName  string `json:"year_name"`
	StartDate string `json:"start_date"`
	EndDate   string `json:"end_date"`
	IsActive  *bool  `json:"is_active"`
}

func registerFiscalYearRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/fiscal-years", listFiscalYears(pool))
	r.Post("/fiscal-years", createFiscalYear(pool))
	r.Post("/fiscal-years/{id}/close", closeFiscalYear(pool))
	r.Post("/fiscal-years/{id}/reopen", reopenFiscalYear(pool))
	r.Get("/fiscal-settings", getFiscalSettings(pool))
	registerFiscalPeriodRoutes(r, pool)
}

func listFiscalYears(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "start_date", map[string]string{"year_code": "year_code"})
		offset := httputil.Offset(p)

		var total int64
		if err := pool.QueryRow(r.Context(), `select count(*) from public.fin_fiscal_years where tenant_id = $1`, tu.TenantID).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count fiscal years.", "ERR_INTERNAL")
			return
		}

		rows, err := pool.Query(r.Context(), `
			select id, year_code, year_name, start_date, end_date, is_active, is_closed
			from public.fin_fiscal_years
			where tenant_id = $1
			order by start_date desc
			limit $2 offset $3`, tu.TenantID, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load fiscal years.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		out, err := scanFiscalYears(rows)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to read fiscal years.", "ERR_INTERNAL")
			return
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func createFiscalYear(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body fiscalYearBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		code := strings.TrimSpace(body.YearCode)
		name := strings.TrimSpace(body.YearName)
		if code == "" || name == "" {
			response.Validation(w, map[string]string{"year_code": "Year code and name are required."})
			return
		}
		start, err := parseDate(body.StartDate)
		if err != nil {
			response.Validation(w, map[string]string{"start_date": "Use YYYY-MM-DD."})
			return
		}
		end, err := parseDate(body.EndDate)
		if err != nil || end.Before(start) {
			response.Validation(w, map[string]string{"end_date": "End date must be on or after start date."})
			return
		}
		isActive := true
		if body.IsActive != nil {
			isActive = *body.IsActive
		}
		var id int64
		err = pool.QueryRow(r.Context(), `
			insert into public.fin_fiscal_years (tenant_id, year_code, year_name, start_date, end_date, is_active)
			values ($1,$2,$3,$4,$5,$6) returning id`,
			tu.TenantID, code, name, start, end, isActive,
		).Scan(&id)
		if err != nil {
			if strings.Contains(err.Error(), "unique") {
				response.Validation(w, map[string]string{"year_code": "Year code already exists."})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to create fiscal year.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.fiscal_year.create", "fin_fiscal_year", &id, nil, body)
		_, _ = ensureFiscalPeriods(r.Context(), pool, tu.TenantID, id)
		response.OK(w, FiscalYear{
			ID: id, YearCode: code, YearName: name,
			StartDate: dateToStr(start), EndDate: dateToStr(end), IsActive: isActive,
		}, "Created.")
	}
}

func getFiscalSettings(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var blockBackdated bool
		_ = pool.QueryRow(r.Context(), `
			select coalesce(accounts_block_backdated_post, false)
			from public.tenant_process_policies where tenant_id = $1`, tu.TenantID).Scan(&blockBackdated)
		response.OK(w, map[string]any{"accounts_block_backdated_post": blockBackdated}, "OK")
	}
}

func closeFiscalYear(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Err(w, http.StatusBadRequest, "Invalid fiscal year id.", "ERR_BAD_REQUEST")
			return
		}
		var yearCode string
		var alreadyClosed bool
		err = pool.QueryRow(r.Context(), `
			select year_code, is_closed from public.fin_fiscal_years
			where id = $1 and tenant_id = $2`, id, tu.TenantID).Scan(&yearCode, &alreadyClosed)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Fiscal year not found.", "ERR_NOT_FOUND")
			return
		}
		if alreadyClosed {
			response.OK(w, map[string]any{"id": id, "is_closed": true}, "Already closed.")
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.fin_fiscal_years
			set is_closed = true, is_active = false, updated_at = now()
			where id = $1 and tenant_id = $2 and is_closed = false`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusInternalServerError, "Failed to close fiscal year.", "ERR_INTERNAL")
			return
		}
		_ = closePeriodsForYear(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.fiscal_year.close", "fin_fiscal_year", &id, nil, map[string]any{"year_code": yearCode})
		response.OK(w, map[string]any{"id": id, "is_closed": true}, "Fiscal year closed. Posting into this year is blocked.")
	}
}

func reopenFiscalYear(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Err(w, http.StatusBadRequest, "Invalid fiscal year id.", "ERR_BAD_REQUEST")
			return
		}
		var yearCode string
		var isClosed bool
		err = pool.QueryRow(r.Context(), `
			select year_code, is_closed from public.fin_fiscal_years
			where id = $1 and tenant_id = $2`, id, tu.TenantID).Scan(&yearCode, &isClosed)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Fiscal year not found.", "ERR_NOT_FOUND")
			return
		}
		if !isClosed {
			response.OK(w, map[string]any{"id": id, "is_closed": false}, "Already open.")
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.fin_fiscal_years
			set is_closed = false, updated_at = now()
			where id = $1 and tenant_id = $2 and is_closed = true`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusInternalServerError, "Failed to reopen fiscal year.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.fiscal_year.reopen", "fin_fiscal_year", &id, nil, map[string]any{"year_code": yearCode})
		response.OK(w, map[string]any{"id": id, "is_closed": false}, "Fiscal year reopened.")
	}
}

func scanFiscalYears(rows interface {
	Next() bool
	Scan(dest ...any) error
	Close()
}) ([]FiscalYear, error) {
	defer rows.Close()
	var out []FiscalYear
	for rows.Next() {
		var row FiscalYear
		var start, end time.Time
		if err := rows.Scan(&row.ID, &row.YearCode, &row.YearName, &start, &end, &row.IsActive, &row.IsClosed); err != nil {
			return nil, err
		}
		row.StartDate = dateToStr(start)
		row.EndDate = dateToStr(end)
		out = append(out, row)
	}
	if out == nil {
		out = []FiscalYear{}
	}
	return out, nil
}

// validatePostingDate enforces fiscal-year/period locks and optional backdated-post policy.
// Closed fiscal years and closed months always block journal posting for dates inside them.
func validatePostingDate(ctx context.Context, pool *pgxpool.Pool, tenantID int64, entryDate time.Time) map[string]string {
	closedCode, err := fiscalyear.ClosedYearCode(ctx, pool, tenantID, entryDate)
	if err == nil && closedCode != "" {
		return map[string]string{
			"entry_date": fmt.Sprintf("Fiscal year %s is closed. Reopen it under Fiscal years before posting to this date.", closedCode),
		}
	}
	periodCode, err := fiscalyear.ClosedPeriodCode(ctx, pool, tenantID, entryDate)
	if err == nil && periodCode != "" {
		return map[string]string{
			"entry_date": fmt.Sprintf("Fiscal period %s is closed. Reopen it under Fiscal years before posting to this date.", periodCode),
		}
	}

	var blockBackdated bool
	_ = pool.QueryRow(ctx, `
		select coalesce(accounts_block_backdated_post, false)
		from public.tenant_process_policies where tenant_id = $1`, tenantID).Scan(&blockBackdated)
	if !blockBackdated {
		return nil
	}
	today := time.Now().Truncate(24 * time.Hour)
	if entryDate.Before(today) {
		return map[string]string{"entry_date": "Backdated posting is blocked for this tenant."}
	}
	var fyStart, fyEnd time.Time
	err = pool.QueryRow(ctx, `
		select start_date, end_date from public.fin_fiscal_years
		where tenant_id = $1 and is_active = true and is_closed = false
		order by start_date desc limit 1`, tenantID).Scan(&fyStart, &fyEnd)
	if err == nil {
		if entryDate.Before(fyStart) || entryDate.After(fyEnd) {
			return map[string]string{"entry_date": fmt.Sprintf("Date must fall within active fiscal year %s–%s.", dateToStr(fyStart), dateToStr(fyEnd))}
		}
	}
	return nil
}
