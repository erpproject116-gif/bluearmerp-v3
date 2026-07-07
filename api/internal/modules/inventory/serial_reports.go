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

const serialEventQtyDelta = `case e.event_type
  when 'received' then 1
  when 'returned' then 1
  when 'sold' then -1
  when 'voided' then -1
  else 0
end`

type serialStatusDetailRow struct {
	ID            int64   `json:"id"`
	SerialNo      string  `json:"serial_no"`
	ItemID        int64   `json:"item_id"`
	ItemCode      string  `json:"item_code"`
	ItemName      string  `json:"item_name"`
	Status        string  `json:"status"`
	LocationID    *int64  `json:"location_id,omitempty"`
	LocationName  string  `json:"location_name,omitempty"`
	WarrantyStart *string `json:"warranty_start,omitempty"`
	WarrantyEnd   *string `json:"warranty_end,omitempty"`
	LastEventType *string `json:"last_event_type,omitempty"`
	LastEventAt   *string `json:"last_event_at,omitempty"`
	EventCount    int     `json:"event_count"`
}

type serialStatusSummaryRow struct {
	ItemCode     string `json:"item_code"`
	ItemName     string `json:"item_name"`
	Status       string `json:"status"`
	LocationName string `json:"location_name"`
	UnitCount    int64  `json:"unit_count"`
}

type serialBookDetailRow struct {
	ID           int64   `json:"id"`
	CreatedAt    string  `json:"created_at"`
	SerialNo     string  `json:"serial_no"`
	ItemCode     string  `json:"item_code"`
	ItemName     string  `json:"item_name"`
	LocationName string  `json:"location_name"`
	EventType    string  `json:"event_type"`
	QtyDelta     float64 `json:"qty_delta"`
	RefType      *string `json:"ref_type,omitempty"`
	Notes        *string `json:"notes,omitempty"`
}

type serialBookSummaryRow struct {
	SerialNo     string  `json:"serial_no"`
	ItemCode     string  `json:"item_code"`
	ItemName     string  `json:"item_name"`
	OpeningQty   float64 `json:"opening_qty"`
	ReceivedQty  float64 `json:"received_qty"`
	IssuedQty    float64 `json:"issued_qty"`
	ClosingQty   float64 `json:"closing_qty"`
}

type serialBalanceRow struct {
	SerialNo     string  `json:"serial_no"`
	ItemID       int64   `json:"item_id"`
	ItemCode     string  `json:"item_code"`
	ItemName     string  `json:"item_name"`
	LocationID   *int64  `json:"location_id,omitempty"`
	LocationName string  `json:"location_name,omitempty"`
	QtyOnHand    float64 `json:"qty_on_hand"`
	Status       string  `json:"status"`
}

type serialReconciliationRow struct {
	SerialNo         *string `json:"serial_no,omitempty"`
	ItemID           int64   `json:"item_id"`
	ItemCode         string  `json:"item_code"`
	ItemName         string  `json:"item_name"`
	LocationID       *int64  `json:"location_id,omitempty"`
	LocationName     string  `json:"location_name,omitempty"`
	ItemQtyOnHand    float64 `json:"item_qty_on_hand"`
	SerialUnitCount float64 `json:"serial_unit_count"`
	Variance         float64 `json:"variance"`
}

type serialReportFilters struct {
	Q              string
	SerialNo       string
	Status         string
	EventType      string
	ItemID         *int64
	LocationID     *int64
	ValidityFrom   *time.Time
	ValidityTo     *time.Time
	IncludeVoid    bool
	InventoryQty   string
}

func registerSerialReportRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/serial-reports", func(sr chi.Router) {
		sr.Get("/status", listSerialStatusReport(pool))
		sr.Get("/status/export", exportSerialStatusReport(pool))
		sr.Get("/book", listSerialBookReport(pool))
		sr.Get("/book/export", exportSerialBookReport(pool))
		sr.Get("/balance", listSerialBalanceReport(pool))
		sr.Get("/balance/export", exportSerialBalanceReport(pool))
		sr.Get("/reconciliation", listSerialReconciliationReport(pool))
		sr.Get("/reconciliation/export", exportSerialReconciliationReport(pool))
	})
}

