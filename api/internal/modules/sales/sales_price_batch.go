package sales

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/taxcalc"
)

type priceBatchFilters struct {
	dateRangeFilters
	LocationID     *int64
	ProjectID      *int64
	PartnerID      *int64
	ItemID         *int64
	TaxTypeID      *int64
	ProgressStatus string
}

type priceBatchRow struct {
	SalesID        int64   `json:"sales_id"`
	LineID         int64   `json:"line_id"`
	DateNoDisplay  string  `json:"date_no_display"`
	SalesNo        string  `json:"sales_no"`
	CustomerName   string  `json:"customer_name"`
	PicName        string  `json:"pic_name"`
	LocationName   string  `json:"location_name"`
	TaxTypeName    string  `json:"tax_type_name"`
	ProgressStatus string  `json:"progress_status"`
	ItemCode       string  `json:"item_code"`
	ItemName       string  `json:"item_name"`
	Description    *string `json:"description,omitempty"`
	Qty            float64 `json:"qty"`
	UnitNonVat     float64 `json:"unit_non_vat"`
	NonVatTotal    float64 `json:"non_vat_total"`
	TaxAmount      float64 `json:"tax_amount"`
}

func parsePriceBatchFilters(r *http.Request) (priceBatchFilters, map[string]string) {
	dr, errs := parseDateRangeFilters(r)
	if errs != nil {
		return priceBatchFilters{}, errs
	}
	f := priceBatchFilters{dateRangeFilters: dr}
	if id, ok := optionalInt64Query(r, "location_id"); ok {
		f.LocationID = id
	}
	if id, ok := optionalInt64Query(r, "project_id"); ok {
		f.ProjectID = id
	}
	if id, ok := optionalInt64Query(r, "partner_id"); ok {
		f.PartnerID = id
	}
	if id, ok := optionalInt64Query(r, "item_id"); ok {
		f.ItemID = id
	}
	if id, ok := optionalInt64Query(r, "tax_type_id"); ok {
		f.TaxTypeID = id
	}
	progress := strings.TrimSpace(r.URL.Query().Get("progress_status"))
	if progress == "unconfirmed" || progress == "completed" {
		f.ProgressStatus = progress
	}
	return f, nil
}

func buildPriceBatchWhere(f priceBatchFilters, tenantID int64) (string, []any) {
	where := `s.tenant_id = $1 and s.deleted_at is null
		and s.order_date >= $2::date and s.order_date <= $3::date`
	args := []any{tenantID, f.DateFrom, f.DateTo}
	argN := 4
	if f.LocationID != nil {
		where += fmt.Sprintf(" and s.location_id = $%d", argN)
		args = append(args, *f.LocationID)
		argN++
	}
	if f.ProjectID != nil {
		where += fmt.Sprintf(" and s.project_id = $%d", argN)
		args = append(args, *f.ProjectID)
		argN++
	}
	if f.PartnerID != nil {
		where += fmt.Sprintf(" and s.partner_id = $%d", argN)
		args = append(args, *f.PartnerID)
		argN++
	}
	if f.TaxTypeID != nil {
		where += fmt.Sprintf(" and s.tax_type_id = $%d", argN)
		args = append(args, *f.TaxTypeID)
		argN++
	}
	if f.ProgressStatus != "" {
		where += fmt.Sprintf(" and s.progress_status = $%d", argN)
		args = append(args, f.ProgressStatus)
		argN++
	}
	if f.ItemID != nil {
		where += fmt.Sprintf(" and ln.item_id = $%d", argN)
		args = append(args, *f.ItemID)
		argN++
	}
	return where, args
}

func priceBatchFromClause() string {
	return `
		from public.sa_sales s
		join public.inv_partners p on p.id = s.partner_id
		join public.inv_locations l on l.id = s.location_id
		join public.quo_tax_types tt on tt.id = s.tax_type_id
		join public.sa_sales_lines ln on ln.sales_id = s.id`
}

func queryPriceBatchRows(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f priceBatchFilters, sort, order string, limit, offset int) ([]priceBatchRow, int64, error) {
	where, args := buildPriceBatchWhere(f, tenantID)
	orderClause := salesStatusOrderBy(salesStatusFilters{ReportType: "details"}, sort, order)
	q := fmt.Sprintf(`
		select s.id, ln.id, s.order_date, s.date_seq, s.sales_no,
		  p.company_name, s.pic_name, l.location_name, tt.name, s.progress_status,
		  ln.item_code, ln.item_name, ln.description,
		  ln.qty::float8, ln.unit_non_vat::float8, ln.non_vat_total::float8, ln.tax_amount::float8,
		  count(*) over()
		%s
		where %s
		order by %s
		limit $%d offset $%d`,
		priceBatchFromClause(), where, orderClause, len(args)+1, len(args)+2)
	args = append(args, limit, offset)

	rows, err := pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []priceBatchRow
	var total int64
	for rows.Next() {
		var row priceBatchRow
		var orderDate time.Time
		var dateSeq int
		if err := rows.Scan(
			&row.SalesID, &row.LineID, &orderDate, &dateSeq, &row.SalesNo,
			&row.CustomerName, &row.PicName, &row.LocationName, &row.TaxTypeName, &row.ProgressStatus,
			&row.ItemCode, &row.ItemName, &row.Description,
			&row.Qty, &row.UnitNonVat, &row.NonVatTotal, &row.TaxAmount, &total,
		); err != nil {
			return nil, 0, err
		}
		row.DateNoDisplay = formatDateNoDisplay(orderDate, dateSeq)
		out = append(out, row)
	}
	if out == nil {
		out = []priceBatchRow{}
	}
	return out, total, nil
}

