package inventory

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/reports"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const lotEventQtyDelta = `case e.event_type
  when 'received' then e.qty
  when 'returned' then e.qty
  when 'produced' then e.qty
  when 'sold' then -e.qty
  when 'voided' then -e.qty
  when 'consumed' then -e.qty
  else 0
end`

// Non-qty warehouse events (ECOUNT "Goods Issued / Location Tran.").
const lotTransferEventTypes = `'transferred'`

const lotBookPartnerNameSQL = `coalesce(nullif(trim(
  case
    when p.ref_type in ('sales', 'sa_sales') and p.ref_id is not null then (
      select coalesce(pr.company_name, '')
      from public.sa_sales s
      join public.inv_partners pr on pr.id = s.partner_id
      where s.id = p.ref_id and s.tenant_id = p.tenant_id
      limit 1
    )
    when p.ref_type = 'sa_sales_line' and p.ref_id is not null then (
      select coalesce(pr.company_name, '')
      from public.sa_sales_lines ln
      join public.sa_sales s on s.id = ln.sales_id
      join public.inv_partners pr on pr.id = s.partner_id
      where ln.id = p.ref_id and s.tenant_id = p.tenant_id
      limit 1
    )
    when p.ref_type = 'goods_receipt' and p.ref_id is not null then (
      select coalesce(pr.company_name, '')
      from public.gr_goods_receipts gr
      join public.po_purchase_orders po on po.id = gr.purchase_order_id
      join public.inv_partners pr on pr.id = po.partner_id
      where gr.id = p.ref_id and gr.tenant_id = p.tenant_id
      limit 1
    )
    else ''
  end
), ''), '')`

type lotBookDetailRow struct {
	ID              int64   `json:"id"`
	CreatedAt       string  `json:"created_at"`
	LotNo           string  `json:"lot_no"`
	ItemCode        string  `json:"item_code"`
	ItemName        string  `json:"item_name"`
	LocationName    string  `json:"location_name"`
	TermsOfValidity *string `json:"terms_of_validity,omitempty"`
	SlipType        string  `json:"slip_type"`
	PartnerName     string  `json:"partner_name"`
	EventType       string  `json:"event_type"`
	OpeningQty      float64 `json:"opening_qty"`
	IncreaseQty     float64 `json:"increase_qty"`
	ReleaseQty      float64 `json:"release_qty"`
	InventoryQty    float64 `json:"inventory_qty"`
	QtyDelta        float64 `json:"qty_delta"`
	RefType         *string `json:"ref_type,omitempty"`
	RefID           *int64  `json:"ref_id,omitempty"`
	Notes           *string `json:"notes,omitempty"`
}

type lotBookSummaryRow struct {
	LotNo        string  `json:"lot_no"`
	ItemCode     string  `json:"item_code"`
	ItemName     string  `json:"item_name"`
	LocationName string  `json:"location_name"`
	OpeningQty   float64 `json:"opening_qty"`
	ReceivedQty  float64 `json:"received_qty"`
	IssuedQty    float64 `json:"issued_qty"`
	ClosingQty   float64 `json:"closing_qty"`
}

type lotReportFilters struct {
	Q                string
	LotNo            string
	EventType        string
	RefType          string
	ItemID           *int64
	LocationID       *int64
	ValidityFrom     *time.Time
	ValidityTo       *time.Time
	IncludeTransfers bool
	ExcludeNoTx      bool
	InventoryQty     string
}

func registerLotReportRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/lot-reports", func(lr chi.Router) {
		lr.Get("/book", listLotBookReport(pool))
		lr.Get("/book/export", exportLotBookReport(pool))
	})
}

func parseLotReportFilters(r *http.Request) lotReportFilters {
	p := httputil.ParseListParams(r, "", nil)
	includeTransfersRaw := strings.TrimSpace(r.URL.Query().Get("include_transfers"))
	f := lotReportFilters{
		Q:                p.Q,
		LotNo:            strings.TrimSpace(r.URL.Query().Get("lot_no")),
		EventType:        strings.TrimSpace(r.URL.Query().Get("event_type")),
		RefType:          strings.TrimSpace(r.URL.Query().Get("ref_type")),
		InventoryQty:     strings.TrimSpace(r.URL.Query().Get("inventory_qty")),
		IncludeTransfers: includeTransfersRaw == "1" || strings.EqualFold(includeTransfersRaw, "true"),
		ExcludeNoTx:      strings.TrimSpace(r.URL.Query().Get("exclude_no_tx")) == "1" || strings.EqualFold(r.URL.Query().Get("exclude_no_tx"), "true"),
	}
	if id, ok := optionalInt64Query(r, "item_id"); ok {
		f.ItemID = id
	}
	if id, ok := optionalInt64Query(r, "location_id"); ok {
		f.LocationID = id
	}
	if fromStr := strings.TrimSpace(r.URL.Query().Get("validity_from")); fromStr != "" {
		if from, err := parseDate(fromStr); err == nil {
			f.ValidityFrom = &from
		}
	}
	if toStr := strings.TrimSpace(r.URL.Query().Get("validity_to")); toStr != "" {
		if to, err := parseDate(toStr); err == nil {
			f.ValidityTo = &to
		}
	}
	return f
}

func lotSlipTypeLabel(eventType string) string {
	switch eventType {
	case "received":
		return "Received"
	case "returned":
		return "Returned"
	case "sold":
		return "Sold"
	case "voided":
		return "Voided"
	case "consumed":
		return "Consumed"
	case "produced":
		return "Produced"
	case "transferred":
		return "Location transfer"
	case "adjusted":
		return "Adjusted"
	default:
		if eventType == "" {
			return "—"
		}
		return strings.ReplaceAll(eventType, "_", " ")
	}
}

func appendLotBatchFilters(where string, args []any, argN int, f lotReportFilters, prefix string) (string, []any, int) {
	if f.Q != "" {
		where += fmt.Sprintf(" and (%s.lot_no ilike $%d or i.item_code ilike $%d or i.item_name ilike $%d)", prefix, argN, argN, argN)
		args = append(args, "%"+f.Q+"%")
		argN++
	}
	if f.LotNo != "" {
		where += fmt.Sprintf(" and %s.lot_no ilike $%d", prefix, argN)
		args = append(args, "%"+f.LotNo+"%")
		argN++
	}
	if f.ItemID != nil {
		where += fmt.Sprintf(" and %s.item_id = $%d", prefix, argN)
		args = append(args, *f.ItemID)
		argN++
	}
	if f.LocationID != nil {
		where += fmt.Sprintf(" and %s.location_id = $%d", prefix, argN)
		args = append(args, *f.LocationID)
		argN++
	}
	if f.ValidityFrom != nil {
		where += fmt.Sprintf(" and %s.expiry_date >= $%d::date", prefix, argN)
		args = append(args, *f.ValidityFrom)
		argN++
	}
	if f.ValidityTo != nil {
		where += fmt.Sprintf(" and %s.expiry_date <= $%d::date", prefix, argN)
		args = append(args, *f.ValidityTo)
		argN++
	}
	return where, args, argN
}

func listLotBookReport(pool *pgxpool.Pool) http.HandlerFunc {
	allowedDetail := map[string]string{
		"created_at": "created_at", "lot_no": "lot_no", "item_code": "item_code", "inventory_qty": "inventory_qty",
	}
	allowedSummary := map[string]string{
		"lot_no": "lot_no", "item_code": "item_code", "closing_qty": "closing_qty",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, ok := requireDateRange(w, r)
		if !ok {
			return
		}
		view := strings.TrimSpace(r.URL.Query().Get("view"))
		if view == "" {
			view = "general"
		}
		f := parseLotReportFilters(r)

		if view == "summary" {
			p := httputil.ParseListParams(r, "lot_no", allowedSummary)
			offset := httputil.Offset(p)
			base, args := lotBookSummarySQL(tu.TenantID, *dateFrom, *dateTo, f)
			countQ := fmt.Sprintf("select count(*) from (%s) sub", base)
			var total int64
			if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to count report.", "ERR_INTERNAL")
				return
			}
			sortCol := allowedSummary[p.Sort]
			if sortCol == "" {
				sortCol = "lot_no"
			}
			args = append(args, p.PageSize, offset)
			q := fmt.Sprintf("select * from (%s) sub order by %s %s limit $%d offset $%d", base, sortCol, reports.OrderSQL(p.Order), len(args)-1, len(args))
			rows, err := pool.Query(r.Context(), q, args...)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load report.", "ERR_INTERNAL")
				return
			}
			defer rows.Close()
			var out []lotBookSummaryRow
			for rows.Next() {
				var row lotBookSummaryRow
				if err := rows.Scan(&row.LotNo, &row.ItemCode, &row.ItemName, &row.LocationName, &row.OpeningQty, &row.ReceivedQty, &row.IssuedQty, &row.ClosingQty); err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to read report.", "ERR_INTERNAL")
					return
				}
				out = append(out, row)
			}
			if out == nil {
				out = []lotBookSummaryRow{}
			}
			response.OKList(w, out, p.Page, p.PageSize, total)
			return
		}

		p := httputil.ParseListParams(r, "created_at", allowedDetail)
		if p.Order == "" {
			p.Order = "desc"
		}
		offset := httputil.Offset(p)
		base, args := lotBookDetailSQL(tu.TenantID, *dateFrom, *dateTo, f)
		countQ := fmt.Sprintf("select count(*) from (%s) sub", base)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count report.", "ERR_INTERNAL")
			return
		}
		sortCol := allowedDetail[p.Sort]
		if sortCol == "" {
			sortCol = "created_at"
		}
		args = append(args, p.PageSize, offset)
		q := fmt.Sprintf("select * from (%s) sub order by %s %s limit $%d offset $%d", base, sortCol, reports.OrderSQL(p.Order), len(args)-1, len(args))
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load report.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []lotBookDetailRow
		for rows.Next() {
			row, err := scanLotBookDetail(rows)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read report.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []lotBookDetailRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func scanLotBookDetail(rows serialBookDetailScanner) (lotBookDetailRow, error) {
	var row lotBookDetailRow
	var at time.Time
	var expiry *time.Time
	var partner string
	err := rows.Scan(
		&row.ID, &at, &row.LotNo, &row.ItemCode, &row.ItemName, &row.LocationName,
		&expiry, &row.EventType, &row.OpeningQty, &row.IncreaseQty, &row.ReleaseQty,
		&row.InventoryQty, &row.QtyDelta, &row.RefType, &row.RefID, &row.Notes, &partner,
	)
	if err != nil {
		return row, err
	}
	row.CreatedAt = at.Format(time.RFC3339)
	row.PartnerName = strings.TrimSpace(partner)
	row.SlipType = lotSlipTypeLabel(row.EventType)
	if expiry != nil {
		s := expiry.Format("2006-01-02")
		row.TermsOfValidity = &s
	}
	return row, nil
}

func lotBookDetailSQL(tenantID int64, dateFrom, dateTo time.Time, f lotReportFilters) (string, []any) {
	where := "e.tenant_id = $1 and i.track_lot = true"
	args := []any{tenantID, dateFrom.Format("2006-01-02") + " 00:00:00+00", dateTo.Format("2006-01-02")}
	argN := 4
	where += " and e.created_at >= $2::timestamptz and e.created_at < ($3::date + interval '1 day')"
	where, args, argN = appendLotBatchFilters(where, args, argN, f, "lb")
	if f.EventType != "" {
		where += fmt.Sprintf(" and e.event_type = $%d", argN)
		args = append(args, f.EventType)
		argN++
	}
	if f.RefType != "" {
		where += fmt.Sprintf(" and e.ref_type = $%d", argN)
		args = append(args, f.RefType)
		argN++
	}
	if !f.IncludeTransfers {
		where += fmt.Sprintf(" and e.event_type not in (%s)", lotTransferEventTypes)
	}
	_ = argN
	q := fmt.Sprintf(`
		with opening as (
		  select e.lot_batch_id, coalesce(sum(%s), 0)::float8 as open_qty
		  from public.inv_lot_events e
		  join public.inv_lot_batches lb on lb.id = e.lot_batch_id
		  join public.inv_items i on i.id = lb.item_id
		  where e.tenant_id = $1 and i.track_lot = true and e.created_at < $2::timestamptz
		  group by e.lot_batch_id
		),
		period as (
		  select e.id, e.created_at, e.lot_batch_id, e.event_type, e.ref_type, e.ref_id, e.notes,
		    e.from_location_id, e.to_location_id, e.tenant_id,
		    (%s)::float8 as qty_delta
		  from public.inv_lot_events e
		  join public.inv_lot_batches lb on lb.id = e.lot_batch_id
		  join public.inv_items i on i.id = lb.item_id
		  where %s
		)
		select p.id, p.created_at, lb.lot_no, i.item_code, i.item_name,
		  coalesce(tl.location_name, fl.location_name, bl.location_name, ''),
		  lb.expiry_date,
		  p.event_type,
		  coalesce(o.open_qty, 0)::float8 as opening_qty,
		  (case when p.qty_delta > 0 then p.qty_delta else 0 end)::float8 as increase_qty,
		  (case when p.qty_delta < 0 then -p.qty_delta else 0 end)::float8 as release_qty,
		  (coalesce(o.open_qty, 0) + sum(p.qty_delta) over (
		    partition by p.lot_batch_id order by p.created_at, p.id
		    rows between unbounded preceding and current row
		  ))::float8 as inventory_qty,
		  p.qty_delta,
		  p.ref_type, p.ref_id, p.notes,
		  (%s) as partner_name
		from period p
		join public.inv_lot_batches lb on lb.id = p.lot_batch_id
		join public.inv_items i on i.id = lb.item_id
		left join opening o on o.lot_batch_id = p.lot_batch_id
		left join public.inv_locations fl on fl.id = p.from_location_id
		left join public.inv_locations tl on tl.id = p.to_location_id
		left join public.inv_locations bl on bl.id = lb.location_id
	`, lotEventQtyDelta, lotEventQtyDelta, where, lotBookPartnerNameSQL)
	return q, args
}

func lotBookSummarySQL(tenantID int64, dateFrom, dateTo time.Time, f lotReportFilters) (string, []any) {
	where := "lb.tenant_id = $1 and i.track_lot = true"
	args := []any{tenantID, dateFrom.Format("2006-01-02") + " 00:00:00+00", dateTo.Format("2006-01-02")}
	argN := 4
	where, args, argN = appendLotBatchFilters(where, args, argN, f, "lb")
	_ = argN
	closingExpr := "(coalesce(opening.open_qty, 0) + coalesce(period.recv_qty, 0) - coalesce(period.issued_qty, 0))"
	having := ""
	if f.ExcludeNoTx {
		having = `
		  and (coalesce(opening.open_qty, 0) <> 0
		    or coalesce(period.recv_qty, 0) <> 0
		    or coalesce(period.issued_qty, 0) <> 0)`
	}
	having = appendInventoryQtyFilter(having, closingExpr, f.InventoryQty)
	q := fmt.Sprintf(`
		select lb.lot_no, i.item_code, i.item_name,
		  coalesce(l.location_name, ''),
		  coalesce(opening.open_qty, 0)::float8,
		  coalesce(period.recv_qty, 0)::float8,
		  coalesce(period.issued_qty, 0)::float8,
		  %s::float8 as closing_qty
		from public.inv_lot_batches lb
		join public.inv_items i on i.id = lb.item_id
		left join public.inv_locations l on l.id = lb.location_id
		left join lateral (
		  select sum(%s)::float8 as open_qty
		  from public.inv_lot_events e
		  where e.lot_batch_id = lb.id and e.created_at < $2::timestamptz
		) opening on true
		left join lateral (
		  select
		    sum(case when e.event_type in ('received', 'returned', 'produced') then e.qty else 0 end)::float8 as recv_qty,
		    sum(case when e.event_type in ('sold', 'voided', 'consumed') then e.qty else 0 end)::float8 as issued_qty
		  from public.inv_lot_events e
		  where e.lot_batch_id = lb.id
		    and e.created_at >= $2::timestamptz
		    and e.created_at < ($3::date + interval '1 day')
		) period on true
		where %s
		%s`, closingExpr, lotEventQtyDelta, where, having)
	return q, args
}

func exportLotBookReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, ok := requireDateRange(w, r)
		if !ok {
			return
		}
		view := strings.TrimSpace(r.URL.Query().Get("view"))
		if view == "" {
			view = "general"
		}
		f := parseLotReportFilters(r)
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="lot-inv-book.csv"`)
		cw := csv.NewWriter(w)
		if view == "summary" {
			base, args := lotBookSummarySQL(tu.TenantID, *dateFrom, *dateTo, f)
			q := fmt.Sprintf("select * from (%s) sub order by lot_no asc limit %d", base, reports.ExportMaxRows)
			rows, err := pool.Query(r.Context(), q, args...)
			if err != nil {
				return
			}
			defer rows.Close()
			_ = cw.Write([]string{"Lot No.", "Item Code", "Item Name", "Location", "Opening", "Received", "Issued", "Closing"})
			for rows.Next() {
				var row lotBookSummaryRow
				if err := rows.Scan(&row.LotNo, &row.ItemCode, &row.ItemName, &row.LocationName, &row.OpeningQty, &row.ReceivedQty, &row.IssuedQty, &row.ClosingQty); err != nil {
					return
				}
				_ = cw.Write([]string{
					row.LotNo, row.ItemCode, row.ItemName, row.LocationName,
					fmt.Sprintf("%.4f", row.OpeningQty), fmt.Sprintf("%.4f", row.ReceivedQty),
					fmt.Sprintf("%.4f", row.IssuedQty), fmt.Sprintf("%.4f", row.ClosingQty),
				})
			}
		} else {
			base, args := lotBookDetailSQL(tu.TenantID, *dateFrom, *dateTo, f)
			q := fmt.Sprintf("select * from (%s) sub order by created_at desc limit %d", base, reports.ExportMaxRows)
			rows, err := pool.Query(r.Context(), q, args...)
			if err != nil {
				return
			}
			defer rows.Close()
			_ = cw.Write([]string{"Date", "Lot No.", "Item Code", "Item Name", "Location", "Terms of Validity", "Slip Type", "Customer/Vendor", "Increase", "Release Qty", "Inventory Qty", "Ref Type", "Ref ID", "Notes"})
			for rows.Next() {
				row, err := scanLotBookDetail(rows)
				if err != nil {
					return
				}
				terms := ""
				if row.TermsOfValidity != nil {
					terms = *row.TermsOfValidity
				}
				ref := ""
				if row.RefType != nil {
					ref = *row.RefType
				}
				refID := ""
				if row.RefID != nil {
					refID = fmt.Sprintf("%d", *row.RefID)
				}
				notes := ""
				if row.Notes != nil {
					notes = *row.Notes
				}
				_ = cw.Write([]string{
					row.CreatedAt, row.LotNo, row.ItemCode, row.ItemName, row.LocationName, terms,
					row.SlipType, row.PartnerName,
					fmt.Sprintf("%.4f", row.IncreaseQty), fmt.Sprintf("%.4f", row.ReleaseQty), fmt.Sprintf("%.4f", row.InventoryQty),
					ref, refID, notes,
				})
			}
		}
		cw.Flush()
	}
}
