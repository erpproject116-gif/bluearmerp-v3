package buying

import (
	"context"
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type preInvoicingPurchaseFilters struct {
	DateFrom  time.Time
	DateTo    time.Time
	PartnerID *int64
	AsOf      *time.Time
}

type preInvoicingPurchaseRow struct {
	GoodsReceiptID      int64   `json:"goods_receipt_id"`
	GoodsReceiptLineID  int64   `json:"goods_receipt_line_id"`
	PurchaseOrderNo     string  `json:"purchase_order_no"`
	ReceiptDate         string  `json:"receipt_date"`
	DateNoDisplay       string  `json:"date_no_display"`
	VendorName          string  `json:"vendor_name"`
	PartnerID           int64   `json:"partner_id"`
	ItemCode            string  `json:"item_code"`
	ItemName            string  `json:"item_name"`
	ReceivedQty         float64 `json:"received_qty"`
	BilledQty           float64 `json:"billed_qty"`
	BalanceQty          float64 `json:"balance_qty"`
	UnitVatInc          float64 `json:"unit_vat_inc"`
	BalanceAmount       float64 `json:"balance_amount"`
}

type preInvoicingPurchaseSummary struct {
	TotalQty    float64 `json:"total_qty"`
	TotalAmount float64 `json:"total_amount"`
}

func parsePreInvoicingPurchaseFilters(r *http.Request) (preInvoicingPurchaseFilters, map[string]string) {
	asOfStr := strings.TrimSpace(r.URL.Query().Get("as_of"))
	fromStr := strings.TrimSpace(r.URL.Query().Get("date_from"))
	toStr := strings.TrimSpace(r.URL.Query().Get("date_to"))
	errs := map[string]string{}

	f := preInvoicingPurchaseFilters{}
	if asOfStr != "" {
		asOf, err := parseDate(asOfStr)
		if err != nil {
			errs["as_of"] = "Invalid as-of date. Use YYYY-MM-DD."
			return f, errs
		}
		f.AsOf = &asOf
		f.DateFrom = time.Date(1900, 1, 1, 0, 0, 0, 0, time.UTC)
		f.DateTo = asOf
	} else {
		if fromStr == "" {
			errs["date_from"] = "Start date is required."
		}
		if toStr == "" {
			errs["date_to"] = "End date is required."
		}
		if len(errs) > 0 {
			return f, errs
		}
		from, err := parseDate(fromStr)
		if err != nil {
			errs["date_from"] = "Invalid date. Use YYYY-MM-DD."
		}
		to, err := parseDate(toStr)
		if err != nil {
			errs["date_to"] = "Invalid date. Use YYYY-MM-DD."
		}
		if len(errs) > 0 {
			return f, errs
		}
		if from.After(to) {
			errs["date_to"] = "End date must be on or after start date."
			return f, errs
		}
		f.DateFrom = from
		f.DateTo = to
	}
	if v := strings.TrimSpace(r.URL.Query().Get("partner_id")); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			f.PartnerID = &n
		}
	}
	return f, nil
}

