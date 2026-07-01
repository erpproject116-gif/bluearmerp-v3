package fixedassets

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/ledger"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type DepreciationRun struct {
	ID             int64                 `json:"id"`
	RunDate        string                `json:"run_date"`
	PeriodYear     int                   `json:"period_year"`
	PeriodMonth    int                   `json:"period_month"`
	Status         string                `json:"status"`
	TotalAmount    float64               `json:"total_amount"`
	JournalEntryID *int64                `json:"journal_entry_id,omitempty"`
	PostedAt       *string               `json:"posted_at,omitempty"`
	Lines          []DepreciationRunLine `json:"lines,omitempty"`
}

type DepreciationRunLine struct {
	ID                 int64   `json:"id"`
	LineNo             int     `json:"line_no"`
	AssetID            int64   `json:"asset_id"`
	AssetCode          string  `json:"asset_code,omitempty"`
	AssetName          string  `json:"asset_name,omitempty"`
	DepreciationAmount float64 `json:"depreciation_amount"`
}

type depreciationRunBody struct {
	PeriodYear  int `json:"period_year"`
	PeriodMonth int `json:"period_month"`
}

func registerDepreciationRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("fixed_assets.depreciation_runs", auth.AccessRead)).Get("/depreciation-runs", listDepreciationRuns(pool))
	r.With(auth.RequirePermission("fixed_assets.depreciation_runs", auth.AccessWrite)).Post("/depreciation-runs", createDepreciationRun(pool))
	r.With(auth.RequirePermission("fixed_assets.depreciation_runs", auth.AccessRead)).Get("/depreciation-runs/{id}", getDepreciationRun(pool))
}

