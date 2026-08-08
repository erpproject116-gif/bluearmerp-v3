package inventory

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type SerialUnitRow struct {
	ID              int64   `json:"id"`
	SerialNo        string  `json:"serial_no"`
	ItemID          int64   `json:"item_id"`
	ItemCode        string  `json:"item_code"`
	ItemName        string  `json:"item_name"`
	Status          string  `json:"status"`
	LocationID      *int64  `json:"location_id,omitempty"`
	LocationName    string  `json:"location_name,omitempty"`
	PartnerID       *int64  `json:"partner_id,omitempty"`
	PartnerName     string  `json:"partner_name,omitempty"`
	WarrantyStart   *string `json:"warranty_start,omitempty"`
	WarrantyEnd     *string `json:"warranty_end,omitempty"`
	ReceivedAt      *string `json:"received_at,omitempty"`
	PurchaseOrderNo *string `json:"purchase_order_no,omitempty"`
	SalesID         *int64  `json:"sales_id,omitempty"`
	CreatedAt       string  `json:"created_at"`
}

type SerialEventRow struct {
	ID               int64   `json:"id"`
	SerialUnitID     int64   `json:"serial_unit_id"`
	SerialNo         string  `json:"serial_no"`
	ItemCode         string  `json:"item_code"`
	ItemName         string  `json:"item_name"`
	EventType        string  `json:"event_type"`
	FromLocationName *string `json:"from_location_name,omitempty"`
	ToLocationName   *string `json:"to_location_name,omitempty"`
	RefType          *string `json:"ref_type,omitempty"`
	RefID            *int64  `json:"ref_id,omitempty"`
	Notes            *string `json:"notes,omitempty"`
	CreatedByName    string  `json:"created_by_name,omitempty"`
	CreatedAt        string  `json:"created_at"`
}

type LotBatchRow struct {
	ID           int64   `json:"id"`
	ItemID       int64   `json:"item_id"`
	ItemCode     string  `json:"item_code"`
	ItemName     string  `json:"item_name"`
	LotNo        string  `json:"lot_no"`
	LocationID   int64   `json:"location_id"`
	LocationName string  `json:"location_name"`
	QtyOnHand    float64 `json:"qty_on_hand"`
	ExpiryDate   *string `json:"expiry_date,omitempty"`
	UpdatedAt    string  `json:"updated_at"`
}

type serialTransferBody struct {
	SerialUnitIDs  []int64 `json:"serial_unit_ids"`
	ToLocationID   int64   `json:"to_location_id"`
	Notes          string  `json:"notes"`
}

func registerSerialRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/serial-units", listSerialUnits(pool))
	r.Get("/serial-units/available", listAvailableSerialUnits(pool))
	r.Get("/serial-units/trace", traceSerialUnit(pool))
	r.Post("/serial-units/resolve-scan", resolveSerialScan(pool))
	r.Post("/serial-units/resolve-scan/batch", resolveSerialScanBatch(pool))
	r.Post("/serial-units/transfer", transferSerialUnits(pool))
	r.Post("/serial-units/register", registerSerialUnits(pool))
	r.Post("/serial-units/generate", generateSerialUnits(pool))
	r.Post("/serial-units/allocate-numbers", allocateSerialNumbers(pool))
	r.Get("/serial-units/adjustment-candidates", listSerialAdjustmentCandidates(pool))
	r.Post("/serial-units/adjustments", applySerialAdjustments(pool))
	r.Post("/serial-units/adjustment-requests/{id}/approve", approveSerialAdjustmentRequest(pool))
	r.Post("/serial-units/adjustment-requests/{id}/reject", rejectSerialAdjustmentRequest(pool))
	r.Get("/serial-events", listSerialEvents(pool))
	r.Get("/lot-batches", listLotBatches(pool))
	r.Get("/lot-batches/adjustment-candidates", listLotAdjustmentCandidates(pool))
	r.Post("/lot-batches/adjustments", applyLotAdjustments(pool))
	r.Post("/lot-batches/register", registerLotBatch(pool))
}

