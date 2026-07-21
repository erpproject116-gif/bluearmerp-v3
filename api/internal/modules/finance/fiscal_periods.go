package finance

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type FiscalPeriod struct {
	ID           int64  `json:"id"`
	FiscalYearID int64  `json:"fiscal_year_id"`
	PeriodCode   string `json:"period_code"`
	PeriodName   string `json:"period_name"`
	StartDate    string `json:"start_date"`
	EndDate      string `json:"end_date"`
	IsClosed     bool   `json:"is_closed"`
	YearCode     string `json:"year_code,omitempty"`
}

func registerFiscalPeriodRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/fiscal-periods", listFiscalPeriods(pool))
	r.Post("/fiscal-years/{id}/generate-periods", generateFiscalPeriods(pool))
	r.Post("/fiscal-periods/{id}/close", closeFiscalPeriod(pool))
	r.Post("/fiscal-periods/{id}/reopen", reopenFiscalPeriod(pool))
}

func listFiscalPeriods(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "start_date", map[string]string{
			"period_code": "fp.period_code",
			"start_date":  "fp.start_date",
		})
		offset := httputil.Offset(p)

		args := []any{tu.TenantID}
		where := "fp.tenant_id = $1"
		if raw := r.URL.Query().Get("fiscal_year_id"); raw != "" {
			fyID, err := strconv.ParseInt(raw, 10, 64)
			if err != nil || fyID <= 0 {
				response.Err(w, http.StatusBadRequest, "Invalid fiscal_year_id.", "ERR_BAD_REQUEST")
				return
			}
			args = append(args, fyID)
			where += fmt.Sprintf(" and fp.fiscal_year_id = $%d", len(args))
		}

		var total int64
		countQ := `select count(*) from public.fin_fiscal_periods fp where ` + where
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count fiscal periods.", "ERR_INTERNAL")
			return
		}

		args = append(args, p.PageSize, offset)
		orderDir := "asc"
		if strings.EqualFold(p.Order, "desc") {
			orderDir = "desc"
		}
		q := fmt.Sprintf(`
			select fp.id, fp.fiscal_year_id, fp.period_code, fp.period_name,
			       fp.start_date, fp.end_date, fp.is_closed, fy.year_code
			from public.fin_fiscal_periods fp
			join public.fin_fiscal_years fy on fy.id = fp.fiscal_year_id
			where %s
			order by fp.start_date %s
			limit $%d offset $%d`, where, orderDir, len(args)-1, len(args))
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load fiscal periods.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		out := []FiscalPeriod{}
		for rows.Next() {
			var row FiscalPeriod
			var start, end time.Time
			if err := rows.Scan(&row.ID, &row.FiscalYearID, &row.PeriodCode, &row.PeriodName, &start, &end, &row.IsClosed, &row.YearCode); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read fiscal periods.", "ERR_INTERNAL")
				return
			}
			row.StartDate = dateToStr(start)
			row.EndDate = dateToStr(end)
			out = append(out, row)
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func generateFiscalPeriods(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Err(w, http.StatusBadRequest, "Invalid fiscal year id.", "ERR_BAD_REQUEST")
			return
		}
		created, err := ensureFiscalPeriods(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, err.Error(), "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.fiscal_period.generate", "fin_fiscal_year", &id, nil, map[string]any{"created": created})
		response.OK(w, map[string]any{"fiscal_year_id": id, "created": created}, "Fiscal periods ready.")
	}
}