func listDepreciationRuns(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "run_date", map[string]string{"run_date": "run_date"})
		if p.Order == "" {
			p.Order = "desc"
		}
		offset := httputil.Offset(p)
		rows, err := pool.Query(r.Context(), `
			select id, run_date::text, period_year, period_month, status,
			  total_amount::float8, journal_entry_id, posted_at::text, count(*) over()
			from public.fin_depreciation_runs
			where tenant_id = $1
			order by run_date desc, id desc
			limit $2 offset $3`, tu.TenantID, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list depreciation runs.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []DepreciationRun
		var total int64
		for rows.Next() {
			var row DepreciationRun
			if err := rows.Scan(
				&row.ID, &row.RunDate, &row.PeriodYear, &row.PeriodMonth, &row.Status,
				&row.TotalAmount, &row.JournalEntryID, &row.PostedAt, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read runs.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []DepreciationRun{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getDepreciationRun(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		run, err := loadDepreciationRun(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Depreciation run not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, run, "OK")
	}
}

func createDepreciationRun(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body depreciationRunBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		now := time.Now()
		year := body.PeriodYear
		month := body.PeriodMonth
		if year <= 0 {
			year = now.Year()
		}
		if month <= 0 {
			month = int(now.Month())
		}
		if month < 1 || month > 12 {
			response.Validation(w, map[string]string{"period_month": "Month must be 1–12."})
			return
		}
		runDate := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)

		var existingID int64
		err := pool.QueryRow(r.Context(), `
			select id from public.fin_depreciation_runs
			where tenant_id = $1 and period_year = $2 and period_month = $3 and status = 'posted'`,
			tu.TenantID, year, month).Scan(&existingID)
		if err == nil {
			response.Validation(w, map[string]string{"period": "Depreciation already posted for this period."})
			return
		}

		rows, err := pool.Query(r.Context(), `
			select id, asset_code, asset_name,
			  acquisition_cost::float8, salvage_value::float8, useful_life_months,
			  accumulated_depreciation::float8,
			  depreciation_account_code, accumulated_depreciation_account_code
			from public.fin_fixed_assets
			where tenant_id = $1 and status = 'active'`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load assets.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		type depLine struct {
			assetID   int64
			assetCode string
			assetName string
			amount    float64
			expAcct   string
			accumAcct string
		}
		var depLines []depLine
		var total float64
		for rows.Next() {
			var assetID int64
			var assetCode, assetName, expAcct, accumAcct string
			var cost, salvage, accumulated float64
			var lifeMonths int
			if err := rows.Scan(&assetID, &assetCode, &assetName, &cost, &salvage, &lifeMonths, &accumulated, &expAcct, &accumAcct); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read asset.", "ERR_INTERNAL")
				return
			}
			remaining := remainingDepreciable(cost, salvage, accumulated)
			if remaining <= 0.0001 {
				continue
			}
			amount := monthlyDepreciation(cost, salvage, lifeMonths)
			if amount > remaining {
				amount = roundMoney(remaining)
			}
			if amount <= 0 {
				continue
			}
			depLines = append(depLines, depLine{
				assetID: assetID, assetCode: assetCode, assetName: assetName,
				amount: amount, expAcct: expAcct, accumAcct: accumAcct,
			})
			total += amount
		}
		if len(depLines) == 0 {
			response.Validation(w, map[string]string{"assets": "No depreciable assets found for this period."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start run.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var runID int64
		err = tx.QueryRow(r.Context(), `
			insert into public.fin_depreciation_runs (
			  tenant_id, run_date, period_year, period_month, status, total_amount, created_by_user_id
			) values ($1, $2, $3, $4, 'draft', $5, $6)
			on conflict (tenant_id, period_year, period_month) do update
			  set updated_at = now()
			returning id`,
			tu.TenantID, runDate, year, month, total, tu.AppUserID).Scan(&runID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create run.", "ERR_INTERNAL")
			return
		}

		var status string
		if err := tx.QueryRow(r.Context(), `select status from public.fin_depreciation_runs where id = $1`, runID).Scan(&status); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to read run.", "ERR_INTERNAL")
			return
		}
		if status == "posted" {
			response.Validation(w, map[string]string{"period": "Depreciation already posted for this period."})
			return
		}

		if _, err := tx.Exec(r.Context(), `delete from public.fin_depreciation_run_lines where run_id = $1`, runID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to reset run lines.", "ERR_INTERNAL")
			return
		}

		var postingLines []ledger.PostingLine
		for i, dl := range depLines {
			if _, err := tx.Exec(r.Context(), `
				insert into public.fin_depreciation_run_lines (run_id, asset_id, line_no, depreciation_amount)
				values ($1, $2, $3, $4)`,
				runID, dl.assetID, i+1, dl.amount); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to save run line.", "ERR_INTERNAL")
				return
			}
			remark := fmt.Sprintf("%s %s", dl.assetCode, dl.assetName)
			postingLines = append(postingLines,
				ledger.PostingLine{AccountCode: dl.expAcct, Debit: dl.amount, Remarks: remark},
				ledger.PostingLine{AccountCode: dl.accumAcct, Credit: dl.amount, Remarks: remark},
			)
			var cost, salvage, prevAccum float64
			if err := tx.QueryRow(r.Context(), `
				select acquisition_cost::float8, salvage_value::float8, accumulated_depreciation::float8
				from public.fin_fixed_assets where id = $1`, dl.assetID).Scan(&cost, &salvage, &prevAccum); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read asset.", "ERR_INTERNAL")
				return
			}
			newStatus := "active"
			if roundMoney(prevAccum+dl.amount) >= roundMoney(cost-salvage)-0.0001 {
				newStatus = "fully_depreciated"
			}
			if _, err := tx.Exec(r.Context(), `
				update public.fin_fixed_assets set
				  accumulated_depreciation = accumulated_depreciation + $1,
				  last_depreciation_date = $2,
				  status = $3,
				  updated_at = now()
				where id = $4`, dl.amount, runDate, newStatus, dl.assetID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to update asset.", "ERR_INTERNAL")
				return
			}
		}

		entryID, err := postDepreciationJournal(r.Context(), tx, tu.TenantID, runID, runDate, postingLines, &tu.AppUserID)
		if err != nil {
			response.Validation(w, map[string]string{"journal": "Failed to post journal entry: " + err.Error()})
			return
		}

		if _, err := tx.Exec(r.Context(), `
			update public.fin_depreciation_runs set
			  status = 'posted', total_amount = $1, journal_entry_id = $2, posted_at = now(), updated_at = now()
			where id = $3`, total, entryID, runID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to finalize run.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}

		run, _ := loadDepreciationRun(r.Context(), pool, tu.TenantID, runID)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "fixed_assets.depreciation_run.post", "fin_depreciation_run", &runID, nil, run)
		response.OK(w, run, "Depreciation run posted.")
	}
}

func loadDepreciationRun(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (DepreciationRun, error) {
	var run DepreciationRun
	err := pool.QueryRow(ctx, `
		select id, run_date::text, period_year, period_month, status,
		  total_amount::float8, journal_entry_id, posted_at::text
		from public.fin_depreciation_runs
		where id = $1 and tenant_id = $2`, id, tenantID).Scan(
		&run.ID, &run.RunDate, &run.PeriodYear, &run.PeriodMonth, &run.Status,
		&run.TotalAmount, &run.JournalEntryID, &run.PostedAt,
	)
	if err != nil {
		return run, err
	}
	rows, err := pool.Query(ctx, `
		select l.id, l.line_no, l.asset_id, a.asset_code, a.asset_name, l.depreciation_amount::float8
		from public.fin_depreciation_run_lines l
		join public.fin_fixed_assets a on a.id = l.asset_id
		where l.run_id = $1
		order by l.line_no`, id)
	if err != nil {
		return run, err
	}
	defer rows.Close()
	for rows.Next() {
		var ln DepreciationRunLine
		if err := rows.Scan(&ln.ID, &ln.LineNo, &ln.AssetID, &ln.AssetCode, &ln.AssetName, &ln.DepreciationAmount); err != nil {
			return run, err
		}
		run.Lines = append(run.Lines, ln)
	}
	if run.Lines == nil {
		run.Lines = []DepreciationRunLine{}
	}
	return run, nil
}