func listSerialUnits(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"serial_no":     "su.serial_no",
		"item_code":     "i.item_code",
		"status":        "su.status",
		"warranty_end":  "su.warranty_end",
		"received_at":   "su.received_at",
		"created_at":    "su.created_at",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "created_at", allowed)
		offset := httputil.Offset(p)

		where := "su.tenant_id = $1"
		args := []any{tu.TenantID}
		argN := 2

		if p.Q != "" {
			where += fmt.Sprintf(` and (
			  su.serial_no ilike $%d or i.item_code ilike $%d or i.item_name ilike $%d
			  or coalesce(cat.name, '') ilike $%d or coalesce(p.company_name, '') ilike $%d
			  or exists (
			    select 1 from public.tenant_custom_field_values cv
			    where cv.tenant_id = su.tenant_id and cv.entity_type = 'inv_item' and cv.entity_id = i.id
			      and cv.value_json::text ilike $%d
			  )
			)`, argN, argN, argN, argN, argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}
		if st := strings.TrimSpace(r.URL.Query().Get("status")); st != "" {
			where += fmt.Sprintf(" and su.status = $%d", argN)
			args = append(args, st)
			argN++
		}
		if id, ok := optionalInt64Query(r, "item_id"); ok {
			where += fmt.Sprintf(" and su.item_id = $%d", argN)
			args = append(args, *id)
			argN++
		}
		if id, ok := optionalInt64Query(r, "location_id"); ok {
			where += fmt.Sprintf(" and su.location_id = $%d", argN)
			args = append(args, *id)
			argN++
		}
		if sn := strings.TrimSpace(r.URL.Query().Get("serial_no")); sn != "" {
			where += fmt.Sprintf(" and su.serial_no ilike $%d", argN)
			args = append(args, "%"+sn+"%")
			argN++
		}
		if fromStr := strings.TrimSpace(r.URL.Query().Get("warranty_end_from")); fromStr != "" {
			if from, err := parseDate(fromStr); err == nil {
				where += fmt.Sprintf(" and su.warranty_end >= $%d::date", argN)
				args = append(args, from)
				argN++
			}
		}
		if toStr := strings.TrimSpace(r.URL.Query().Get("warranty_end_to")); toStr != "" {
			if to, err := parseDate(toStr); err == nil {
				where += fmt.Sprintf(" and su.warranty_end <= $%d::date", argN)
				args = append(args, to)
				argN++
			}
		}
		switch strings.TrimSpace(r.URL.Query().Get("origin")) {
		case "linked":
			where += " and su.goods_receipt_line_id is not null"
		case "manual":
			where += " and su.goods_receipt_line_id is null"
		}

		sortCol := allowed[p.Sort]
		if sortCol == "" {
			sortCol = "su.created_at"
		}

		q := fmt.Sprintf(`
			select su.id, su.serial_no, su.item_id, i.item_code, i.item_name, su.status,
			  su.location_id, coalesce(loc.name, ''),
			  su.partner_id, coalesce(p.company_name, ''),
			  su.warranty_start, su.warranty_end, su.received_at,
			  po.purchase_order_no, su.sales_line_id,
			  su.created_at, count(*) over()
			from public.inv_serial_units su
			join public.inv_items i on i.id = su.item_id
			left join public.inv_item_categories cat on cat.id = i.item_category_id
			left join public.inv_locations loc on loc.id = su.location_id
			left join public.inv_partners p on p.id = su.partner_id
			left join public.po_purchase_order_lines pol on pol.id = su.purchase_order_line_id
			left join public.po_purchase_orders po on po.id = pol.purchase_order_id
			where %s
			order by %s %s
			limit $%d offset $%d`, where, sortCol, orderSQL(p.Order), argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list serial units.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []SerialUnitRow
		var total int64
		for rows.Next() {
			var row SerialUnitRow
			var wStart, wEnd *time.Time
			var recv *time.Time
			var poNo *string
			var salesLineID *int64
			var createdAt time.Time
			if err := rows.Scan(&row.ID, &row.SerialNo, &row.ItemID, &row.ItemCode, &row.ItemName, &row.Status,
				&row.LocationID, &row.LocationName, &row.PartnerID, &row.PartnerName,
				&wStart, &wEnd, &recv, &poNo, &salesLineID, &createdAt, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read serial units.", "ERR_INTERNAL")
				return
			}
			row.WarrantyStart = formatDatePtr(wStart)
			row.WarrantyEnd = formatDatePtr(wEnd)
			row.ReceivedAt = formatTimePtr(recv)
			row.PurchaseOrderNo = poNo
			row.CreatedAt = createdAt.Format(time.RFC3339)
			out = append(out, row)
		}
		if out == nil {
			out = []SerialUnitRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func listAvailableSerialUnits(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		itemID, err := parseRequiredInt64Query(r, "item_id")
		if err != nil {
			response.Validation(w, map[string]string{"item_id": "item_id is required."})
			return
		}
		locationID, _ := optionalInt64Query(r, "location_id")
		where := "su.tenant_id = $1 and su.item_id = $2 and su.status in ('in_stock', 'reserved')"
		args := []any{tu.TenantID, itemID}
		argN := 3
		if locationID != nil {
			where += fmt.Sprintf(" and su.location_id = $%d", argN)
			args = append(args, *locationID)
		}
		rows, err := pool.Query(r.Context(), fmt.Sprintf(`
			select su.id, su.serial_no, su.status, su.location_id, coalesce(loc.name, ''),
			  su.warranty_end
			from public.inv_serial_units su
			left join public.inv_locations loc on loc.id = su.location_id
			where %s
			order by su.serial_no`, where), args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list available serials.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		type avail struct {
			ID           int64   `json:"id"`
			SerialNo     string  `json:"serial_no"`
			Status       string  `json:"status"`
			LocationID   *int64  `json:"location_id,omitempty"`
			LocationName string  `json:"location_name,omitempty"`
			WarrantyEnd  *string `json:"warranty_end,omitempty"`
		}
		var out []avail
		for rows.Next() {
			var row avail
			var wEnd *time.Time
			if err := rows.Scan(&row.ID, &row.SerialNo, &row.Status, &row.LocationID, &row.LocationName, &wEnd); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read.", "ERR_INTERNAL")
				return
			}
			row.WarrantyEnd = formatDatePtr(wEnd)
			out = append(out, row)
		}
		if out == nil {
			out = []avail{}
		}
		response.OK(w, out, "OK")
	}
}

func traceSerialUnit(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		serialNo := strings.TrimSpace(r.URL.Query().Get("serial_no"))
		if serialNo == "" {
			response.Validation(w, map[string]string{"serial_no": "serial_no is required."})
			return
		}
		var unit SerialUnitRow
		var wStart, wEnd *time.Time
		var recv *time.Time
		var poNo *string
		var createdAt time.Time
		err := pool.QueryRow(r.Context(), `
			select su.id, su.serial_no, su.item_id, i.item_code, i.item_name, su.status,
			  su.location_id, coalesce(loc.name, ''),
			  su.partner_id, coalesce(p.company_name, ''),
			  su.warranty_start, su.warranty_end, su.received_at,
			  po.purchase_order_no, su.sales_line_id, su.created_at
			from public.inv_serial_units su
			join public.inv_items i on i.id = su.item_id
			left join public.inv_locations loc on loc.id = su.location_id
			left join public.inv_partners p on p.id = su.partner_id
			left join public.po_purchase_order_lines pol on pol.id = su.purchase_order_line_id
			left join public.po_purchase_orders po on po.id = pol.purchase_order_id
			where su.tenant_id = $1 and su.serial_no = $2
			order by su.id desc limit 1`, tu.TenantID, serialNo).Scan(
			&unit.ID, &unit.SerialNo, &unit.ItemID, &unit.ItemCode, &unit.ItemName, &unit.Status,
			&unit.LocationID, &unit.LocationName, &unit.PartnerID, &unit.PartnerName,
			&wStart, &wEnd, &recv, &poNo, &unit.SalesID, &createdAt)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Serial not found.", "ERR_NOT_FOUND")
			return
		}
		unit.WarrantyStart = formatDatePtr(wStart)
		unit.WarrantyEnd = formatDatePtr(wEnd)
		unit.ReceivedAt = formatTimePtr(recv)
		unit.PurchaseOrderNo = poNo
		unit.CreatedAt = createdAt.Format(time.RFC3339)

		eventRows, err := pool.Query(r.Context(), `
			select e.id, e.event_type, coalesce(fl.name, ''), coalesce(tl.name, ''),
			  e.ref_type, e.ref_id, e.notes, coalesce(u.full_name, ''), e.created_at
			from public.inv_serial_events e
			left join public.inv_locations fl on fl.id = e.from_location_id
			left join public.inv_locations tl on tl.id = e.to_location_id
			left join public.users u on u.id = e.created_by_user_id
			where e.serial_unit_id = $1
			order by e.created_at`, unit.ID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load events.", "ERR_INTERNAL")
			return
		}
		defer eventRows.Close()
		type traceEvent struct {
			ID               int64   `json:"id"`
			EventType        string  `json:"event_type"`
			FromLocationName string  `json:"from_location_name,omitempty"`
			ToLocationName   string  `json:"to_location_name,omitempty"`
			RefType          *string `json:"ref_type,omitempty"`
			RefID            *int64  `json:"ref_id,omitempty"`
			Notes            *string `json:"notes,omitempty"`
			CreatedByName    string  `json:"created_by_name,omitempty"`
			CreatedAt        string  `json:"created_at"`
		}
		var events []traceEvent
		for eventRows.Next() {
			var ev traceEvent
			var fromName, toName string
			var at time.Time
			if err := eventRows.Scan(&ev.ID, &ev.EventType, &fromName, &toName, &ev.RefType, &ev.RefID, &ev.Notes, &ev.CreatedByName, &at); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read events.", "ERR_INTERNAL")
				return
			}
			ev.FromLocationName = fromName
			ev.ToLocationName = toName
			ev.CreatedAt = at.Format(time.RFC3339)
			events = append(events, ev)
		}
		if events == nil {
			events = []traceEvent{}
		}

		var prNo *string
		_ = pool.QueryRow(r.Context(), `
			select pr.purchase_request_no::text
			from public.gr_goods_receipt_lines grl
			join public.gr_goods_receipts gr on gr.id = grl.goods_receipt_id
			join public.po_purchase_order_lines pol on pol.id = grl.purchase_order_line_id
			join public.po_purchase_orders po on po.id = pol.purchase_order_id
			join public.pr_purchase_requests pr on pr.id = po.purchase_request_id
			join public.inv_serial_units su on su.goods_receipt_line_id = grl.id
			where su.id = $1`, unit.ID).Scan(&prNo)

		response.OK(w, map[string]any{
			"unit":   unit,
			"events": events,
			"links": map[string]any{
				"purchase_request_no": prNo,
			},
		}, "OK")
	}
}

