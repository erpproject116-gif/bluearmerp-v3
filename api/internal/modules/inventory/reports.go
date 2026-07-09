package inventory

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/reports"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type stockBalanceRow struct {
	ItemID       int64   `json:"item_id"`
	ItemCode     string  `json:"item_code"`
	ItemName     string  `json:"item_name"`
	LocationID   int64   `json:"location_id"`
	LocationName string  `json:"location_name"`
	QtyOnHand    float64 `json:"qty_on_hand"`
	QtyReserved  float64 `json:"qty_reserved"`
	AvailableQty float64 `json:"available_qty"`
}

type stockLedgerRow struct {
	ID             int64   `json:"id"`
	CreatedAt      string  `json:"created_at"`
	ItemCode       string  `json:"item_code"`
	ItemName       string  `json:"item_name"`
	LocationName   string  `json:"location_name"`
	QtyDelta       float64 `json:"qty_delta"`
	RunningBalance float64 `json:"running_balance"`
	MovementType   string  `json:"movement_type"`
	RefType        string  `json:"ref_type"`
	RefID          *int64  `json:"ref_id,omitempty"`
	Reason         string  `json:"reason,omitempty"`
}

type stockAgeingRow struct {
	ItemID         int64   `json:"item_id"`
	ItemCode       string  `json:"item_code"`
	ItemName       string  `json:"item_name"`
	LocationID     int64   `json:"location_id"`
	LocationName   string  `json:"location_name"`
	QtyOnHand      float64 `json:"qty_on_hand"`
	LastMovementAt string  `json:"last_movement_at"`
	AgeDays        int     `json:"age_days"`
	AgeBucket      string  `json:"age_bucket"`
}

func registerInventoryReportRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/reports", func(rr chi.Router) {
		rr.Get("/stock-balance/export", exportStockBalance(pool))
		rr.Get("/stock-balance", listStockBalance(pool))
		rr.Get("/stock-ledger/export", exportStockLedger(pool))
		rr.Get("/stock-ledger", listStockLedger(pool))
		rr.Get("/stock-ageing/export", exportStockAgeing(pool))
		rr.Get("/stock-ageing", listStockAgeing(pool))
		rr.Get("/on-hand/export", exportOnHandReport(pool))
		rr.Get("/on-hand", listOnHandReport(pool))
		rr.Get("/inv-book/export", exportInvBookReport(pool))
		rr.Get("/inv-book", listInvBookReport(pool))
	})
}

func stockBalanceSQL(tenantID int64) string {
	return `
		select i.id, i.item_code, i.item_name,
		  l.id, l.location_name,
		  bal.qty_on_hand::float8,
		  bal.qty_reserved::float8,
		  (bal.qty_on_hand - bal.qty_reserved)::float8
		from public.inv_item_location_balances bal
		join public.inv_items i on i.id = bal.item_id and i.tenant_id = bal.tenant_id
		join public.inv_locations l on l.id = bal.location_id
		where bal.tenant_id = $1`
}

func listStockBalance(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"item_code": "item_code", "qty_on_hand": "qty_on_hand", "available_qty": "available_qty",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "item_code", allowed)
		offset := httputil.Offset(p)
		base := stockBalanceSQL(tu.TenantID)
		countQ := fmt.Sprintf("select count(*) from (%s) sub", base)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, tu.TenantID).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count report.", "ERR_INTERNAL")
			return
		}
		q := fmt.Sprintf("select * from (%s) sub order by %s %s limit $2 offset $3", base, p.Sort, reports.OrderSQL(p.Order))
		rows, err := pool.Query(r.Context(), q, tu.TenantID, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load report.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []stockBalanceRow
		for rows.Next() {
			var row stockBalanceRow
			if err := rows.Scan(&row.ItemID, &row.ItemCode, &row.ItemName, &row.LocationID, &row.LocationName,
				&row.QtyOnHand, &row.QtyReserved, &row.AvailableQty); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read report.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []stockBalanceRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func exportStockBalance(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		q := fmt.Sprintf("select * from (%s) sub order by item_code asc limit %d", stockBalanceSQL(tu.TenantID), reports.ExportMaxRows)
		rows, err := pool.Query(r.Context(), q, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="stock-balance.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Item Code", "Item Name", "Location", "On Hand", "Reserved", "Available"})
		for rows.Next() {
			var row stockBalanceRow
			if err := rows.Scan(&row.ItemID, &row.ItemCode, &row.ItemName, &row.LocationID, &row.LocationName,
				&row.QtyOnHand, &row.QtyReserved, &row.AvailableQty); err != nil {
				return
			}
			_ = cw.Write([]string{
				row.ItemCode, row.ItemName, row.LocationName,
				fmt.Sprintf("%.4f", row.QtyOnHand), fmt.Sprintf("%.4f", row.QtyReserved), fmt.Sprintf("%.4f", row.AvailableQty),
			})
		}
		cw.Flush()
	}
}

