package salesorder

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth/datascope"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/openlines"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type openQuotationLineRow struct {
	QuotationID    int64   `json:"quotation_id"`
	QuotationLineID int64  `json:"quotation_line_id"`
	DateNoDisplay  string  `json:"date_no_display"`
	ReferenceNo    string  `json:"reference_no"`
	CustomerName   string  `json:"customer_name"`
	LocationID     int64   `json:"location_id"`
	LocationName   string  `json:"location_name"`
	PartnerID      int64   `json:"partner_id"`
	TaxTypeID      int64   `json:"tax_type_id"`
	CurrencyID     int64   `json:"currency_id"`
	PicName        string  `json:"pic_name"`
	ItemID         *int64  `json:"item_id,omitempty"`
	ItemCode       string  `json:"item_code"`
	ItemName       string  `json:"item_name"`
	Description    *string `json:"description,omitempty"`
	Qty            float64 `json:"qty"`
	BalanceQty     float64 `json:"balance_qty"`
	UnitID         *int64  `json:"unit_id,omitempty"`
	UnitCode       string  `json:"unit_code,omitempty"`
	UnitVatInc     float64 `json:"unit_vat_inc"`
	Remark         *string `json:"remark,omitempty"`
}

func listOpenQuotationLines(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "order_date", map[string]string{
			"order_date":    "q.order_date",
			"reference_no":  "q.reference_no",
			"customer_name": "p.company_name",
			"item_code":     "ln.item_code",
		})
		offset := httputil.Offset(p)

		where := `q.tenant_id = $1 and q.deleted_at is null
			and ln.item_id is not null
			and (ln.qty - coalesce(slip.qty_fulfilled, 0)) > 0.0001`
		args := []any{tu.TenantID}
		argN := 2

		if p.Q != "" {
			where += fmt.Sprintf(` and (
				q.reference_no ilike $%d or p.company_name ilike $%d or
				coalesce(p.partner_code, '') ilike $%d or
				ln.item_code ilike $%d or ln.item_name ilike $%d or
				coalesce(ln.remark, '') ilike $%d)`, argN, argN, argN, argN, argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}

		f := openlines.ParseFilters(r, 0)
		where, args, argN = f.Apply(where, args, argN, "q.partner_id", "q.order_date", "q.reference_no")

		dsScope, argN, err := datascope.ApplyUserScopesSQL(r.Context(), pool, tu, datascope.ListFilter{
			CustomerColumn: "q.partner_id",
			LocationColumn: "q.location_id",
		}, argN, &args)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to apply data scopes.", "ERR_INTERNAL")
			return
		}
		where += dsScope

		q := fmt.Sprintf(`
			select q.id, ln.id, q.order_date, q.date_seq, q.reference_no,
			  p.company_name, q.location_id, l.location_name, q.partner_id,
			  q.tax_type_id, q.currency_id, q.pic_name,
			  ln.item_id, ln.item_code, ln.item_name, ln.description,
			  ln.qty::float8,
			  (ln.qty - coalesce(slip.qty_fulfilled, 0))::float8,
			  ln.unit_id, coalesce(ln.unit_code, ''),
			  ln.unit_vat_inc::float8, ln.remark,
			  count(*) over()
			from public.quo_quotations q
			join public.inv_partners p on p.id = q.partner_id
			join public.inv_locations l on l.id = q.location_id
			join public.quo_quotation_lines ln on ln.quotation_id = q.id
			left join (
			  select quotation_line_id, sum(qty) as qty_fulfilled
			  from public.quo_quotation_slip_lines
			  group by quotation_line_id
			) slip on slip.quotation_line_id = ln.id
			where %s
			order by q.order_date desc, ln.line_no asc
			limit $%d offset $%d`, where, argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list quotation lines.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []openQuotationLineRow
		var total int64
		for rows.Next() {
			var row openQuotationLineRow
			var orderDate time.Time
			var dateSeq int
			if err := rows.Scan(
				&row.QuotationID, &row.QuotationLineID, &orderDate, &dateSeq, &row.ReferenceNo,
				&row.CustomerName, &row.LocationID, &row.LocationName, &row.PartnerID,
				&row.TaxTypeID, &row.CurrencyID, &row.PicName,
				&row.ItemID, &row.ItemCode, &row.ItemName, &row.Description,
				&row.Qty, &row.BalanceQty, &row.UnitID, &row.UnitCode, &row.UnitVatInc, &row.Remark, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read quotation lines.", "ERR_INTERNAL")
				return
			}
			row.DateNoDisplay = formatDateNoDisplay(orderDate, dateSeq)
			out = append(out, row)
		}
		if out == nil {
			out = []openQuotationLineRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func quotationLineBalance(ctx context.Context, tx pgx.Tx, tenantID, quotationLineID int64) (float64, error) {
	var balance float64
	err := tx.QueryRow(ctx, `
		select (ln.qty - coalesce(slip.fulfilled, 0))::float8
		from public.quo_quotation_lines ln
		join public.quo_quotations q on q.id = ln.quotation_id
		left join (
		  select quotation_line_id, sum(qty) as fulfilled
		  from public.quo_quotation_slip_lines
		  group by quotation_line_id
		) slip on slip.quotation_line_id = ln.id
		where ln.id = $1 and q.tenant_id = $2 and q.deleted_at is null`,
		quotationLineID, tenantID).Scan(&balance)
	return balance, err
}

func validateQuotationConversion(ctx context.Context, pool *pgxpool.Pool, tenantID int64, lines []computedLine) map[string]string {
	errs := map[string]string{}
	for i, ln := range lines {
		if ln.SourceQuotationLineID == nil {
			continue
		}
		var balance float64
		err := pool.QueryRow(ctx, `
			select (ln.qty - coalesce(slip.fulfilled, 0))::float8
			from public.quo_quotation_lines ln
			join public.quo_quotations q on q.id = ln.quotation_id
			left join (
			  select quotation_line_id, sum(qty) as fulfilled
			  from public.quo_quotation_slip_lines
			  group by quotation_line_id
			) slip on slip.quotation_line_id = ln.id
			where ln.id = $1 and q.tenant_id = $2 and q.deleted_at is null`,
			*ln.SourceQuotationLineID, tenantID).Scan(&balance)
		if err != nil {
			errs[fmt.Sprintf("lines[%d].source_quotation_line_id", i)] = "Quotation line not found."
			continue
		}
		if ln.Qty > balance+0.0001 {
			errs[fmt.Sprintf("lines[%d].qty", i)] = fmt.Sprintf("Exceeds quotation balance (%.4f available).", balance)
		}
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func writeQuotationSlipsForSalesOrder(ctx context.Context, tx pgx.Tx, tenantID, salesOrderID int64, salesOrderNo, dateNoDisplay string, lines []computedLine, lineIDs []int64) error {
	quotationIDs := map[int64]struct{}{}
	for i, ln := range lines {
		if ln.SourceQuotationLineID == nil {
			continue
		}
		balance, err := quotationLineBalance(ctx, tx, tenantID, *ln.SourceQuotationLineID)
		if err != nil {
			return errors.New("Quotation line not found for conversion.")
		}
		if ln.Qty > balance+0.0001 {
			return fmt.Errorf("Line %d exceeds quotation balance.", i+1)
		}
		slipRef := salesOrderNo
		_, err = tx.Exec(ctx, `
			insert into public.quo_quotation_slip_lines
			  (quotation_line_id, slip_type, slip_ref, slip_date_no, qty, sales_order_id)
			values ($1, 'sales_order', $2, $3, $4, $5)`,
			*ln.SourceQuotationLineID, slipRef, dateNoDisplay, ln.Qty, salesOrderID)
		if err != nil {
			return err
		}

		var quotationID int64
		if err := tx.QueryRow(ctx,
			`select quotation_id from public.quo_quotation_lines where id = $1`,
			*ln.SourceQuotationLineID).Scan(&quotationID); err == nil {
			quotationIDs[quotationID] = struct{}{}
		}
		_ = lineIDs
	}

	for qid := range quotationIDs {
		if err := recomputeQuotationVoucherStatus(ctx, tx, tenantID, qid); err != nil {
			return err
		}
	}
	return nil
}

func recomputeQuotationVoucherStatus(ctx context.Context, tx pgx.Tx, tenantID, quotationID int64) error {
	var totalLines int
	var fullyFulfilled int
	var anyFulfilled bool

	rows, err := tx.Query(ctx, `
		select ln.qty::float8, coalesce(slip.fulfilled, 0)::float8
		from public.quo_quotation_lines ln
		left join (
		  select quotation_line_id, sum(qty) as fulfilled
		  from public.quo_quotation_slip_lines
		  group by quotation_line_id
		) slip on slip.quotation_line_id = ln.id
		where ln.quotation_id = $1`, quotationID)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var lineQty, fulfilled float64
		if err := rows.Scan(&lineQty, &fulfilled); err != nil {
			return err
		}
		totalLines++
		if fulfilled > 0.0001 {
			anyFulfilled = true
		}
		if fulfilled+0.0001 >= lineQty {
			fullyFulfilled++
		}
	}

	status := "none"
	if anyFulfilled {
		status = "partial"
	}
	if totalLines > 0 && fullyFulfilled == totalLines {
		status = "completed"
	}

	_, err = tx.Exec(ctx, `
		update public.quo_quotations
		set voucher_status = $1, updated_at = now()
		where id = $2 and tenant_id = $3`,
		status, quotationID, tenantID)
	return err
}