func closeFiscalPeriod(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Err(w, http.StatusBadRequest, "Invalid fiscal period id.", "ERR_BAD_REQUEST")
			return
		}
		var periodCode string
		var alreadyClosed bool
		err = pool.QueryRow(r.Context(), `
			select period_code, is_closed from public.fin_fiscal_periods
			where id = $1 and tenant_id = $2`, id, tu.TenantID).Scan(&periodCode, &alreadyClosed)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Fiscal period not found.", "ERR_NOT_FOUND")
			return
		}
		if alreadyClosed {
			response.OK(w, map[string]any{"id": id, "is_closed": true}, "Already closed.")
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.fin_fiscal_periods
			set is_closed = true, updated_at = now()
			where id = $1 and tenant_id = $2 and is_closed = false`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusInternalServerError, "Failed to close fiscal period.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.fiscal_period.close", "fin_fiscal_period", &id, nil, map[string]any{"period_code": periodCode})
		response.OK(w, map[string]any{"id": id, "is_closed": true}, "Fiscal period closed. Posting into this month is blocked.")
	}
}

func reopenFiscalPeriod(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Err(w, http.StatusBadRequest, "Invalid fiscal period id.", "ERR_BAD_REQUEST")
			return
		}
		var periodCode string
		var isClosed bool
		var yearClosed bool
		err = pool.QueryRow(r.Context(), `
			select fp.period_code, fp.is_closed, fy.is_closed
			from public.fin_fiscal_periods fp
			join public.fin_fiscal_years fy on fy.id = fp.fiscal_year_id
			where fp.id = $1 and fp.tenant_id = $2`, id, tu.TenantID).Scan(&periodCode, &isClosed, &yearClosed)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Fiscal period not found.", "ERR_NOT_FOUND")
			return
		}
		if yearClosed {
			response.Err(w, http.StatusConflict, "Reopen the fiscal year before reopening this period.", "ERR_CONFLICT")
			return
		}
		if !isClosed {
			response.OK(w, map[string]any{"id": id, "is_closed": false}, "Already open.")
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.fin_fiscal_periods
			set is_closed = false, updated_at = now()
			where id = $1 and tenant_id = $2 and is_closed = true`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusInternalServerError, "Failed to reopen fiscal period.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.fiscal_period.reopen", "fin_fiscal_period", &id, nil, map[string]any{"period_code": periodCode})
		response.OK(w, map[string]any{"id": id, "is_closed": false}, "Fiscal period reopened.")
	}
}

type periodDB interface {
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// ensureFiscalPeriods creates missing calendar months for a fiscal year.
// Returns how many period rows were inserted.
func ensureFiscalPeriods(ctx context.Context, db periodDB, tenantID, fiscalYearID int64) (int, error) {
	var start, end time.Time
	var yearClosed bool
	err := db.QueryRow(ctx, `
		select start_date, end_date, is_closed from public.fin_fiscal_years
		where id = $1 and tenant_id = $2`, fiscalYearID, tenantID).Scan(&start, &end, &yearClosed)
	if err != nil {
		return 0, fmt.Errorf("fiscal year not found")
	}

	created := 0
	cur := time.Date(start.Year(), start.Month(), 1, 0, 0, 0, 0, time.UTC)
	endMonth := time.Date(end.Year(), end.Month(), 1, 0, 0, 0, 0, time.UTC)
	for !cur.After(endMonth) {
		monthEnd := cur.AddDate(0, 1, -1)
		pStart := cur
		if pStart.Before(start) {
			pStart = start
		}
		pEnd := monthEnd
		if pEnd.After(end) {
			pEnd = end
		}
		code := cur.Format("2006-01")
		name := cur.Format("Jan 2006")
		tag, err := db.Exec(ctx, `
			insert into public.fin_fiscal_periods (
			  tenant_id, fiscal_year_id, period_code, period_name, start_date, end_date, is_closed
			) values ($1, $2, $3, $4, $5::date, $6::date, $7)
			on conflict (tenant_id, period_code) do nothing`,
			tenantID, fiscalYearID, code, name, dateToStr(pStart), dateToStr(pEnd), yearClosed)
		if err != nil {
			return created, fmt.Errorf("failed to create period %s", code)
		}
		if tag.RowsAffected() > 0 {
			created++
		}
		cur = cur.AddDate(0, 1, 0)
	}
	return created, nil
}

func closePeriodsForYear(ctx context.Context, db periodDB, tenantID, fiscalYearID int64) error {
	_, err := db.Exec(ctx, `
		update public.fin_fiscal_periods
		set is_closed = true, updated_at = now()
		where tenant_id = $1 and fiscal_year_id = $2 and is_closed = false`,
		tenantID, fiscalYearID)
	return err
}