func parseSerialReportFilters(r *http.Request) serialReportFilters {
	p := httputil.ParseListParams(r, "", nil)
	f := serialReportFilters{
		Q:            p.Q,
		SerialNo:     strings.TrimSpace(r.URL.Query().Get("serial_no")),
		Status:       strings.TrimSpace(r.URL.Query().Get("status")),
		EventType:    strings.TrimSpace(r.URL.Query().Get("event_type")),
		InventoryQty: strings.TrimSpace(r.URL.Query().Get("inventory_qty")),
		IncludeVoid:  strings.TrimSpace(r.URL.Query().Get("include_void")) == "1" || strings.EqualFold(r.URL.Query().Get("include_void"), "true"),
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

func appendSerialUnitFilters(where string, args []any, argN int, f serialReportFilters, prefix string) (string, []any, int) {
	if f.Q != "" {
		where += fmt.Sprintf(" and (%s.serial_no ilike $%d or i.item_code ilike $%d or i.item_name ilike $%d)", prefix, argN, argN, argN)
		args = append(args, "%"+f.Q+"%")
		argN++
	}
	if f.SerialNo != "" {
		where += fmt.Sprintf(" and %s.serial_no ilike $%d", prefix, argN)
		args = append(args, "%"+f.SerialNo+"%")
		argN++
	}
	if f.Status != "" {
		where += fmt.Sprintf(" and %s.status = $%d", prefix, argN)
		args = append(args, f.Status)
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
		where += fmt.Sprintf(" and %s.warranty_end >= $%d::date", prefix, argN)
		args = append(args, *f.ValidityFrom)
		argN++
	}
	if f.ValidityTo != nil {
		where += fmt.Sprintf(" and %s.warranty_end <= $%d::date", prefix, argN)
		args = append(args, *f.ValidityTo)
		argN++
	}
	if !f.IncludeVoid {
		where += fmt.Sprintf(" and %s.status <> 'void'", prefix)
	}
	return where, args, argN
}

func appendInventoryQtyFilter(where string, qtyCol string, filter string) string {
	switch filter {
	case "1":
		return where + fmt.Sprintf(" and %s = 1", qtyCol)
	case "0":
		return where + fmt.Sprintf(" and %s = 0", qtyCol)
	case "others":
		return where + fmt.Sprintf(" and %s not in (0, 1)", qtyCol)
	default:
		return where
	}
}

func requireDateRange(w http.ResponseWriter, r *http.Request) (*time.Time, *time.Time, bool) {
	fromStr := strings.TrimSpace(r.URL.Query().Get("date_from"))
	toStr := strings.TrimSpace(r.URL.Query().Get("date_to"))
	errs := map[string]string{}
	if fromStr == "" {
		errs["date_from"] = "Start date is required."
	}
	if toStr == "" {
		errs["date_to"] = "End date is required."
	}
	if len(errs) > 0 {
		response.Validation(w, errs)
		return nil, nil, false
	}
	from, err := parseDate(fromStr)
	if err != nil {
		response.Validation(w, map[string]string{"date_from": "Invalid date. Use YYYY-MM-DD."})
		return nil, nil, false
	}
	to, err := parseDate(toStr)
	if err != nil {
		response.Validation(w, map[string]string{"date_to": "Invalid date. Use YYYY-MM-DD."})
		return nil, nil, false
	}
	if from.After(to) {
		response.Validation(w, map[string]string{"date_to": "End date must be on or after start date."})
		return nil, nil, false
	}
	return &from, &to, true
}

func parseAsOfDate(r *http.Request) (time.Time, map[string]string) {
	s := strings.TrimSpace(r.URL.Query().Get("as_of"))
	if s == "" {
		s = strings.TrimSpace(r.URL.Query().Get("date"))
	}
	if s == "" {
		now := time.Now().UTC()
		return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC), nil
	}
	t, err := parseDate(s)
	if err != nil {
		return time.Time{}, map[string]string{"as_of": "Invalid date. Use YYYY-MM-DD."}
	}
	return t, nil
}

func listSerialStatusReport(pool *pgxpool.Pool) http.HandlerFunc {
	allowedDetail := map[string]string{
		"serial_no": "su.serial_no", "item_code": "i.item_code", "status": "su.status", "last_event_at": "le.created_at",
	}
	allowedSummary := map[string]string{
		"item_code": "item_code", "status": "status", "unit_count": "unit_count",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		view := strings.TrimSpace(r.URL.Query().Get("view"))
		if view == "" {
			view = "details"
		}
		f := parseSerialReportFilters(r)
		dateFrom, dateTo, _ := reports.ParseOptionalDateRange(r)

		if view == "summary" {
			p := httputil.ParseListParams(r, "item_code", allowedSummary)
			offset := httputil.Offset(p)
			where := "su.tenant_id = $1 and i.track_serial = true"
			args := []any{tu.TenantID}
			argN := 2
			var err error
			where, args, argN, _, _, err = appendSerialStatusFilters(where, args, argN, f, dateFrom, dateTo)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to build filters.", "ERR_INTERNAL")
				return
			}
			base := fmt.Sprintf(`
				select i.item_code, i.item_name, su.status, coalesce(l.location_name, '') as location_name,
				  count(*)::bigint as unit_count
				from public.inv_serial_units su
				join public.inv_items i on i.id = su.item_id
				left join public.inv_locations l on l.id = su.location_id
				where %s
				group by i.item_code, i.item_name, su.status, l.location_name`, where)
			countQ := fmt.Sprintf("select count(*) from (%s) sub", base)
			var total int64
			if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to count report.", "ERR_INTERNAL")
				return
			}
			sortCol := allowedSummary[p.Sort]
			if sortCol == "" {
				sortCol = "item_code"
			}
			args = append(args, p.PageSize, offset)
			q := fmt.Sprintf("select * from (%s) sub order by %s %s limit $%d offset $%d", base, sortCol, reports.OrderSQL(p.Order), argN, argN+1)
			rows, err := pool.Query(r.Context(), q, args...)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load report.", "ERR_INTERNAL")
				return
			}
			defer rows.Close()
			var out []serialStatusSummaryRow
			for rows.Next() {
				var row serialStatusSummaryRow
				if err := rows.Scan(&row.ItemCode, &row.ItemName, &row.Status, &row.LocationName, &row.UnitCount); err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to read report.", "ERR_INTERNAL")
					return
				}
				out = append(out, row)
			}
			if out == nil {
				out = []serialStatusSummaryRow{}
			}
			response.OKList(w, out, p.Page, p.PageSize, total)
			return
		}

		p := httputil.ParseListParams(r, "serial_no", allowedDetail)
		offset := httputil.Offset(p)
		where := "su.tenant_id = $1 and i.track_serial = true"
		args := []any{tu.TenantID}
		argN := 2
		var err error
		var eventDateFromN, eventDateToN int
		where, args, argN, eventDateFromN, eventDateToN, err = appendSerialStatusFilters(where, args, argN, f, dateFrom, dateTo)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to build filters.", "ERR_INTERNAL")
			return
		}
		if f.EventType != "" {
			where += fmt.Sprintf(" and le.event_type = $%d", argN)
			args = append(args, f.EventType)
			argN++
		}
		eventCountExpr := "(select count(*)::int from public.inv_serial_events e where e.serial_unit_id = su.id)"
		if eventDateFromN > 0 && eventDateToN > 0 {
			eventCountExpr = fmt.Sprintf(`(select count(*)::int from public.inv_serial_events e
			  where e.serial_unit_id = su.id
			    and e.created_at >= $%d::timestamptz
			    and e.created_at < ($%d::date + interval '1 day'))`, eventDateFromN, eventDateToN)
		}
		sortCol := allowedDetail[p.Sort]
		if sortCol == "" {
			sortCol = "su.serial_no"
		}
		limitN := argN
		offsetN := argN + 1
		args = append(args, p.PageSize, offset)
		q := fmt.Sprintf(`
			select su.id, su.serial_no, su.item_id, i.item_code, i.item_name, su.status,
			  su.location_id, coalesce(l.location_name, ''),
			  su.warranty_start, su.warranty_end,
			  le.event_type, le.created_at,
			  %s,
			  count(*) over()
			from public.inv_serial_units su
			join public.inv_items i on i.id = su.item_id
			left join public.inv_locations l on l.id = su.location_id
			left join lateral (
			  select e.event_type, e.created_at
			  from public.inv_serial_events e
			  where e.serial_unit_id = su.id
			  order by e.created_at desc
			  limit 1
			) le on true
			where %s
			order by %s %s
			limit $%d offset $%d`,
			eventCountExpr, where, sortCol, reports.OrderSQL(p.Order), limitN, offsetN)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load report.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []serialStatusDetailRow
		var total int64
		for rows.Next() {
			var row serialStatusDetailRow
			var wStart, wEnd *time.Time
			var lastType *string
			var lastAt *time.Time
			if err := rows.Scan(&row.ID, &row.SerialNo, &row.ItemID, &row.ItemCode, &row.ItemName, &row.Status,
				&row.LocationID, &row.LocationName, &wStart, &wEnd, &lastType, &lastAt, &row.EventCount, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read report.", "ERR_INTERNAL")
				return
			}
			row.WarrantyStart = formatDatePtr(wStart)
			row.WarrantyEnd = formatDatePtr(wEnd)
			if lastType != nil {
				row.LastEventType = lastType
			}
			if lastAt != nil {
				s := lastAt.Format(time.RFC3339)
				row.LastEventAt = &s
			}
			out = append(out, row)
		}
		if out == nil {
			out = []serialStatusDetailRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func appendSerialStatusFilters(where string, args []any, argN int, f serialReportFilters, dateFrom, dateTo *time.Time) (string, []any, int, int, int, error) {
	where, args, argN = appendSerialUnitFilters(where, args, argN, f, "su")
	dateFromN, dateToN := 0, 0
	if dateFrom != nil && dateTo != nil {
		where += fmt.Sprintf(` and exists (
			select 1 from public.inv_serial_events e
			where e.serial_unit_id = su.id
			  and e.created_at >= $%d::timestamptz
			  and e.created_at < ($%d::date + interval '1 day')
		)`, argN, argN+1)
		args = append(args, dateFrom.Format("2006-01-02")+" 00:00:00+00", dateTo.Format("2006-01-02"))
		dateFromN, dateToN = argN, argN+1
		argN += 2
	}
	return where, args, argN, dateFromN, dateToN, nil
}

func exportSerialStatusReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		view := strings.TrimSpace(r.URL.Query().Get("view"))
		if view == "" {
			view = "details"
		}
		f := parseSerialReportFilters(r)
		dateFrom, dateTo, _ := reports.ParseOptionalDateRange(r)
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="serial-status.csv"`)
		cw := csv.NewWriter(w)
		if view == "summary" {
			where := "su.tenant_id = $1 and i.track_serial = true"
			args := []any{tu.TenantID}
			var err error
			where, args, _, _, _, err = appendSerialStatusFilters(where, args, 2, f, dateFrom, dateTo)
			if err != nil {
				return
			}
			base := fmt.Sprintf(`
				select i.item_code, i.item_name, su.status, coalesce(l.location_name, ''),
				  count(*)::bigint
				from public.inv_serial_units su
				join public.inv_items i on i.id = su.item_id
				left join public.inv_locations l on l.id = su.location_id
				where %s
				group by i.item_code, i.item_name, su.status, l.location_name`, where)
			q := fmt.Sprintf("select * from (%s) sub order by item_code asc limit %d", base, reports.ExportMaxRows)
			rows, err := pool.Query(r.Context(), q, args...)
			if err != nil {
				return
			}
			defer rows.Close()
			_ = cw.Write([]string{"Item Code", "Item Name", "Status", "Location", "Unit Count"})
			for rows.Next() {
				var row serialStatusSummaryRow
				if err := rows.Scan(&row.ItemCode, &row.ItemName, &row.Status, &row.LocationName, &row.UnitCount); err != nil {
					return
				}
				_ = cw.Write([]string{row.ItemCode, row.ItemName, row.Status, row.LocationName, fmt.Sprintf("%d", row.UnitCount)})
			}
		} else {
			where := "su.tenant_id = $1 and i.track_serial = true"
			args := []any{tu.TenantID}
			argN := 2
			var err error
			where, args, argN, _, _, err = appendSerialStatusFilters(where, args, argN, f, dateFrom, dateTo)
			if err != nil {
				return
			}
			if f.EventType != "" {
				where += fmt.Sprintf(" and le.event_type = $%d", argN)
				args = append(args, f.EventType)
			}
			q := fmt.Sprintf(`
				select su.serial_no, i.item_code, i.item_name, su.status, coalesce(l.location_name, ''),
				  su.warranty_start, su.warranty_end, le.event_type, le.created_at
				from public.inv_serial_units su
				join public.inv_items i on i.id = su.item_id
				left join public.inv_locations l on l.id = su.location_id
				left join lateral (
				  select e.event_type, e.created_at
				  from public.inv_serial_events e
				  where e.serial_unit_id = su.id
				  order by e.created_at desc
				  limit 1
				) le on true
				where %s
				order by su.serial_no asc
				limit %d`, where, reports.ExportMaxRows)
			rows, err := pool.Query(r.Context(), q, args...)
			if err != nil {
				return
			}
			defer rows.Close()
			_ = cw.Write([]string{"Serial No.", "Item Code", "Item Name", "Status", "Location", "Warranty Start", "Warranty End", "Last Event", "Last Event At"})
			for rows.Next() {
				var serialNo, itemCode, itemName, status, loc string
				var wStart, wEnd *time.Time
				var lastType *string
				var lastAt *time.Time
				if err := rows.Scan(&serialNo, &itemCode, &itemName, &status, &loc, &wStart, &wEnd, &lastType, &lastAt); err != nil {
					return
				}
				lastEvent := ""
				if lastType != nil {
					lastEvent = *lastType
				}
				lastAtStr := ""
				if lastAt != nil {
					lastAtStr = lastAt.Format(time.RFC3339)
				}
				_ = cw.Write([]string{
					serialNo, itemCode, itemName, status, loc,
					formatDateString(wStart), formatDateString(wEnd), lastEvent, lastAtStr,
				})
			}
		}
		cw.Flush()
	}
}

func formatDateString(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.Format("2006-01-02")
}

func listSerialBookReport(pool *pgxpool.Pool) http.HandlerFunc {
	allowedDetail := map[string]string{
		"created_at": "e.created_at", "serial_no": "su.serial_no", "item_code": "i.item_code",
	}
	allowedSummary := map[string]string{
		"serial_no": "serial_no", "item_code": "item_code", "closing_qty": "closing_qty",
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
		f := parseSerialReportFilters(r)

		if view == "summary" {
			p := httputil.ParseListParams(r, "serial_no", allowedSummary)
			offset := httputil.Offset(p)
			base, args := serialBookSummarySQL(tu.TenantID, *dateFrom, *dateTo, f)
			countQ := fmt.Sprintf("select count(*) from (%s) sub", base)
			var total int64
			if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to count report.", "ERR_INTERNAL")
				return
			}
			sortCol := allowedSummary[p.Sort]
			if sortCol == "" {
				sortCol = "serial_no"
			}
			args = append(args, p.PageSize, offset)
			q := fmt.Sprintf("select * from (%s) sub order by %s %s limit $%d offset $%d", base, sortCol, reports.OrderSQL(p.Order), len(args)-1, len(args))
			rows, err := pool.Query(r.Context(), q, args...)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load report.", "ERR_INTERNAL")
				return
			}
			defer rows.Close()
			var out []serialBookSummaryRow
			for rows.Next() {
				var row serialBookSummaryRow
				if err := rows.Scan(&row.SerialNo, &row.ItemCode, &row.ItemName, &row.OpeningQty, &row.ReceivedQty, &row.IssuedQty, &row.ClosingQty); err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to read report.", "ERR_INTERNAL")
					return
				}
				out = append(out, row)
			}
			if out == nil {
				out = []serialBookSummaryRow{}
			}
			response.OKList(w, out, p.Page, p.PageSize, total)
			return
		}

		p := httputil.ParseListParams(r, "created_at", allowedDetail)
		if p.Order == "" {
			p.Order = "desc"
		}
		offset := httputil.Offset(p)
		base, args := serialBookDetailSQL(tu.TenantID, *dateFrom, *dateTo, f)
		countQ := fmt.Sprintf("select count(*) from (%s) sub", base)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count report.", "ERR_INTERNAL")
			return
		}
		sortCol := allowedDetail[p.Sort]
		if sortCol == "" {
			sortCol = "e.created_at"
		}
		args = append(args, p.PageSize, offset)
		q := fmt.Sprintf("select * from (%s) sub order by %s %s limit $%d offset $%d", base, sortCol, reports.OrderSQL(p.Order), len(args)-1, len(args))
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load report.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []serialBookDetailRow
		for rows.Next() {
			var row serialBookDetailRow
			var at time.Time
			if err := rows.Scan(&row.ID, &at, &row.SerialNo, &row.ItemCode, &row.ItemName, &row.LocationName,
				&row.EventType, &row.QtyDelta, &row.RefType, &row.Notes); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read report.", "ERR_INTERNAL")
				return
			}
			row.CreatedAt = at.Format(time.RFC3339)
			out = append(out, row)
		}
		if out == nil {
			out = []serialBookDetailRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func serialBookDetailSQL(tenantID int64, dateFrom, dateTo time.Time, f serialReportFilters) (string, []any) {
	where := "e.tenant_id = $1 and i.track_serial = true"
	args := []any{tenantID, dateFrom.Format("2006-01-02") + " 00:00:00+00", dateTo.Format("2006-01-02")}
	argN := 4
	where += fmt.Sprintf(" and e.created_at >= $2::timestamptz and e.created_at < ($3::date + interval '1 day')")
	where, args, argN = appendSerialUnitFilters(where, args, argN, f, "su")
	if f.EventType != "" {
		where += fmt.Sprintf(" and e.event_type = $%d", argN)
		args = append(args, f.EventType)
	}
	q := fmt.Sprintf(`
		select e.id, e.created_at, su.serial_no, i.item_code, i.item_name,
		  coalesce(tl.location_name, fl.location_name, ''),
		  e.event_type,
		  (%s)::float8,
		  e.ref_type, e.notes
		from public.inv_serial_events e
		join public.inv_serial_units su on su.id = e.serial_unit_id
		join public.inv_items i on i.id = su.item_id
		left join public.inv_locations fl on fl.id = e.from_location_id
		left join public.inv_locations tl on tl.id = e.to_location_id
		where %s`, serialEventQtyDelta, where)
	return q, args
}

func serialBookSummarySQL(tenantID int64, dateFrom, dateTo time.Time, f serialReportFilters) (string, []any) {
	where := "su.tenant_id = $1 and i.track_serial = true"
	args := []any{tenantID, dateFrom.Format("2006-01-02") + " 00:00:00+00", dateTo.Format("2006-01-02")}
	argN := 4
	where, args, argN = appendSerialUnitFilters(where, args, argN, f, "su")
	q := fmt.Sprintf(`
		select su.serial_no, i.item_code, i.item_name,
		  coalesce(opening.open_qty, 0)::float8,
		  coalesce(period.recv_qty, 0)::float8,
		  coalesce(period.issued_qty, 0)::float8,
		  (coalesce(opening.open_qty, 0) + coalesce(period.recv_qty, 0) - coalesce(period.issued_qty, 0))::float8
		from public.inv_serial_units su
		join public.inv_items i on i.id = su.item_id
		left join lateral (
		  select sum(%s)::float8 as open_qty
		  from public.inv_serial_events e
		  where e.serial_unit_id = su.id and e.created_at < $2::timestamptz
		) opening on true
		left join lateral (
		  select
		    sum(case when e.event_type in ('received', 'returned') then 1 else 0 end)::float8 as recv_qty,
		    sum(case when e.event_type in ('sold', 'voided') then 1 else 0 end)::float8 as issued_qty
		  from public.inv_serial_events e
		  where e.serial_unit_id = su.id
		    and e.created_at >= $2::timestamptz
		    and e.created_at < ($3::date + interval '1 day')
		) period on true
		where %s
		  and (coalesce(opening.open_qty, 0) <> 0
		    or coalesce(period.recv_qty, 0) <> 0
		    or coalesce(period.issued_qty, 0) <> 0)`, serialEventQtyDelta, where)
	return q, args
}

func exportSerialBookReport(pool *pgxpool.Pool) http.HandlerFunc {
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
		f := parseSerialReportFilters(r)
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="serial-inv-book.csv"`)
		cw := csv.NewWriter(w)
		if view == "summary" {
			base, args := serialBookSummarySQL(tu.TenantID, *dateFrom, *dateTo, f)
			q := fmt.Sprintf("select * from (%s) sub order by serial_no asc limit %d", base, reports.ExportMaxRows)
			rows, err := pool.Query(r.Context(), q, args...)
			if err != nil {
				return
			}
			defer rows.Close()
			_ = cw.Write([]string{"Serial No.", "Item Code", "Item Name", "Opening", "Received", "Issued", "Closing"})
			for rows.Next() {
				var row serialBookSummaryRow
				if err := rows.Scan(&row.SerialNo, &row.ItemCode, &row.ItemName, &row.OpeningQty, &row.ReceivedQty, &row.IssuedQty, &row.ClosingQty); err != nil {
					return
				}
				_ = cw.Write([]string{
					row.SerialNo, row.ItemCode, row.ItemName,
					fmt.Sprintf("%.4f", row.OpeningQty), fmt.Sprintf("%.4f", row.ReceivedQty),
					fmt.Sprintf("%.4f", row.IssuedQty), fmt.Sprintf("%.4f", row.ClosingQty),
				})
			}
		} else {
			base, args := serialBookDetailSQL(tu.TenantID, *dateFrom, *dateTo, f)
			q := fmt.Sprintf("select * from (%s) sub order by created_at desc limit %d", base, reports.ExportMaxRows)
			rows, err := pool.Query(r.Context(), q, args...)
			if err != nil {
				return
			}
			defer rows.Close()
			_ = cw.Write([]string{"Date", "Serial No.", "Item Code", "Item Name", "Location", "Event", "Qty Delta", "Ref", "Notes"})
			for rows.Next() {
				var row serialBookDetailRow
				var at time.Time
				if err := rows.Scan(&row.ID, &at, &row.SerialNo, &row.ItemCode, &row.ItemName, &row.LocationName,
					&row.EventType, &row.QtyDelta, &row.RefType, &row.Notes); err != nil {
					return
				}
				ref := ""
				if row.RefType != nil {
					ref = *row.RefType
				}
				notes := ""
				if row.Notes != nil {
					notes = *row.Notes
				}
				_ = cw.Write([]string{
					at.Format(time.RFC3339), row.SerialNo, row.ItemCode, row.ItemName, row.LocationName,
					row.EventType, fmt.Sprintf("%.4f", row.QtyDelta), ref, notes,
				})
			}
		}
		cw.Flush()
	}
}

