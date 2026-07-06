package sales

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

type preInvoicingFilters struct {
	salesStatusFilters
}

type preInvoicingRow struct {
	SalesID          int64   `json:"sales_id"`
	LineID           int64   `json:"line_id"`
	DateNoDisplay    string  `json:"date_no_display"`
	SalesNo          string  `json:"sales_no"`
	ProgressStatus   string  `json:"progress_status"`
	InvoicingStatus  bool    `json:"invoicing_status"`
	LocationName     string  `json:"location_name"`
	PicName          string  `json:"pic_name"`
	CustomerName     string  `json:"customer_name"`
	TaxTypeName      string  `json:"tax_type_name"`
	SiDrNo           *string `json:"si_dr_no,omitempty"`
	DueDate          *string `json:"due_date,omitempty"`
	ItemCode         string  `json:"item_code"`
	ItemName         string  `json:"item_name"`
	Qty              float64 `json:"qty"`
	LineTotal        float64 `json:"line_total"`
	Remark           *string `json:"remark,omitempty"`
}

type preInvoicingSummary struct {
	TotalQty    float64 `json:"total_qty"`
	TotalAmount float64 `json:"total_amount"`
}

type preInvoicingPayload struct {
	Rows    []preInvoicingRow   `json:"rows"`
	Summary preInvoicingSummary `json:"summary"`
}

func parsePreInvoicingFilters(r *http.Request, tu auth.TenantUser) (preInvoicingFilters, map[string]string) {
	base, errs := parseSalesStatusFilters(r, tu)
	if errs != nil {
		return preInvoicingFilters{}, errs
	}
	return preInvoicingFilters{salesStatusFilters: base}, nil
}

func buildPreInvoicingWhere(f preInvoicingFilters, tenantID int64) (string, []any) {
	where, args := buildSalesStatusWhere(f.salesStatusFilters, tenantID)
	where += " and s.invoicing_status = false"
	return where, args
}

func preInvoicingFromClause() string {
	return salesStatusFromClause()
}

func preInvoicingOrderBy(sort, order string) string {
	return salesStatusOrderBy(sort, order)
}

func queryPreInvoicingRows(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f preInvoicingFilters, sort, order string, limit, offset int) ([]preInvoicingRow, int64, error) {
	where, args := buildPreInvoicingWhere(f, tenantID)
	orderClause := preInvoicingOrderBy(sort, order)
	q := fmt.Sprintf(`
		select s.id, ln.id, s.order_date, s.date_seq, s.sales_no, s.progress_status,
		  s.invoicing_status, l.location_name, s.pic_name, p.company_name, tt.name,
		  s.si_dr_no, s.due_date,
		  ln.item_code, ln.item_name, ln.qty::float8, ln.line_total::float8, ln.remark,
		  count(*) over()
		%s
		where %s
		order by %s
		limit $%d offset $%d`,
		preInvoicingFromClause(), where, orderClause, len(args)+1, len(args)+2)
	args = append(args, limit, offset)

	rows, err := pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []preInvoicingRow
	var total int64
	for rows.Next() {
		var row preInvoicingRow
		var orderDate time.Time
		var dateSeq int
		var dueDate *time.Time
		if err := rows.Scan(
			&row.SalesID, &row.LineID, &orderDate, &dateSeq, &row.SalesNo, &row.ProgressStatus,
			&row.InvoicingStatus, &row.LocationName, &row.PicName, &row.CustomerName, &row.TaxTypeName,
			&row.SiDrNo, &dueDate,
			&row.ItemCode, &row.ItemName, &row.Qty, &row.LineTotal, &row.Remark, &total,
		); err != nil {
			return nil, 0, err
		}
		row.DateNoDisplay = formatDateNoDisplay(orderDate, dateSeq)
		row.DueDate = datePtrToStr(dueDate)
		out = append(out, row)
	}
	if out == nil {
		out = []preInvoicingRow{}
	}
	return out, total, nil
}

func queryPreInvoicingSummary(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f preInvoicingFilters) (preInvoicingSummary, error) {
	where, args := buildPreInvoicingWhere(f, tenantID)
	q := fmt.Sprintf(`select coalesce(sum(ln.qty), 0)::float8, coalesce(sum(ln.line_total), 0)::float8 %s where %s`,
		preInvoicingFromClause(), where)
	var summary preInvoicingSummary
	err := pool.QueryRow(ctx, q, args...).Scan(&summary.TotalQty, &summary.TotalAmount)
	return summary, err
}

func listPreInvoicingReport(pool *pgxpool.Pool) http.HandlerFunc {
	allowedSort := map[string]string{
		"order_date":      "s.order_date",
		"sales_no":        "s.sales_no",
		"progress_status": "s.progress_status",
		"location_name":   "l.location_name",
		"pic_name":        "s.pic_name",
		"customer_name":   "p.company_name",
		"due_date":        "s.due_date",
		"item_code":       "ln.item_code",
		"qty":             "ln.qty",
		"line_total":      "ln.line_total",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parsePreInvoicingFilters(r, tu)
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

		rows, total, err := queryPreInvoicingRows(r.Context(), pool, tu.TenantID, f, sortKey, p.Order, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load pre-invoicing report.", "ERR_INTERNAL")
			return
		}
		summary, err := queryPreInvoicingSummary(r.Context(), pool, tu.TenantID, f)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load pre-invoicing summary.", "ERR_INTERNAL")
			return
		}

		w.Header().Set("Cache-Control", "private, max-age=15")
		response.JSON(w, http.StatusOK, response.Envelope{
			Success: true,
			Message: "OK",
			Data: preInvoicingPayload{
				Rows:    rows,
				Summary: summary,
			},
			Meta: &response.Meta{Page: p.Page, PerPage: p.PageSize, Total: total},
		})
	}
}

func exportPreInvoicingReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parsePreInvoicingFilters(r, tu)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		rows, _, err := queryPreInvoicingRows(r.Context(), pool, tu.TenantID, f, "order_date", "desc", statusReportExportMaxRows, 0)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export pre-invoicing report.", "ERR_INTERNAL")
			return
		}

		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="sales-pre-invoicing.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{
			"Date-No", "Sales No", "Progress Status", "Location Name", "PIC Name",
			"Customer Name", "Tax Type", "SI/DR No", "Due Date", "Item Code", "Item Name", "Qty", "Line Total", "Remark",
		})
		for _, row := range rows {
			dueDate := ""
			if row.DueDate != nil {
				dueDate = *row.DueDate
			}
			siDrNo := ""
			if row.SiDrNo != nil {
				siDrNo = *row.SiDrNo
			}
			remark := ""
			if row.Remark != nil {
				remark = *row.Remark
			}
			_ = cw.Write([]string{
				row.DateNoDisplay, row.SalesNo, formatProgressLabel(row.ProgressStatus),
				row.LocationName, row.PicName, row.CustomerName, row.TaxTypeName, siDrNo, dueDate,
				row.ItemCode, row.ItemName,
				strconv.FormatFloat(row.Qty, 'f', -1, 64),
				strconv.FormatFloat(row.LineTotal, 'f', -1, 64),
				remark,
			})
		}
		cw.Flush()
	}
}