func listPriceBatchLines(pool *pgxpool.Pool) http.HandlerFunc {
	allowedSort := map[string]string{
		"order_date":    "s.order_date",
		"sales_no":      "s.sales_no",
		"customer_name": "p.company_name",
		"item_code":     "ln.item_code",
		"unit_non_vat":  "ln.unit_non_vat",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parsePriceBatchFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		p := httputil.ParseListParams(r, "order_date", allowedSort)
		offset := httputil.Offset(p)
		sortKey := strings.TrimSpace(r.URL.Query().Get("sort"))
		if sortKey == "" {
			sortKey = "order_date"
		}

		rows, total, err := queryPriceBatchRows(r.Context(), pool, tu.TenantID, f, sortKey, p.Order, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load price batch lines.", "ERR_INTERNAL")
			return
		}
		response.OKList(w, rows, p.Page, p.PageSize, total)
	}
}

type priceBatchLineUpdate struct {
	LineID     int64   `json:"line_id"`
	UnitNonVat float64 `json:"unit_non_vat"`
}

func patchPriceBatchLines(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body struct {
			Lines []priceBatchLineUpdate `json:"lines"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.Lines) == 0 {
			response.Validation(w, map[string]string{"lines": "At least one line is required."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		affectedSales := map[int64]struct{}{}
		var updatedCount int

		for i, item := range body.Lines {
			if item.LineID <= 0 {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].line_id", i): "Invalid line."})
				return
			}
			if item.UnitNonVat < 0 {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].unit_non_vat", i): "Must be zero or greater."})
				return
			}

			var salesID, taxTypeID int64
			var qty float64
			err := tx.QueryRow(r.Context(), `
				select s.id, s.tax_type_id, ln.qty::float8
				from public.sa_sales_lines ln
				join public.sa_sales s on s.id = ln.sales_id
				where ln.id = $1 and s.tenant_id = $2 and s.deleted_at is null`,
				item.LineID, tu.TenantID).Scan(&salesID, &taxTypeID, &qty)
			if err != nil {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].line_id", i): "Line not found."})
				return
			}

			tt, err := loadTaxCalcType(r.Context(), pool, tu.TenantID, taxTypeID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load tax type.", "ERR_INTERNAL")
				return
			}

			amounts := taxcalc.ComputeLine(tt, item.UnitNonVat, qty, taxcalc.InputNonVatUnit)
			discountedUnitNonVat := amounts.UnitNonVat
			discountedUnitVatInc := amounts.UnitVatInc

			_, err = tx.Exec(r.Context(), `
				update public.sa_sales_lines set
				  unit_non_vat = $1, non_vat_total = $2, tax_amount = $3,
				  unit_vat_inc = $4, line_total = $5,
				  discounted_unit_non_vat = $6, discounted_unit_vat_inc = $7
				where id = $8`,
				amounts.UnitNonVat, amounts.NonVatTotal, amounts.TaxAmount,
				amounts.UnitVatInc, amounts.LineTotal,
				discountedUnitNonVat, discountedUnitVatInc,
				item.LineID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to update line.", "ERR_INTERNAL")
				return
			}

			affectedSales[salesID] = struct{}{}
			updatedCount++
		}

		for salesID := range affectedSales {
			if err := recomputeSaleTotals(r.Context(), tx, salesID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to update totals.", "ERR_INTERNAL")
				return
			}
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales.price_batch", "sa_sales", nil, nil, body)
		response.OK(w, map[string]any{"updated_count": updatedCount}, "Updated.")
	}
}

func recomputeSaleTotals(ctx context.Context, tx pgx.Tx, salesID int64) error {
	var subtotal, taxTotal, grandTotal float64
	err := tx.QueryRow(ctx, `
		select coalesce(sum(non_vat_total), 0)::float8,
		       coalesce(sum(tax_amount), 0)::float8,
		       coalesce(sum(line_total), 0)::float8
		from public.sa_sales_lines where sales_id = $1`, salesID).
		Scan(&subtotal, &taxTotal, &grandTotal)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		update public.sa_sales
		set subtotal = $1, tax_total = $2, grand_total = $3, updated_at = now()
		where id = $4`, subtotal, taxTotal, grandTotal, salesID)
	return err
}