func stockLedgerWhere(tenantID int64, dateFrom, dateTo *time.Time, itemID, locationID *int64, q string) (string, []any) {
	where := "sm.tenant_id = $1"
	args := []any{tenantID}
	n := 2
	if dateFrom != nil && dateTo != nil {
		where += fmt.Sprintf(" and sm.created_at >= $%d::timestamptz and sm.created_at < ($%d::date + interval '1 day')", n, n+1)
		args = append(args, dateFrom.Format("2006-01-02")+" 00:00:00+00", dateTo.Format("2006-01-02"))
		n += 2
	}
	if itemID != nil {
		where += fmt.Sprintf(" and sm.item_id = $%d", n)
		args = append(args, *itemID)
		n++
	}
	if locationID != nil {
		where += fmt.Sprintf(" and sm.location_id = $%d", n)
		args = append(args, *locationID)
		n++
	}
	if strings.TrimSpace(q) != "" {
		where += fmt.Sprintf(" and (i.item_code ilike $%d or i.item_name ilike $%d)", n, n)
		args = append(args, "%"+strings.TrimSpace(q)+"%")
	}
	return where, args
}

func stockLedgerSQL(tenantID int64, dateFrom, dateTo *time.Time, itemID, locationID *int64, q string) (string, []any) {
	where, args := stockLedgerWhere(tenantID, dateFrom, dateTo, itemID, locationID, q)
	qry := fmt.Sprintf(`
		select sm.id, sm.created_at::text, i.item_code, i.item_name, l.location_name,
		  sm.qty_delta::float8,
		  sum(sm.qty_delta) over (partition by sm.item_id, sm.location_id order by sm.created_at, sm.id)::float8,
		  sm.movement_type, sm.ref_type, sm.ref_id,
		  coalesce(sm.reason, '')
		from public.inv_stock_movements sm
		join public.inv_items i on i.id = sm.item_id
		join public.inv_locations l on l.id = sm.location_id
		where %s`, where)
	return qry, args
}

func listStockLedger(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"created_at": "created_at", "item_code": "item_code", "qty_delta": "qty_delta",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, ok := reports.ValidationDateRange(w, r)
		if !ok {
			return
		}
		itemID, _ := parseOptionalItemID(r)
		locationID, _ := parseOptionalLocationID(r)
		qFilter := strings.TrimSpace(r.URL.Query().Get("q"))
		p := httputil.ParseListParams(r, "created_at", allowed)
		if p.Order == "" {
			p.Order = "desc"
		}
		offset := httputil.Offset(p)
		base, args := stockLedgerSQL(tu.TenantID, dateFrom, dateTo, itemID, locationID, qFilter)
		countQ := fmt.Sprintf("select count(*) from (%s) sub", base)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count report.", "ERR_INTERNAL")
			return
		}
		args = append(args, p.PageSize, offset)
		q := fmt.Sprintf("select * from (%s) sub order by %s %s limit $%d offset $%d", base, p.Sort, reports.OrderSQL(p.Order), len(args)-1, len(args))
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load report.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []stockLedgerRow
		for rows.Next() {
			var row stockLedgerRow
			if err := rows.Scan(&row.ID, &row.CreatedAt, &row.ItemCode, &row.ItemName, &row.LocationName,
				&row.QtyDelta, &row.RunningBalance, &row.MovementType, &row.RefType, &row.RefID, &row.Reason); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read report.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []stockLedgerRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func exportStockLedger(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, ok := reports.ValidationDateRange(w, r)
		if !ok {
			return
		}
		itemID, _ := parseOptionalItemID(r)
		locationID, _ := parseOptionalLocationID(r)
		qFilter := strings.TrimSpace(r.URL.Query().Get("q"))
		base, args := stockLedgerSQL(tu.TenantID, dateFrom, dateTo, itemID, locationID, qFilter)
		q := fmt.Sprintf("select * from (%s) sub order by created_at desc limit %d", base, reports.ExportMaxRows)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="stock-ledger.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Date", "Item Code", "Item Name", "Location", "Qty Delta", "Running Balance", "Type", "Ref", "Ref ID", "Reason"})
		for rows.Next() {
			var row stockLedgerRow
			if err := rows.Scan(&row.ID, &row.CreatedAt, &row.ItemCode, &row.ItemName, &row.LocationName,
				&row.QtyDelta, &row.RunningBalance, &row.MovementType, &row.RefType, &row.RefID, &row.Reason); err != nil {
				return
			}
			refID := ""
			if row.RefID != nil {
				refID = strconv.FormatInt(*row.RefID, 10)
			}
			_ = cw.Write([]string{
				row.CreatedAt, row.ItemCode, row.ItemName, row.LocationName,
				fmt.Sprintf("%.4f", row.QtyDelta), fmt.Sprintf("%.4f", row.RunningBalance), row.MovementType, row.RefType, refID, strings.TrimSpace(row.Reason),
			})
		}
		cw.Flush()
	}
}