func listSerialBalanceReport(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"serial_no": "su.serial_no", "item_code": "i.item_code", "qty_on_hand": "bal.qty",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		asOf, errs := parseAsOfDate(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		view := strings.TrimSpace(r.URL.Query().Get("view"))
		if view == "" {
			view = "serial"
		}
		f := parseSerialReportFilters(r)
		p := httputil.ParseListParams(r, "serial_no", allowed)
		offset := httputil.Offset(p)
		base, args := serialBalanceSQL(tu.TenantID, asOf, f, view)
		countQ := fmt.Sprintf("select count(*) from (%s) sub", base)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count report.", "ERR_INTERNAL")
			return
		}
		sortCol := allowed[p.Sort]
		if sortCol == "" {
			sortCol = "su.serial_no"
		}
		args = append(args, p.PageSize, offset)
		q := fmt.Sprintf("select * from (%s) sub order by %s %s limit $%d offset $%d", base, sortCol, reports.OrderSQL(p.Order), len(args)-1, len(args))
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load report.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []serialBalanceRow
		for rows.Next() {
			var row serialBalanceRow
			if err := rows.Scan(&row.SerialNo, &row.ItemID, &row.ItemCode, &row.ItemName, &row.LocationID, &row.LocationName, &row.QtyOnHand, &row.Status); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read report.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []serialBalanceRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func serialBalanceSQL(tenantID int64, asOf time.Time, f serialReportFilters, view string) (string, []any) {
	where := "su.tenant_id = $1 and i.track_serial = true"
	args := []any{tenantID, asOf.Format("2006-01-02")}
	argN := 3
	where, args, argN = appendSerialUnitFilters(where, args, argN, f, "su")
	qtyExpr := fmt.Sprintf(`greatest(0, coalesce((
		  select sum(%s)::float8
		  from public.inv_serial_events e
		  where e.serial_unit_id = su.id and e.created_at < ($2::date + interval '1 day')
		), 0))`, serialEventQtyDelta)
	where = appendInventoryQtyFilter(where, qtyExpr, f.InventoryQty)
	if view == "by_location" {
		q := fmt.Sprintf(`
			select su.serial_no, su.item_id, i.item_code, i.item_name,
			  su.location_id, coalesce(l.location_name, ''),
			  %s as qty_on_hand, su.status
			from public.inv_serial_units su
			join public.inv_items i on i.id = su.item_id
			left join public.inv_locations l on l.id = su.location_id
			where %s`, qtyExpr, where)
		return q, args
	}
	q := fmt.Sprintf(`
		select su.serial_no, su.item_id, i.item_code, i.item_name,
		  su.location_id, coalesce(l.location_name, ''),
		  %s as qty_on_hand, su.status
		from public.inv_serial_units su
		join public.inv_items i on i.id = su.item_id
		left join public.inv_locations l on l.id = su.location_id
		where %s`, qtyExpr, where)
	return q, args
}

func exportSerialBalanceReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		asOf, errs := parseAsOfDate(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		view := strings.TrimSpace(r.URL.Query().Get("view"))
		if view == "" {
			view = "serial"
		}
		f := parseSerialReportFilters(r)
		base, args := serialBalanceSQL(tu.TenantID, asOf, f, view)
		q := fmt.Sprintf("select * from (%s) sub order by serial_no asc limit %d", base, reports.ExportMaxRows)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="serial-inv-balance.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Serial No.", "Item Code", "Item Name", "Location", "Qty On Hand", "Status"})
		for rows.Next() {
			var row serialBalanceRow
			if err := rows.Scan(&row.SerialNo, &row.ItemID, &row.ItemCode, &row.ItemName, &row.LocationID, &row.LocationName, &row.QtyOnHand, &row.Status); err != nil {
				return
			}
			_ = cw.Write([]string{
				row.SerialNo, row.ItemCode, row.ItemName, row.LocationName,
				fmt.Sprintf("%.4f", row.QtyOnHand), row.Status,
			})
		}
		cw.Flush()
	}
}

