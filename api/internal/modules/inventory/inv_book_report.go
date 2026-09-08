package inventory

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/reports"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type invBookRow struct {
	ItemID        int64   `json:"item_id"`
	ItemCode      string  `json:"item_code"`
	ItemName      string  `json:"item_name"`
	LocationID    int64   `json:"location_id"`
	LocationName  string  `json:"location_name"`
	OpeningQty    float64 `json:"opening_qty"`
	ReceiptQty    float64 `json:"receipt_qty"`
	IssueQty      float64 `json:"issue_qty"`
	ClosingQty    float64 `json:"closing_qty"`
	PurchasePrice float64 `json:"purchase_price"`
	SalesPrice    float64 `json:"sales_price"`
	VipPrice      float64 `json:"vip_price"`
}

func invBookSQL(tenantID int64, dateFrom, dateTo time.Time, itemID, locationID *int64, q string) (string, []any) {
	args := []any{tenantID, dateFrom.Format("2006-01-02"), dateTo.Format("2006-01-02")}
	extra := ""
	n := 4
	if itemID != nil {
		extra += fmt.Sprintf(" and i.id = $%d", n)
		args = append(args, *itemID)
		n++
	}
	if locationID != nil {
		extra += fmt.Sprintf(" and l.id = $%d", n)
		args = append(args, *locationID)
		n++
	}
	if strings.TrimSpace(q) != "" {
		extra += fmt.Sprintf(" and (i.item_code ilike $%d or i.item_name ilike $%d or coalesce(i.spec_name,'') ilike $%d)", n, n, n)
		args = append(args, "%"+strings.TrimSpace(q)+"%")
	}
	qry := `
		with bounds as (
		  select $2::date as d_from, $3::date as d_to
		),
		movements as (
		  select sm.item_id, sm.location_id,
		    coalesce(sum(case when sm.created_at < (select d_from from bounds) then sm.qty_delta else 0 end), 0)::float8 as opening_qty,
		    coalesce(sum(case when sm.created_at >= (select d_from from bounds)
		      and sm.created_at < ((select d_to from bounds) + interval '1 day')
		      and sm.qty_delta > 0 then sm.qty_delta else 0 end), 0)::float8 as receipt_qty,
		    coalesce(sum(case when sm.created_at >= (select d_from from bounds)
		      and sm.created_at < ((select d_to from bounds) + interval '1 day')
		      and sm.qty_delta < 0 then -sm.qty_delta else 0 end), 0)::float8 as issue_qty
		  from public.inv_stock_movements sm
		  where sm.tenant_id = $1
		  group by sm.item_id, sm.location_id
		)
		select i.id as item_id, i.item_code, i.item_name, l.id as location_id, l.location_name,
		  m.opening_qty, m.receipt_qty, m.issue_qty,
		  (m.opening_qty + m.receipt_qty - m.issue_qty)::float8 as closing_qty,
		  coalesce(i.purchase_price, 0)::float8 as purchase_price,
		  coalesce(i.sales_price, 0)::float8 as sales_price,
		  coalesce(i.vip_price, 0)::float8 as vip_price
		from movements m
		join public.inv_items i on i.id = m.item_id and i.tenant_id = $1 and i.deleted_at is null
		join public.inv_locations l on l.id = m.location_id and l.tenant_id = $1 and l.deleted_at is null
		where (m.opening_qty <> 0 or m.receipt_qty <> 0 or m.issue_qty <> 0)` + extra
	return qry, args
}

func listInvBookReport(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{"item_code": "item_code", "closing_qty": "closing_qty"}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, ok := reports.ValidationDateRange(w, r)
		if !ok {
			return
		}
		if dateFrom == nil || dateTo == nil {
			response.Validation(w, map[string]string{
				"date_from": "Start date is required.",
				"date_to":   "End date is required.",
			})
			return
		}
		p := httputil.ParseListParams(r, "item_code", allowed)
		offset := httputil.Offset(p)
		itemID, _ := parseOptionalItemID(r)
		locationID, _ := parseOptionalLocationID(r)
		qFilter := strings.TrimSpace(r.URL.Query().Get("q"))
		base, args := invBookSQL(tu.TenantID, *dateFrom, *dateTo, itemID, locationID, qFilter)
		countQ := fmt.Sprintf("select count(*) from (%s) sub", base)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count inv. book.", "ERR_INTERNAL")
			return
		}
		args = append(args, p.PageSize, offset)
		q := fmt.Sprintf("select * from (%s) sub order by %s %s limit $%d offset $%d", base, p.Sort, reports.OrderSQL(p.Order), len(args)-1, len(args))
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load inv. book.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []invBookRow
		for rows.Next() {
			var row invBookRow
			if err := rows.Scan(&row.ItemID, &row.ItemCode, &row.ItemName, &row.LocationID, &row.LocationName,
				&row.OpeningQty, &row.ReceiptQty, &row.IssueQty, &row.ClosingQty, &row.PurchasePrice, &row.SalesPrice, &row.VipPrice); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read inv. book.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []invBookRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func exportInvBookReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, ok := reports.ValidationDateRange(w, r)
		if !ok {
			return
		}
		if dateFrom == nil || dateTo == nil {
			response.Validation(w, map[string]string{
				"date_from": "Start date is required.",
				"date_to":   "End date is required.",
			})
			return
		}
		itemID, _ := parseOptionalItemID(r)
		locationID, _ := parseOptionalLocationID(r)
		qFilter := strings.TrimSpace(r.URL.Query().Get("q"))
		base, args := invBookSQL(tu.TenantID, *dateFrom, *dateTo, itemID, locationID, qFilter)
		q := fmt.Sprintf("select * from (%s) sub order by item_code asc limit %d", base, reports.ExportMaxRows)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export inv. book.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="inv-book.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Item Code", "Item Name", "Location", "Opening", "Receipt", "Issue", "Closing", "Purchase Price", "Sales Price", "VIP Price"})
		for rows.Next() {
			var row invBookRow
			if err := rows.Scan(&row.ItemID, &row.ItemCode, &row.ItemName, &row.LocationID, &row.LocationName,
				&row.OpeningQty, &row.ReceiptQty, &row.IssueQty, &row.ClosingQty, &row.PurchasePrice, &row.SalesPrice, &row.VipPrice); err != nil {
				return
			}
			_ = cw.Write([]string{
				row.ItemCode, row.ItemName, row.LocationName,
				fmt.Sprintf("%.4f", row.OpeningQty), fmt.Sprintf("%.4f", row.ReceiptQty),
				fmt.Sprintf("%.4f", row.IssueQty), fmt.Sprintf("%.4f", row.ClosingQty),
				fmt.Sprintf("%.4f", row.PurchasePrice), fmt.Sprintf("%.4f", row.SalesPrice),
				fmt.Sprintf("%.4f", row.VipPrice),
			})
		}
		cw.Flush()
	}
}