func stockAgeingSQL() string {
	return `
		select
		  i.id,
		  i.item_code,
		  i.item_name,
		  l.id,
		  l.location_name,
		  bal.qty_on_hand::float8,
		  coalesce(max(sm.created_at), bal.updated_at, bal.created_at)::date::text as last_movement_at,
		  greatest((current_date - coalesce(max(sm.created_at)::date, bal.updated_at::date, bal.created_at::date)), 0)::int as age_days,
		  case
		    when greatest((current_date - coalesce(max(sm.created_at)::date, bal.updated_at::date, bal.created_at::date)), 0) <= 30 then '0-30'
		    when greatest((current_date - coalesce(max(sm.created_at)::date, bal.updated_at::date, bal.created_at::date)), 0) <= 60 then '31-60'
		    when greatest((current_date - coalesce(max(sm.created_at)::date, bal.updated_at::date, bal.created_at::date)), 0) <= 90 then '61-90'
		    when greatest((current_date - coalesce(max(sm.created_at)::date, bal.updated_at::date, bal.created_at::date)), 0) <= 180 then '91-180'
		    else '181+'
		  end as age_bucket
		from public.inv_item_location_balances bal
		join public.inv_items i on i.id = bal.item_id and i.tenant_id = bal.tenant_id
		join public.inv_locations l on l.id = bal.location_id and l.tenant_id = bal.tenant_id
		left join public.inv_stock_movements sm
		  on sm.tenant_id = bal.tenant_id
		 and sm.item_id = bal.item_id
		 and sm.location_id = bal.location_id
		where bal.tenant_id = $1
		  and bal.qty_on_hand > 0
		group by i.id, i.item_code, i.item_name, l.id, l.location_name, bal.qty_on_hand, bal.updated_at, bal.created_at`
}

func listStockAgeing(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"item_code": "item_code", "qty_on_hand": "qty_on_hand", "age_days": "age_days",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "age_days", allowed)
		if p.Order == "" {
			p.Order = "desc"
		}
		offset := httputil.Offset(p)
		base := stockAgeingSQL()
		countQ := fmt.Sprintf("select count(*) from (%s) sub", base)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, tu.TenantID).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count report.", "ERR_INTERNAL")
			return
		}
		q := fmt.Sprintf("select * from (%s) sub order by %s %s limit $2 offset $3", base, p.Sort, reports.OrderSQL(p.Order))
		rows, err := pool.Query(r.Context(), q, tu.TenantID, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load report.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []stockAgeingRow
		for rows.Next() {
			var row stockAgeingRow
			if err := rows.Scan(
				&row.ItemID, &row.ItemCode, &row.ItemName, &row.LocationID, &row.LocationName,
				&row.QtyOnHand, &row.LastMovementAt, &row.AgeDays, &row.AgeBucket,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read report.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []stockAgeingRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func exportStockAgeing(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		q := fmt.Sprintf("select * from (%s) sub order by age_days desc, item_code asc limit %d", stockAgeingSQL(), reports.ExportMaxRows)
		rows, err := pool.Query(r.Context(), q, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="stock-ageing.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Item Code", "Item Name", "Location", "On Hand", "Last Movement", "Age (Days)", "Bucket"})
		for rows.Next() {
			var row stockAgeingRow
			if err := rows.Scan(
				&row.ItemID, &row.ItemCode, &row.ItemName, &row.LocationID, &row.LocationName,
				&row.QtyOnHand, &row.LastMovementAt, &row.AgeDays, &row.AgeBucket,
			); err != nil {
				return
			}
			_ = cw.Write([]string{
				row.ItemCode,
				row.ItemName,
				row.LocationName,
				fmt.Sprintf("%.4f", row.QtyOnHand),
				row.LastMovementAt,
				fmt.Sprintf("%d", row.AgeDays),
				row.AgeBucket,
			})
		}
		cw.Flush()
	}
}
