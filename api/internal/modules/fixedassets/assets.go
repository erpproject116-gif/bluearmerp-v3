package fixedassets

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
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
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/ledger"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type FixedAsset struct {
	ID                                int64   `json:"id"`
	AssetCode                         string  `json:"asset_code"`
	AssetName                         string  `json:"asset_name"`
	AcquisitionDate                   string  `json:"acquisition_date"`
	AcquisitionCost                   float64 `json:"acquisition_cost"`
	SalvageValue                      float64 `json:"salvage_value"`
	UsefulLifeMonths                  int     `json:"useful_life_months"`
	AssetAccountCode                  string  `json:"asset_account_code"`
	DepreciationAccountCode           string  `json:"depreciation_account_code"`
	AccumulatedDepreciationAccountCode string `json:"accumulated_depreciation_account_code"`
	AccumulatedDepreciation           float64 `json:"accumulated_depreciation"`
	MonthlyDepreciation               float64 `json:"monthly_depreciation,omitempty"`
	Status                            string  `json:"status"`
	LastDepreciationDate              *string `json:"last_depreciation_date,omitempty"`
	Notes                             *string `json:"notes,omitempty"`
}

type assetBody struct {
	AssetCode                         string  `json:"asset_code"`
	AssetName                         string  `json:"asset_name"`
	AcquisitionDate                   string  `json:"acquisition_date"`
	AcquisitionCost                   float64 `json:"acquisition_cost"`
	SalvageValue                      float64 `json:"salvage_value"`
	UsefulLifeMonths                  int     `json:"useful_life_months"`
	AssetAccountCode                  string  `json:"asset_account_code"`
	DepreciationAccountCode           string  `json:"depreciation_account_code"`
	AccumulatedDepreciationAccountCode string `json:"accumulated_depreciation_account_code"`
	Notes                             *string `json:"notes"`
}

type assetPatchBody struct {
	AssetName                         *string  `json:"asset_name"`
	AcquisitionDate                   *string  `json:"acquisition_date"`
	AcquisitionCost                   *float64 `json:"acquisition_cost"`
	SalvageValue                      *float64 `json:"salvage_value"`
	UsefulLifeMonths                  *int     `json:"useful_life_months"`
	AssetAccountCode                  *string  `json:"asset_account_code"`
	DepreciationAccountCode           *string  `json:"depreciation_account_code"`
	AccumulatedDepreciationAccountCode *string `json:"accumulated_depreciation_account_code"`
	Status                            *string  `json:"status"`
	Notes                             *string  `json:"notes"`
}

func registerAssetRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/assets", listAssets(pool))
	r.With(auth.RequirePermission("fixed_assets.assets_new", auth.AccessWrite)).Post("/assets", createAsset(pool))
	r.Get("/assets/{id}", getAsset(pool))
	r.With(auth.RequirePermission("fixed_assets.assets", auth.AccessWrite)).Patch("/assets/{id}", patchAsset(pool))
}