func listSerialReconciliationReport(pool *pgxpool.Pool) http.HandlerFunc {
	allowedSerial := map[string]string{
		"serial_no": "su.serial_no", "item_code": "i.item_code", "variance": "variance",
	}
	allowedItem := map[string]string{
		"item_code": "i.item_code", "variance": "variance",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		compareBy := strings.TrimSpace(r.URL.Query().Get("compare_by"))
		if compareBy == "" {
			compareBy = "serial"
		}
		f := parseSerialReportFilters(r)
		mismatchesOnly := strings.TrimSpace(r.URL.Query().Get("mismatches_only")) == "1" || strings.EqualFold(r.URL.Query().Get("mismatches_only"), "true")

		if compareBy == "item" {
			p := httputil.ParseListParams(r, "item_code", allowedItem)
			offset := httputil.Offset(p)
			base, args := serialReconciliationItemSQL(tu.TenantID, f, mismatchesOnly)
			countQ := fmt.Sprintf("select count(*) from (%s) sub", base)
			var total int64
			if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to count report.", "ERR_INTERNAL")
				return
			}
			sortCol := allowedItem[p.Sort]
			if sortCol == "" {
				sortCol = "i.item_code"
			}
			args = append(args, p.PageSize, offset)
			q := fmt.Sprintf("select * from (%s) sub order by %s %s limit $%d offset $%d", base, sortCol, reports.OrderSQL(p.Order), len(args)-1, len(args))
			rows, err := pool.Query(r.Context(), q, args...)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load report.", "ERR_INTERNAL")
				return
			}
			defer rows.Close()
			var out []serialReconciliationRow
			for rows.Next() {
				var row serialReconciliationRow
				if err := rows.Scan(&row.ItemID, &row.ItemCode, &row.ItemName, &row.LocationID, &row.LocationName,
					&row.ItemQtyOnHand, &row.SerialUnitCount, &row.Variance); err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to read report.", "ERR_INTERNAL")
					return
				}
				out = append(out, row)
			}
			if out == nil {
				out = []serialReconciliationRow{}
			}
			response.OKList(w, out, p.Page, p.PageSize, total)
			return
		}

		p := httputil.ParseListParams(r, "serial_no", allowedSerial)
		offset := httputil.Offset(p)
		base, args := serialReconciliationSerialSQL(tu.TenantID, f, mismatchesOnly)
		countQ := fmt.Sprintf("select count(*) from (%s) sub", base)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count report.", "ERR_INTERNAL")
			return
		}
		sortCol := allowedSerial[p.Sort]
		if sortCol == "" {
			sortCol = "su.serial_no"
		}
		args = append(args, p.PageSize, offset)
		q := fmt.Sprintf("select * from (%s) sub order by %s %s limit $%d offset $%d", base, sortCol, reports.OrderSQL(p.Order), len(args)-1, len(args))
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load report.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []serialReconciliationRow
		for rows.Next() {
			var row serialReconciliationRow
			var serialNo string
			if err := rows.Scan(&serialNo, &row.ItemID, &row.ItemCode, &row.ItemName, &row.LocationID, &row.LocationName,
				&row.ItemQtyOnHand, &row.SerialUnitCount, &row.Variance); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read report.", "ERR_INTERNAL")
				return
			}
			row.SerialNo = &serialNo
			out = append(out, row)
		}
		if out == nil {
			out = []serialReconciliationRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func serialReconciliationSerialSQL(tenantID int64, f serialReportFilters, mismatchesOnly bool) (string, []any) {
	where := "su.tenant_id = $1 and i.track_serial = true and su.status in ('in_stock', 'reserved')"
	args := []any{tenantID}
	argN := 2
	where, args, argN = appendSerialUnitFilters(where, args, argN, f, "su")
	if mismatchesOnly {
		where += ` and abs(coalesce(bal.qty_on_hand, 0) - 1) > 0.0001`
	}
	q := fmt.Sprintf(`
		select su.serial_no, su.item_id, i.item_code, i.item_name,
		  su.location_id, coalesce(l.location_name, ''),
		  coalesce(bal.qty_on_hand, 0)::float8,
		  1::float8,
		  (coalesce(bal.qty_on_hand, 0) - 1)::float8
		from public.inv_serial_units su
		join public.inv_items i on i.id = su.item_id
		left join public.inv_locations l on l.id = su.location_id
		left join public.inv_item_location_balances bal
		  on bal.tenant_id = su.tenant_id and bal.item_id = su.item_id and bal.location_id = su.location_id
		where %s`, where)
	return q, args
}

func serialReconciliationItemSQL(tenantID int64, f serialReportFilters, mismatchesOnly bool) (string, []any) {
	where := "bal.tenant_id = $1 and i.track_serial = true"
	args := []any{tenantID}
	argN := 2
	if f.ItemID != nil {
		where += fmt.Sprintf(" and bal.item_id = $%d", argN)
		args = append(args, *f.ItemID)
		argN++
	}
	if f.LocationID != nil {
		where += fmt.Sprintf(" and bal.location_id = $%d", argN)
		args = append(args, *f.LocationID)
		argN++
	}
	if f.Q != "" {
		where += fmt.Sprintf(" and (i.item_code ilike $%d or i.item_name ilike $%d)", argN, argN)
		args = append(args, "%"+f.Q+"%")
		argN++
	}
	if mismatchesOnly {
		where += ` and abs(bal.qty_on_hand - coalesce(sc.cnt, 0)) > 0.0001`
	}
	q := fmt.Sprintf(`
		select i.id, i.item_code, i.item_name,
		  bal.location_id, l.location_name,
		  bal.qty_on_hand::float8,
		  coalesce(sc.cnt, 0)::float8,
		  (bal.qty_on_hand - coalesce(sc.cnt, 0))::float8
		from public.inv_item_location_balances bal
		join public.inv_items i on i.id = bal.item_id and i.tenant_id = bal.tenant_id
		join public.inv_locations l on l.id = bal.location_id
		left join (
		  select item_id, location_id, count(*)::float8 as cnt
		  from public.inv_serial_units
		  where tenant_id = $1 and status in ('in_stock', 'reserved')
		  group by item_id, location_id
		) sc on sc.item_id = bal.item_id and sc.location_id = bal.location_id
		where %s`, where)
	return q, args
}

func exportSerialReconciliationReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		compareBy := strings.TrimSpace(r.URL.Query().Get("compare_by"))
		if compareBy == "" {
			compareBy = "serial"
		}
		f := parseSerialReportFilters(r)
		mismatchesOnly := strings.TrimSpace(r.URL.Query().Get("mismatches_only")) == "1" || strings.EqualFold(r.URL.Query().Get("mismatches_only"), "true")
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="serial-reconciliation.csv"`)
		cw := csv.NewWriter(w)
		if compareBy == "item" {
			base, args := serialReconciliationItemSQL(tu.TenantID, f, mismatchesOnly)
			q := fmt.Sprintf("select * from (%s) sub order by item_code asc limit %d", base, reports.ExportMaxRows)
			rows, err := pool.Query(r.Context(), q, args...)
			if err != nil {
				return
			}
			defer rows.Close()
			_ = cw.Write([]string{"Item Code", "Item Name", "Location", "Item Qty", "Serial Count", "Variance"})
			for rows.Next() {
				var row serialReconciliationRow
				if err := rows.Scan(&row.ItemID, &row.ItemCode, &row.ItemName, &row.LocationID, &row.LocationName,
					&row.ItemQtyOnHand, &row.SerialUnitCount, &row.Variance); err != nil {
					return
				}
				_ = cw.Write([]string{
					row.ItemCode, row.ItemName, row.LocationName,
					fmt.Sprintf("%.4f", row.ItemQtyOnHand), fmt.Sprintf("%.4f", row.SerialUnitCount), fmt.Sprintf("%.4f", row.Variance),
				})
			}
		} else {
			base, args := serialReconciliationSerialSQL(tu.TenantID, f, mismatchesOnly)
			q := fmt.Sprintf("select * from (%s) sub order by serial_no asc limit %d", base, reports.ExportMaxRows)
			rows, err := pool.Query(r.Context(), q, args...)
			if err != nil {
				return
			}
			defer rows.Close()
			_ = cw.Write([]string{"Serial No.", "Item Code", "Item Name", "Location", "Item Qty", "Serial Count", "Variance"})
			for rows.Next() {
				var row serialReconciliationRow
				var serialNo string
				if err := rows.Scan(&serialNo, &row.ItemID, &row.ItemCode, &row.ItemName, &row.LocationID, &row.LocationName,
					&row.ItemQtyOnHand, &row.SerialUnitCount, &row.Variance); err != nil {
					return
				}
				_ = cw.Write([]string{
					serialNo, row.ItemCode, row.ItemName, row.LocationName,
					fmt.Sprintf("%.4f", row.ItemQtyOnHand), fmt.Sprintf("%.4f", row.SerialUnitCount), fmt.Sprintf("%.4f", row.Variance),
				})
			}
		}
		cw.Flush()
	}
}