func queryPreInvoicingPurchaseRows(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f preInvoicingPurchaseFilters, limit, offset int) ([]preInvoicingPurchaseRow, int64, preInvoicingPurchaseSummary, error) {
	where := `gr.tenant_id = $1 and gr.status = 'posted'
		and gr.receipt_date >= $2::date and gr.receipt_date <= $3::date
		and (grl.received_qty - coalesce(sl.billed, 0)) > 0.0001`
	args := []any{tenantID, f.DateFrom.Format("2006-01-02"), f.DateTo.Format("2006-01-02")}
	argN := 4
	if f.PartnerID != nil {
		where += fmt.Sprintf(" and po.partner_id = $%d", argN)
		args = append(args, *f.PartnerID)
		argN++
	}

	base := fmt.Sprintf(`
		from public.gr_goods_receipt_lines grl
		join public.gr_goods_receipts gr on gr.id = grl.goods_receipt_id
		join public.po_purchase_order_lines pol on pol.id = grl.purchase_order_line_id
		join public.po_purchase_orders po on po.id = pol.purchase_order_id
		join public.inv_partners p on p.id = po.partner_id
		left join (
		  select goods_receipt_line_id, sum(qty) as billed
		  from public.gr_goods_receipt_slip_lines
		  where slip_type = 'supplier_invoice'
		  group by goods_receipt_line_id
		) sl on sl.goods_receipt_line_id = grl.id
		where %s`, where)

	var total int64
	if err := pool.QueryRow(ctx, "select count(*) "+base, args...).Scan(&total); err != nil {
		return nil, 0, preInvoicingPurchaseSummary{}, err
	}

	var summary preInvoicingPurchaseSummary
	sumQ := fmt.Sprintf(`
		select coalesce(sum((grl.received_qty - coalesce(sl.billed, 0))::float8), 0),
		  coalesce(sum(((grl.received_qty - coalesce(sl.billed, 0)) * pol.unit_vat_inc)::float8), 0)
		%s`, base)
	if err := pool.QueryRow(ctx, sumQ, args...).Scan(&summary.TotalQty, &summary.TotalAmount); err != nil {
		return nil, 0, preInvoicingPurchaseSummary{}, err
	}

	args = append(args, limit, offset)
	q := fmt.Sprintf(`
		select gr.id, grl.id, po.purchase_order_no, gr.receipt_date, gr.date_seq,
		  p.id, p.company_name,
		  pol.item_code, pol.item_name,
		  grl.received_qty::float8, coalesce(sl.billed, 0)::float8,
		  (grl.received_qty - coalesce(sl.billed, 0))::float8,
		  pol.unit_vat_inc::float8,
		  ((grl.received_qty - coalesce(sl.billed, 0)) * pol.unit_vat_inc)::float8
		%s
		order by gr.receipt_date desc, grl.line_no asc
		limit $%d offset $%d`, base, argN, argN+1)

	rows, err := pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, preInvoicingPurchaseSummary{}, err
	}
	defer rows.Close()

	var out []preInvoicingPurchaseRow
	for rows.Next() {
		var row preInvoicingPurchaseRow
		var receiptDate time.Time
		var dateSeq int
		if err := rows.Scan(
			&row.GoodsReceiptID, &row.GoodsReceiptLineID, &row.PurchaseOrderNo, &receiptDate, &dateSeq,
			&row.PartnerID, &row.VendorName,
			&row.ItemCode, &row.ItemName,
			&row.ReceivedQty, &row.BilledQty, &row.BalanceQty, &row.UnitVatInc, &row.BalanceAmount,
		); err != nil {
			return nil, 0, preInvoicingPurchaseSummary{}, err
		}
		row.ReceiptDate = receiptDate.Format("2006-01-02")
		row.DateNoDisplay = formatDateNoDisplay(receiptDate, dateSeq)
		out = append(out, row)
	}
	if out == nil {
		out = []preInvoicingPurchaseRow{}
	}
	return out, total, summary, nil
}

func listPreInvoicingPurchaseReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parsePreInvoicingPurchaseFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		p := httputil.ParseListParams(r, "receipt_date", map[string]string{
			"receipt_date": "gr.receipt_date",
			"vendor_name":  "p.company_name",
			"item_code":    "pol.item_code",
		})
		offset := httputil.Offset(p)
		rows, total, summary, err := queryPreInvoicingPurchaseRows(r.Context(), pool, tu.TenantID, f, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load pre-invoicing report.", "ERR_INTERNAL")
			return
		}
		response.JSON(w, http.StatusOK, response.Envelope{
			Success: true,
			Message: "OK",
			Data: map[string]any{
				"rows":    rows,
				"summary": summary,
			},
			Meta: &response.Meta{Page: p.Page, PerPage: p.PageSize, Total: total},
		})
	}
}

func exportPreInvoicingPurchaseReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parsePreInvoicingPurchaseFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		rows, _, _, err := queryPreInvoicingPurchaseRows(r.Context(), pool, tu.TenantID, f, purchaseStatusExportMax, 0)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export pre-invoicing report.", "ERR_INTERNAL")
			return
		}
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="purchase-pre-invoicing.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"GR Date", "Date No", "PO No", "Vendor", "Item", "Balance Qty", "Balance Amount"})
		for _, row := range rows {
			_ = cw.Write([]string{
				row.ReceiptDate, row.DateNoDisplay, row.PurchaseOrderNo, row.VendorName,
				row.ItemCode + " " + row.ItemName,
				strconv.FormatFloat(row.BalanceQty, 'f', -1, 64),
				strconv.FormatFloat(row.BalanceAmount, 'f', -1, 64),
			})
		}
		cw.Flush()
	}
}