func listAssets(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"asset_code": "a.asset_code", "asset_name": "a.asset_name", "status": "a.status", "acquisition_date": "a.acquisition_date",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "acquisition_date", allowed)
		if p.Order == "" {
			p.Order = "desc"
		}
		offset := httputil.Offset(p)
		where := "a.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
			where += fmt.Sprintf(" and (a.asset_code ilike $%d or a.asset_name ilike $%d)", n, n)
			args = append(args, "%"+q+"%")
			n++
		}
		if st := strings.TrimSpace(r.URL.Query().Get("status")); st != "" {
			where += fmt.Sprintf(" and a.status = $%d", n)
			args = append(args, st)
			n++
		}
		sortCol := allowed[p.Sort]
		if sortCol == "" {
			sortCol = "a.acquisition_date"
		}
		q := fmt.Sprintf(`
			select a.id, a.asset_code, a.asset_name, a.acquisition_date::text,
			  a.acquisition_cost::float8, a.salvage_value::float8, a.useful_life_months,
			  a.asset_account_code, a.depreciation_account_code, a.accumulated_depreciation_account_code,
			  a.accumulated_depreciation::float8, a.status, a.last_depreciation_date::text, a.notes,
			  count(*) over()
			from public.fin_fixed_assets a
			where %s
			order by %s %s
			limit $%d offset $%d`, where, sortCol, orderSQL(p.Order), n, n+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list assets.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []FixedAsset
		var total int64
		for rows.Next() {
			var row FixedAsset
			if err := rows.Scan(
				&row.ID, &row.AssetCode, &row.AssetName, &row.AcquisitionDate,
				&row.AcquisitionCost, &row.SalvageValue, &row.UsefulLifeMonths,
				&row.AssetAccountCode, &row.DepreciationAccountCode, &row.AccumulatedDepreciationAccountCode,
				&row.AccumulatedDepreciation, &row.Status, &row.LastDepreciationDate, &row.Notes, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read assets.", "ERR_INTERNAL")
				return
			}
			row.MonthlyDepreciation = monthlyDepreciation(row.AcquisitionCost, row.SalvageValue, row.UsefulLifeMonths)
			out = append(out, row)
		}
		if out == nil {
			out = []FixedAsset{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getAsset(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		asset, err := loadAsset(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Asset not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, asset, "OK")
	}
}

func createAsset(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body assetBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateAssetBody(body); errs != nil {
			response.Validation(w, errs)
			return
		}
		acqDate, err := parseDate(body.AcquisitionDate)
		if err != nil {
			response.Validation(w, map[string]string{"acquisition_date": "Invalid date. Use YYYY-MM-DD."})
			return
		}
		var id int64
		err = pool.QueryRow(r.Context(), `
			insert into public.fin_fixed_assets (
			  tenant_id, asset_code, asset_name, acquisition_date,
			  acquisition_cost, salvage_value, useful_life_months,
			  asset_account_code, depreciation_account_code, accumulated_depreciation_account_code,
			  notes
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
			returning id`,
			tu.TenantID, strings.TrimSpace(body.AssetCode), strings.TrimSpace(body.AssetName), acqDate,
			body.AcquisitionCost, body.SalvageValue, body.UsefulLifeMonths,
			defaultAccount(body.AssetAccountCode, "1510"),
			defaultAccount(body.DepreciationAccountCode, "5510"),
			defaultAccount(body.AccumulatedDepreciationAccountCode, "1519"),
			body.Notes,
		).Scan(&id)
		if err != nil {
			if strings.Contains(err.Error(), "unique") {
				response.Validation(w, map[string]string{"asset_code": "Asset code already exists."})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to create asset.", "ERR_INTERNAL")
			return
		}
		asset, _ := loadAsset(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "fixed_assets.asset.create", "fin_fixed_asset", &id, nil, body)
		response.OK(w, asset, "Created.")
	}
}

func patchAsset(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		before, err := loadAsset(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Asset not found.", "ERR_NOT_FOUND")
			return
		}
		var body assetPatchBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		sets := []string{"updated_at = now()"}
		args := []any{id, tu.TenantID}
		n := 3
		if body.AssetName != nil {
			sets = append(sets, fmt.Sprintf("asset_name = $%d", n))
			args = append(args, strings.TrimSpace(*body.AssetName))
			n++
		}
		if body.AcquisitionDate != nil {
			d, err := parseDate(*body.AcquisitionDate)
			if err != nil {
				response.Validation(w, map[string]string{"acquisition_date": "Invalid date."})
				return
			}
			sets = append(sets, fmt.Sprintf("acquisition_date = $%d", n))
			args = append(args, d)
			n++
		}
		if body.AcquisitionCost != nil {
			sets = append(sets, fmt.Sprintf("acquisition_cost = $%d", n))
			args = append(args, *body.AcquisitionCost)
			n++
		}
		if body.SalvageValue != nil {
			sets = append(sets, fmt.Sprintf("salvage_value = $%d", n))
			args = append(args, *body.SalvageValue)
			n++
		}
		if body.UsefulLifeMonths != nil {
			sets = append(sets, fmt.Sprintf("useful_life_months = $%d", n))
			args = append(args, *body.UsefulLifeMonths)
			n++
		}
		if body.AssetAccountCode != nil {
			sets = append(sets, fmt.Sprintf("asset_account_code = $%d", n))
			args = append(args, strings.TrimSpace(*body.AssetAccountCode))
			n++
		}
		if body.DepreciationAccountCode != nil {
			sets = append(sets, fmt.Sprintf("depreciation_account_code = $%d", n))
			args = append(args, strings.TrimSpace(*body.DepreciationAccountCode))
			n++
		}
		if body.AccumulatedDepreciationAccountCode != nil {
			sets = append(sets, fmt.Sprintf("accumulated_depreciation_account_code = $%d", n))
			args = append(args, strings.TrimSpace(*body.AccumulatedDepreciationAccountCode))
			n++
		}
		if body.Status != nil {
			sets = append(sets, fmt.Sprintf("status = $%d", n))
			args = append(args, strings.TrimSpace(*body.Status))
			n++
		}
		if body.Notes != nil {
			sets = append(sets, fmt.Sprintf("notes = $%d", n))
			args = append(args, body.Notes)
			n++
		}
		q := fmt.Sprintf(`update public.fin_fixed_assets set %s where id = $1 and tenant_id = $2`, strings.Join(sets, ", "))
		tag, err := pool.Exec(r.Context(), q, args...)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Asset not found.", "ERR_NOT_FOUND")
			return
		}
		asset, _ := loadAsset(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "fixed_assets.asset.update", "fin_fixed_asset", &id, before, asset)
		response.OK(w, asset, "Updated.")
	}
}