func listSerialEvents(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"created_at": "e.created_at",
		"event_type": "e.event_type",
		"serial_no":  "su.serial_no",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "created_at", allowed)
		offset := httputil.Offset(p)

		where := "e.tenant_id = $1"
		args := []any{tu.TenantID}
		argN := 2

		if p.Q != "" {
			where += fmt.Sprintf(" and (su.serial_no ilike $%d or i.item_code ilike $%d)", argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}
		if et := strings.TrimSpace(r.URL.Query().Get("event_type")); et != "" {
			where += fmt.Sprintf(" and e.event_type = $%d", argN)
			args = append(args, et)
			argN++
		}
		if fromStr := strings.TrimSpace(r.URL.Query().Get("date_from")); fromStr != "" {
			if from, err := parseDate(fromStr); err == nil {
				where += fmt.Sprintf(" and e.created_at >= $%d::timestamptz", argN)
				args = append(args, from.Format("2006-01-02")+" 00:00:00+00")
				argN++
			}
		}
		if toStr := strings.TrimSpace(r.URL.Query().Get("date_to")); toStr != "" {
			if to, err := parseDate(toStr); err == nil {
				where += fmt.Sprintf(" and e.created_at < ($%d::date + interval '1 day')", argN)
				args = append(args, to.Format("2006-01-02"))
				argN++
			}
		}

		sortCol := allowed[p.Sort]
		if sortCol == "" {
			sortCol = "e.created_at"
		}

		q := fmt.Sprintf(`
			select e.id, e.serial_unit_id, su.serial_no, i.item_code, i.item_name,
			  e.event_type, coalesce(fl.name, ''), coalesce(tl.name, ''),
			  e.ref_type, e.ref_id, e.notes, coalesce(u.full_name, ''), e.created_at,
			  count(*) over()
			from public.inv_serial_events e
			join public.inv_serial_units su on su.id = e.serial_unit_id
			join public.inv_items i on i.id = su.item_id
			left join public.inv_locations fl on fl.id = e.from_location_id
			left join public.inv_locations tl on tl.id = e.to_location_id
			left join public.users u on u.id = e.created_by_user_id
			where %s
			order by %s %s
			limit $%d offset $%d`, where, sortCol, orderSQL(p.Order), argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list serial events.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []SerialEventRow
		var total int64
		for rows.Next() {
			var row SerialEventRow
			var fromName, toName string
			var at time.Time
			if err := rows.Scan(&row.ID, &row.SerialUnitID, &row.SerialNo, &row.ItemCode, &row.ItemName,
				&row.EventType, &fromName, &toName, &row.RefType, &row.RefID, &row.Notes, &row.CreatedByName, &at, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read.", "ERR_INTERNAL")
				return
			}
			if fromName != "" {
				row.FromLocationName = &fromName
			}
			if toName != "" {
				row.ToLocationName = &toName
			}
			row.CreatedAt = at.Format(time.RFC3339)
			out = append(out, row)
		}
		if out == nil {
			out = []SerialEventRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func listLotBatches(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"lot_no":       "lb.lot_no",
		"item_code":    "i.item_code",
		"qty_on_hand":  "lb.qty_on_hand",
		"expiry_date":  "lb.expiry_date",
		"updated_at":   "lb.updated_at",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "updated_at", allowed)
		offset := httputil.Offset(p)

		where := "lb.tenant_id = $1"
		args := []any{tu.TenantID}
		argN := 2

		if p.Q != "" {
			where += fmt.Sprintf(" and (lb.lot_no ilike $%d or i.item_code ilike $%d or i.item_name ilike $%d)", argN, argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}
		if id, ok := optionalInt64Query(r, "item_id"); ok {
			where += fmt.Sprintf(" and lb.item_id = $%d", argN)
			args = append(args, *id)
			argN++
		}
		if id, ok := optionalInt64Query(r, "location_id"); ok {
			where += fmt.Sprintf(" and lb.location_id = $%d", argN)
			args = append(args, *id)
			argN++
		}
		if strings.TrimSpace(r.URL.Query().Get("available_only")) == "true" {
			where += " and lb.qty_on_hand > 0.0001"
		}

		sortCol := allowed[p.Sort]
		if sortCol == "" {
			sortCol = "lb.updated_at"
		}

		q := fmt.Sprintf(`
			select lb.id, lb.item_id, i.item_code, i.item_name, lb.lot_no,
			  lb.location_id, loc.name, lb.qty_on_hand::float8, lb.expiry_date, lb.updated_at,
			  count(*) over()
			from public.inv_lot_batches lb
			join public.inv_items i on i.id = lb.item_id
			join public.inv_locations loc on loc.id = lb.location_id
			where %s
			order by %s %s
			limit $%d offset $%d`, where, sortCol, orderSQL(p.Order), argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list lot batches.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []LotBatchRow
		var total int64
		for rows.Next() {
			var row LotBatchRow
			var expiry *time.Time
			var updatedAt time.Time
			if err := rows.Scan(&row.ID, &row.ItemID, &row.ItemCode, &row.ItemName, &row.LotNo,
				&row.LocationID, &row.LocationName, &row.QtyOnHand, &expiry, &updatedAt, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read.", "ERR_INTERNAL")
				return
			}
			row.ExpiryDate = formatDatePtr(expiry)
			row.UpdatedAt = updatedAt.Format(time.RFC3339)
			out = append(out, row)
		}
		if out == nil {
			out = []LotBatchRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func transferSerialUnits(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body serialTransferBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.SerialUnitIDs) == 0 {
			response.Validation(w, map[string]string{"serial_unit_ids": "At least one serial is required."})
			return
		}
		if body.ToLocationID <= 0 {
			response.Validation(w, map[string]string{"to_location_id": "Destination location is required."})
			return
		}
		var locTenant int64
		if err := pool.QueryRow(r.Context(), `select tenant_id from public.inv_locations where id = $1`, body.ToLocationID).Scan(&locTenant); err != nil || locTenant != tu.TenantID {
			response.Validation(w, map[string]string{"to_location_id": "Invalid location."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to transfer.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		transferred := 0
		for _, unitID := range body.SerialUnitIDs {
			var itemID int64
			var fromLocID *int64
			var trackQty bool
			err := tx.QueryRow(r.Context(), `
				select su.item_id, su.location_id, coalesce(i.track_inventory_qty, false)
				from public.inv_serial_units su
				join public.inv_items i on i.id = su.item_id
				where su.id = $1 and su.tenant_id = $2 and su.status in ('in_stock', 'reserved')
				for update`, unitID, tu.TenantID).Scan(&itemID, &fromLocID, &trackQty)
			if err != nil {
				response.Validation(w, map[string]string{"serial_unit_ids": fmt.Sprintf("Invalid or unavailable serial unit %d.", unitID)})
				return
			}
			if fromLocID != nil && *fromLocID == body.ToLocationID {
				continue
			}

			if trackQty && fromLocID != nil {
				tag, err := tx.Exec(r.Context(), `
					update public.inv_item_location_balances
					set qty_on_hand = qty_on_hand - 1, updated_at = now()
					where tenant_id = $1 and item_id = $2 and location_id = $3 and qty_on_hand >= 1`,
					tu.TenantID, itemID, *fromLocID)
				if err != nil || tag.RowsAffected() == 0 {
					response.Validation(w, map[string]string{"serial_unit_ids": "Insufficient stock at source location."})
					return
				}
				_, err = tx.Exec(r.Context(), `
					insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand)
					values ($1, $2, $3, 1)
					on conflict (tenant_id, item_id, location_id)
					do update set qty_on_hand = inv_item_location_balances.qty_on_hand + 1, updated_at = now()`,
					tu.TenantID, itemID, body.ToLocationID)
				if err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to update balances.", "ERR_INTERNAL")
					return
				}
			}

			_, err = tx.Exec(r.Context(), `
				update public.inv_serial_units
				set location_id = $1, updated_at = now()
				where id = $2`, body.ToLocationID, unitID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to update serial.", "ERR_INTERNAL")
				return
			}
			_, err = tx.Exec(r.Context(), `
				insert into public.inv_serial_events (
				  tenant_id, serial_unit_id, event_type, from_location_id, to_location_id,
				  ref_type, notes, created_by_user_id
				) values ($1, $2, 'transferred', $3, $4, 'manual_transfer', $5, $6)`,
				tu.TenantID, unitID, fromLocID, body.ToLocationID, strings.TrimSpace(body.Notes), tu.AppUserID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to record event.", "ERR_INTERNAL")
				return
			}
			transferred++
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to commit transfer.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.serial.transfer", "inv_serial_unit", nil, nil, map[string]any{
			"transferred_count": transferred,
			"to_location_id":    body.ToLocationID,
		})
		for _, unitID := range body.SerialUnitIDs {
			id := unitID
			_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.serial.transfer", "inv_serial_unit", &id, nil, map[string]any{
				"to_location_id": body.ToLocationID,
				"notes":          body.Notes,
			})
		}
		response.OK(w, map[string]any{"transferred_count": transferred}, "Transferred.")
	}
}

func parseRequiredInt64Query(r *http.Request, key string) (int64, error) {
	id, ok := optionalInt64Query(r, key)
	if !ok || id == nil {
		return 0, fmt.Errorf("missing")
	}
	return *id, nil
}

func formatDatePtr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.Format("2006-01-02")
	return &s
}

func formatTimePtr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.Format(time.RFC3339)
	return &s
}

// InsertSerialEvent records an append-only serial event within an existing transaction.
func InsertSerialEvent(ctx context.Context, tx pgx.Tx, tenantID, unitID int64, eventType string, fromLoc, toLoc *int64, refType string, refID int64, userID *int64) error {
	_, err := tx.Exec(ctx, `
		insert into public.inv_serial_events (
		  tenant_id, serial_unit_id, event_type, from_location_id, to_location_id,
		  ref_type, ref_id, created_by_user_id
		) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
		tenantID, unitID, eventType, fromLoc, toLoc, refType, refID, userID)
	return err
}