func loadAsset(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (FixedAsset, error) {
	var row FixedAsset
	err := pool.QueryRow(ctx, `
		select id, asset_code, asset_name, acquisition_date::text,
		  acquisition_cost::float8, salvage_value::float8, useful_life_months,
		  asset_account_code, depreciation_account_code, accumulated_depreciation_account_code,
		  accumulated_depreciation::float8, status, last_depreciation_date::text, notes
		from public.fin_fixed_assets
		where id = $1 and tenant_id = $2`, id, tenantID).Scan(
		&row.ID, &row.AssetCode, &row.AssetName, &row.AcquisitionDate,
		&row.AcquisitionCost, &row.SalvageValue, &row.UsefulLifeMonths,
		&row.AssetAccountCode, &row.DepreciationAccountCode, &row.AccumulatedDepreciationAccountCode,
		&row.AccumulatedDepreciation, &row.Status, &row.LastDepreciationDate, &row.Notes,
	)
	if err == nil {
		row.MonthlyDepreciation = monthlyDepreciation(row.AcquisitionCost, row.SalvageValue, row.UsefulLifeMonths)
	}
	return row, err
}

func validateAssetBody(body assetBody) map[string]string {
	errs := map[string]string{}
	if strings.TrimSpace(body.AssetCode) == "" {
		errs["asset_code"] = "Asset code is required."
	}
	if strings.TrimSpace(body.AssetName) == "" {
		errs["asset_name"] = "Asset name is required."
	}
	if body.AcquisitionCost <= 0 {
		errs["acquisition_cost"] = "Acquisition cost must be greater than zero."
	}
	if body.SalvageValue < 0 {
		errs["salvage_value"] = "Salvage value cannot be negative."
	}
	if body.SalvageValue >= body.AcquisitionCost {
		errs["salvage_value"] = "Salvage value must be less than acquisition cost."
	}
	if body.UsefulLifeMonths <= 0 {
		errs["useful_life_months"] = "Useful life must be at least one month."
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func monthlyDepreciation(cost, salvage float64, months int) float64 {
	if months <= 0 {
		return 0
	}
	return roundMoney((cost - salvage) / float64(months))
}

func remainingDepreciable(cost, salvage, accumulated float64) float64 {
	return math.Max(0, cost-salvage-accumulated)
}

func roundMoney(v float64) float64 {
	return math.Round(v*10000) / 10000
}

func defaultAccount(code, fallback string) string {
	code = strings.TrimSpace(code)
	if code == "" {
		return fallback
	}
	return code
}

func parseDate(s string) (time.Time, error) {
	return time.Parse("2006-01-02", strings.TrimSpace(s))
}

func postDepreciationJournal(ctx context.Context, tx pgx.Tx, tenantID, runID int64, runDate time.Time, lines []ledger.PostingLine, userID *int64) (int64, error) {
	ev := ledger.PostingEvent{
		TenantID:   tenantID,
		SourceType: "depreciation_run",
		SourceID:   runID,
		Lines:      lines,
	}
	if err := (ledger.AuditPoster{}).Post(ctx, tx, ev); err != nil {
		return 0, err
	}
	var dateSeq int
	if err := tx.QueryRow(ctx, `
		select coalesce(max(date_seq), 0) + 1
		from public.fin_journal_entries
		where tenant_id = $1 and entry_date = $2`, tenantID, runDate).Scan(&dateSeq); err != nil {
		return 0, err
	}
	entryNo := fmt.Sprintf("DEP-%d-%02d-%d", runDate.Year(), int(runDate.Month()), dateSeq)
	remarks := fmt.Sprintf("Fixed asset depreciation run %d", runID)
	var entryID int64
	err := tx.QueryRow(ctx, `
		insert into public.fin_journal_entries (
		  tenant_id, entry_date, date_seq, entry_no, status, remarks, posted_at, created_by_user_id
		) values ($1, $2, $3, $4, 'posted', $5, now(), $6)
		returning id`,
		tenantID, runDate, dateSeq, entryNo, remarks, userID).Scan(&entryID)
	if err != nil {
		return 0, err
	}
	lineNo := 1
	for _, ln := range lines {
		var accountID int64
		if err := tx.QueryRow(ctx, `
			select id from public.fin_accounts where tenant_id = $1 and account_code = $2`,
			tenantID, ln.AccountCode).Scan(&accountID); err != nil {
			return 0, fmt.Errorf("account %s not found", ln.AccountCode)
		}
		if _, err := tx.Exec(ctx, `
			insert into public.fin_journal_entry_lines (journal_entry_id, line_no, account_id, debit, credit, remarks)
			values ($1, $2, $3, $4, $5, $6)`,
			entryID, lineNo, accountID, ln.Debit, ln.Credit, ln.Remarks); err != nil {
			return 0, err
		}
		lineNo++
	}
	return entryID, nil
}
