package manufacturing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/inventory"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type WorkOrder struct {
	ID                     int64    `json:"id"`
	WorkOrderNo            string   `json:"work_order_no"`
	BomID                  int64    `json:"bom_id"`
	BomCode                string   `json:"bom_code,omitempty"`
	BomName                string   `json:"bom_name,omitempty"`
	FinishedItemID         int64    `json:"finished_item_id"`
	FinishedItemCode       string   `json:"finished_item_code,omitempty"`
	FinishedItemName       string   `json:"finished_item_name,omitempty"`
	FinishedBaseUnit       string   `json:"finished_base_unit_code,omitempty"`
	LocationID             int64    `json:"location_id"`
	LocationName           string   `json:"location_name,omitempty"`
	QtyToProduce           float64  `json:"qty_to_produce"`
	QtyProduced            float64  `json:"qty_produced"`
	Status                 string   `json:"status"`
	OrderDate              string   `json:"order_date"`
	Notes                  *string  `json:"notes,omitempty"`
	CreatedAt              *string  `json:"created_at,omitempty"`
	ReleasedAt             *string  `json:"released_at,omitempty"`
	CompletedAt            *string  `json:"completed_at,omitempty"`
	TransactedAt           *string  `json:"transacted_at,omitempty"`
	ActualInputQty         *float64 `json:"actual_input_qty,omitempty"`
	InputLotBatchID        *int64   `json:"input_lot_batch_id,omitempty"`
	InspectionStatus       string   `json:"inspection_status"`
	InspectionNotes        *string  `json:"inspection_notes,omitempty"`
	InspectedAt            *string  `json:"inspected_at,omitempty"`
	SourceSalesOrderID     *int64   `json:"source_sales_order_id,omitempty"`
	SourceSalesOrderLineID *int64   `json:"source_sales_order_line_id,omitempty"`
	SourceSalesOrderNo     *string  `json:"source_sales_order_no,omitempty"`
	BomType                string   `json:"bom_type,omitempty"`
	FinishedTrackSerial    bool     `json:"finished_track_serial,omitempty"`
	FinishedTrackLot       bool     `json:"finished_track_lot,omitempty"`
	ComponentsTracked      bool     `json:"components_tracked,omitempty"`
}

type MaterialNeedLine struct {
	ComponentItemID int64   `json:"component_item_id"`
	ComponentCode   string  `json:"component_code"`
	ComponentName   string  `json:"component_name"`
	BomQty          float64 `json:"bom_qty"`
	BomUnitCode     string  `json:"bom_unit_code"`
	ScrapQty        float64 `json:"scrap_qty"`
	StockToIssue    float64 `json:"stock_to_issue"`
	StockUnitCode   string  `json:"stock_unit_code"`
	QtyOnHand       float64 `json:"qty_on_hand"`
	Shortage        float64 `json:"shortage"`
	StagedQty       float64 `json:"staged_qty,omitempty"`
	TrackLot        bool    `json:"track_lot,omitempty"`
}

type MaterialNeeds struct {
	WorkOrderID          int64              `json:"work_order_id"`
	BomType              string             `json:"bom_type"`
	QtyToProduce         float64            `json:"qty_to_produce"`
	FinishedBaseUnitCode string             `json:"finished_base_unit_code"`
	OutputQty            float64            `json:"output_qty"`
	YieldPct             float64            `json:"yield_pct"`
	ReceiveQty           float64            `json:"receive_qty"`
	InputLine            *MaterialNeedLine  `json:"input_line,omitempty"`
	Lines                []MaterialNeedLine `json:"lines"`
}

type workOrderBody struct {
	BomID                  int64   `json:"bom_id"`
	LocationID             int64   `json:"location_id"`
	QtyToProduce           float64 `json:"qty_to_produce"`
	OrderDate              string  `json:"order_date"`
	Notes                  *string `json:"notes"`
	SourceSalesOrderLineID *int64  `json:"source_sales_order_line_id"`
}

type workOrderPatchBody struct {
	LocationID   *int64   `json:"location_id"`
	QtyToProduce *float64 `json:"qty_to_produce"`
	OrderDate    *string  `json:"order_date"`
	Notes        *string  `json:"notes"`
	Status       *string  `json:"status"`
}

type workOrderCompleteBody struct {
	ActualInputQty  *float64        `json:"actual_input_qty"`
	QtyProduced     *float64        `json:"qty_produced"`
	InputLotBatchID *int64          `json:"input_lot_batch_id"`
	OutputWeighs    []woOutputWeigh `json:"output_weighs"`
}

// woOutputWeigh is a weighed cut/output lot on disassembly complete (overrides scaled BOM qty).
type woOutputWeigh struct {
	ComponentItemID int64    `json:"component_item_id"`
	LotNo           string   `json:"lot_no"`
	Qty             float64  `json:"qty"`
	CatchWeight     *float64 `json:"catch_weight,omitempty"`
	ExpiryDate      *string  `json:"expiry_date,omitempty"`
}

func listWorkOrders(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"work_order_no": "wo.work_order_no",
		"order_date":    "wo.order_date",
		"status":        "wo.status",
		"transacted_at": "coalesce(wo.completed_at, wo.released_at, wo.created_at)",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		defaultSort := "order_date"
		if parseBomTypeListFilter(r.URL.Query().Get("bom_type")) == "assembly" {
			defaultSort = "transacted_at"
		}
		p := httputil.ParseListParams(r, defaultSort, allowed)
		if p.Order == "" {
			p.Order = "desc"
		}
		offset := httputil.Offset(p)

		where := "wo.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
			where += fmt.Sprintf(" and (wo.work_order_no ilike $%d or b.bom_code ilike $%d or fi.item_name ilike $%d)", n, n, n)
			args = append(args, "%"+q+"%")
			n++
		}
		if st := strings.TrimSpace(r.URL.Query().Get("status")); st != "" {
			where += fmt.Sprintf(" and wo.status = $%d", n)
			args = append(args, st)
			n++
		}
		if bt := parseBomTypeListFilter(r.URL.Query().Get("bom_type")); bt != "" {
			where += fmt.Sprintf(" and coalesce(b.bom_type, 'assembly') = $%d", n)
			args = append(args, bt)
			n++
		}

		sortCol := p.Sort
		if sortCol == "" {
			sortCol = allowed[defaultSort]
			if sortCol == "" {
				sortCol = "wo.order_date"
			}
		}
		q := fmt.Sprintf(`
			select wo.id, wo.work_order_no, wo.bom_id, b.bom_code, b.bom_name,
			  coalesce(b.bom_type, 'assembly'),
			  wo.finished_item_id, coalesce(fi.item_code, ''), coalesce(fi.item_name, ''),
			  coalesce(bu.code, coalesce(nullif(trim(fi.unit), ''), 'ea')),
			  wo.location_id, coalesce(loc.location_name, ''),
			  wo.qty_to_produce::float8, wo.qty_produced::float8, wo.status,
			  wo.order_date::text, wo.notes,
			  wo.created_at::text, wo.released_at::text, wo.completed_at::text,
			  coalesce(wo.completed_at, wo.released_at, wo.created_at)::text,
			  wo.actual_input_qty::float8, wo.input_lot_batch_id,
			  wo.inspection_status, wo.inspection_notes, wo.inspected_at::text,
			  wo.source_sales_order_id, wo.source_sales_order_line_id, so.sales_order_no,
			  coalesce(fi.track_serial, false), coalesce(fi.track_lot, false),
			  exists (
			    select 1 from public.mfg_bom_lines bl
			    join public.inv_items ci on ci.id = bl.component_item_id
			    where bl.bom_id = wo.bom_id
			      and (coalesce(ci.track_serial, false) or coalesce(ci.track_lot, false))
			  ),
			  count(*) over()
			from public.mfg_work_orders wo
			join public.mfg_boms b on b.id = wo.bom_id
			join public.inv_items fi on fi.id = wo.finished_item_id
			left join public.inv_units bu on bu.id = fi.base_unit_id
			left join public.inv_locations loc on loc.id = wo.location_id
			left join public.so_sales_orders so on so.id = wo.source_sales_order_id
			where %s
			order by %s %s
			limit $%d offset $%d`,
			where, sortCol, orderSQL(p.Order), n, n+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list work orders.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []WorkOrder
		var total int64
		for rows.Next() {
			var row WorkOrder
			var notes *string
			var created, released, completed, transacted, inspectedAt *string
			var inspectionNotes *string
			var soNo *string
			if err := rows.Scan(
				&row.ID, &row.WorkOrderNo, &row.BomID, &row.BomCode, &row.BomName, &row.BomType,
				&row.FinishedItemID, &row.FinishedItemCode, &row.FinishedItemName, &row.FinishedBaseUnit,
				&row.LocationID, &row.LocationName,
				&row.QtyToProduce, &row.QtyProduced, &row.Status,
				&row.OrderDate, &notes, &created, &released, &completed, &transacted,
				&row.ActualInputQty, &row.InputLotBatchID,
				&row.InspectionStatus, &inspectionNotes, &inspectedAt,
				&row.SourceSalesOrderID, &row.SourceSalesOrderLineID, &soNo,
				&row.FinishedTrackSerial, &row.FinishedTrackLot, &row.ComponentsTracked,
				&total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read work order.", "ERR_INTERNAL")
				return
			}
			row.Notes = notes
			row.CreatedAt = created
			row.ReleasedAt = released
			row.CompletedAt = completed
			row.TransactedAt = transacted
			row.InspectionNotes = inspectionNotes
			row.InspectedAt = inspectedAt
			row.SourceSalesOrderNo = soNo
			out = append(out, row)
		}
		if out == nil {
			out = []WorkOrder{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getWorkOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		row, err := loadWorkOrder(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				response.Err(w, http.StatusNotFound, "Work order not found.", "ERR_NOT_FOUND")
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to load work order.", "ERR_INTERNAL")
			return
		}
		response.OK(w, row, "OK")
	}
}

func createWorkOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body workOrderBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateWorkOrderBody(body); errs != nil {
			response.Validation(w, errs)
			return
		}

		bom, err := loadBom(r.Context(), pool, tu.TenantID, body.BomID)
		if err != nil || !bom.IsActive {
			response.Validation(w, map[string]string{"bom_id": "Active BOM not found."})
			return
		}
		locationID := body.LocationID
		if locationID <= 0 && bom.DefaultLocationID != nil {
			locationID = *bom.DefaultLocationID
		}
		if locationID <= 0 {
			response.Validation(w, map[string]string{"location_id": "Production location is required."})
			return
		}

		orderDate := time.Now()
		if strings.TrimSpace(body.OrderDate) != "" {
			d, err := parseDate(body.OrderDate)
			if err != nil {
				response.Validation(w, map[string]string{"order_date": "Invalid date."})
				return
			}
			orderDate = d
		}

		woNo := fmt.Sprintf("WO-%s-%04d", orderDate.Format("20060102"), time.Now().Unix()%10000)
		var sourceSalesOrderID *int64
		if body.SourceSalesOrderLineID != nil && *body.SourceSalesOrderLineID > 0 {
			var soID int64
			var lineItemID *int64
			err = pool.QueryRow(r.Context(), `
				select ln.sales_order_id, ln.item_id
				from public.so_sales_order_lines ln
				join public.so_sales_orders so on so.id = ln.sales_order_id
				where ln.id = $1 and so.tenant_id = $2 and so.deleted_at is null`,
				*body.SourceSalesOrderLineID, tu.TenantID).Scan(&soID, &lineItemID)
			if err != nil || lineItemID == nil || *lineItemID != bom.FinishedItemID {
				response.Validation(w, map[string]string{"source_sales_order_line_id": "Sales order line not found or item mismatch."})
				return
			}
			sourceSalesOrderID = &soID
		}
		var id int64
		inspectionStatus := initialWorkOrderInspectionStatus(r.Context(), pool, tu.TenantID)
		err = pool.QueryRow(r.Context(), `
			insert into public.mfg_work_orders (
			  tenant_id, work_order_no, bom_id, finished_item_id, location_id,
			  qty_to_produce, order_date, notes, source_sales_order_id, source_sales_order_line_id,
			  inspection_status, created_by_user_id
			) values ($1,$2,$3,$4,$5,$6,$7::date,$8,$9,$10,$11,$12)
			returning id`,
			tu.TenantID, woNo, body.BomID, bom.FinishedItemID, locationID,
			body.QtyToProduce, orderDate.Format("2006-01-02"), body.Notes,
			sourceSalesOrderID, body.SourceSalesOrderLineID, inspectionStatus, tu.AppUserID,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create work order.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "manufacturing.work_order_create", "mfg_work_order", &id, nil, body)
		row, _ := loadWorkOrder(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Work order created.")
	}
}

func updateWorkOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body workOrderPatchBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}

		var status string
		err = pool.QueryRow(r.Context(), `
			select status from public.mfg_work_orders where id=$1 and tenant_id=$2`, id, tu.TenantID).Scan(&status)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Work order not found.", "ERR_NOT_FOUND")
			return
		}
		if status != "draft" {
			response.Validation(w, map[string]string{"status": "Only draft work orders can be edited."})
			return
		}

		sets := []string{"updated_at = now()"}
		args := []any{}
		n := 1
		if body.LocationID != nil && *body.LocationID > 0 {
			sets = append(sets, fmt.Sprintf("location_id = $%d", n))
			args = append(args, *body.LocationID)
			n++
		}
		if body.QtyToProduce != nil && *body.QtyToProduce > 0 {
			sets = append(sets, fmt.Sprintf("qty_to_produce = $%d", n))
			args = append(args, *body.QtyToProduce)
			n++
		}
		if body.OrderDate != nil && strings.TrimSpace(*body.OrderDate) != "" {
			d, err := parseDate(*body.OrderDate)
			if err != nil {
				response.Validation(w, map[string]string{"order_date": "Invalid date."})
				return
			}
			sets = append(sets, fmt.Sprintf("order_date = $%d::date", n))
			args = append(args, d.Format("2006-01-02"))
			n++
		}
		if body.Notes != nil {
			sets = append(sets, fmt.Sprintf("notes = $%d", n))
			args = append(args, body.Notes)
			n++
		}
		if body.Status != nil && *body.Status == "cancelled" {
			sets = append(sets, fmt.Sprintf("status = $%d", n))
			args = append(args, "cancelled")
			n++
		}
		if len(sets) == 1 {
			response.Validation(w, map[string]string{"body": "No changes provided."})
			return
		}

		args = append(args, id, tu.TenantID)
		q := fmt.Sprintf(`update public.mfg_work_orders set %s where id = $%d and tenant_id = $%d and status = 'draft'`,
			strings.Join(sets, ", "), n, n+1)
		tag, err := pool.Exec(r.Context(), q, args...)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Work order not found.", "ERR_NOT_FOUND")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "manufacturing.work_order_update", "mfg_work_order", &id, nil, body)
		row, _ := loadWorkOrder(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Work order updated.")
	}
}

func releaseWorkOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.mfg_work_orders
			set status = 'released', released_at = now(), updated_at = now()
			where id = $1 and tenant_id = $2 and status = 'draft'`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Validation(w, map[string]string{"status": "Only draft work orders can be released."})
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "manufacturing.work_order_release", "mfg_work_order", &id, nil, nil)
		row, _ := loadWorkOrder(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Work order released.")
	}
}

func completeWorkOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var completeBody workOrderCompleteBody
		if r.ContentLength > 0 {
			_ = json.NewDecoder(r.Body).Decode(&completeBody)
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to complete work order.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var wo WorkOrder
		var status, inspectionStatus string
		err = tx.QueryRow(r.Context(), `
			select wo.id, wo.work_order_no, wo.bom_id, wo.finished_item_id, wo.location_id,
			  wo.qty_to_produce::float8, wo.qty_produced::float8, wo.status, wo.inspection_status
			from public.mfg_work_orders wo
			where wo.id = $1 and wo.tenant_id = $2
			for update`, id, tu.TenantID).Scan(
			&wo.ID, &wo.WorkOrderNo, &wo.BomID, &wo.FinishedItemID, &wo.LocationID,
			&wo.QtyToProduce, &wo.QtyProduced, &status, &inspectionStatus)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				response.Err(w, http.StatusNotFound, "Work order not found.", "ERR_NOT_FOUND")
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to load work order.", "ERR_INTERNAL")
			return
		}
		if status != "released" {
			response.Validation(w, map[string]string{"status": "Only released work orders can be completed."})
			return
		}
		if inspectionStatus != "released" {
			response.Validation(w, map[string]string{"inspection_status": "Work order must pass FG inspection before completion."})
			return
		}

		bom, err := loadBom(r.Context(), tx, tu.TenantID, wo.BomID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "BOM not found.", "ERR_INTERNAL")
			return
		}

		bomType := normalizeBomType(bom.BomType)
		actualInputQty := wo.QtyToProduce
		if completeBody.ActualInputQty != nil && *completeBody.ActualInputQty > 0 {
			actualInputQty = *completeBody.ActualInputQty
		}
		qtyProduced := wo.QtyToProduce
		if completeBody.QtyProduced != nil && *completeBody.QtyProduced > 0 {
			qtyProduced = *completeBody.QtyProduced
		} else if bomType == "assembly" && completeBody.ActualInputQty != nil && *completeBody.ActualInputQty > 0 {
			// Assembly Finish dialog posts actual produced as actual_input_qty for compatibility.
			qtyProduced = *completeBody.ActualInputQty
		}

		if bomType == "disassembly" {
			fgSettings, err := inventory.LoadItemTrackingSettings(r.Context(), tx, tu.TenantID, wo.FinishedItemID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load finished item settings.", "ERR_INTERNAL")
				return
			}
			if fgSettings.TrackSerial || fgSettings.TrackLot {
				if err := consumeWoIssueTrace(r.Context(), tx, tu.TenantID, id, wo.LocationID, wo.FinishedItemID, actualInputQty, tu.AppUserID); err != nil {
					response.Validation(w, map[string]string{"stock": err.Error()})
					return
				}
			} else if completeBody.InputLotBatchID != nil && *completeBody.InputLotBatchID > 0 {
				var lotItemID, lotLocationID int64
				var lotQty float64
				err := tx.QueryRow(r.Context(), `
					select item_id, location_id, qty_on_hand::float8
					from public.inv_lot_batches
					where id = $1 and tenant_id = $2 for update`, *completeBody.InputLotBatchID, tu.TenantID).Scan(&lotItemID, &lotLocationID, &lotQty)
				if err != nil {
					response.Validation(w, map[string]string{"input_lot_batch_id": "Input lot batch not found."})
					return
				}
				if lotItemID != wo.FinishedItemID || lotLocationID != wo.LocationID {
					response.Validation(w, map[string]string{"input_lot_batch_id": "Input lot must match finished item and location."})
					return
				}
				if lotQty+0.0001 < actualInputQty {
					response.Validation(w, map[string]string{"actual_input_qty": "Insufficient qty on input lot batch."})
					return
				}
				tag, err := tx.Exec(r.Context(), `
					update public.inv_lot_batches
					set qty_on_hand = qty_on_hand - $1, updated_at = now()
					where id = $2 and tenant_id = $3 and qty_on_hand >= $1`,
					actualInputQty, *completeBody.InputLotBatchID, tu.TenantID)
				if err != nil || tag.RowsAffected() == 0 {
					response.Validation(w, map[string]string{"input_lot_batch_id": "Failed to consume input lot batch."})
					return
				}
				if err := inventory.InsertLotEvent(r.Context(), tx, inventory.LotEventInput{
					TenantID:        tu.TenantID,
					LotBatchID:      *completeBody.InputLotBatchID,
					EventType:       "consumed",
					FromLocationID:  &lotLocationID,
					Qty:             actualInputQty,
					RefType:         "mfg_work_order",
					RefID:           &id,
					CreatedByUserID: &tu.AppUserID,
				}); err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to record lot event.", "ERR_INTERNAL")
					return
				}
			} else if !fgSettings.TrackSerial && !fgSettings.TrackLot {
				if err := inventory.ApplyStockDelta(r.Context(), tx, tu.TenantID, wo.FinishedItemID, wo.LocationID, -actualInputQty, tu.AppUserID, "mfg_work_order", id, "wo_disassembly_issue"); err != nil {
					response.Validation(w, map[string]string{"stock": err.Error()})
					return
				}
			}
			var cutPostedTotal float64
			for _, ln := range bom.Lines {
				plannedRecv, unitCode, err := StockIssueForLine(r.Context(), tx, tu.TenantID, ln, actualInputQty, bom.OutputQty, bom.YieldPct)
				if err != nil {
					response.Validation(w, map[string]string{"stock": err.Error()})
					return
				}
				compSettings, err := inventory.LoadItemTrackingSettings(r.Context(), tx, tu.TenantID, ln.ComponentItemID)
				if err != nil {
					response.Validation(w, map[string]string{"stock": err.Error()})
					return
				}
				weighs := filterOutputWeighs(completeBody.OutputWeighs, ln.ComponentItemID)
				if len(weighs) == 0 {
					weighs, err = loadStagedComponentOutputWeighs(r.Context(), tx, tu.TenantID, id, ln.ComponentItemID)
					if err != nil {
						response.Validation(w, map[string]string{"stock": err.Error()})
						return
					}
				}
				if compSettings.TrackLot {
					if len(weighs) == 0 {
						weighs = []woOutputWeigh{{
							ComponentItemID: ln.ComponentItemID,
							LotNo:           fmt.Sprintf("WO-%s-C%d", wo.WorkOrderNo, ln.ComponentItemID),
							Qty:             plannedRecv,
						}}
					}
					for i := range weighs {
						ow := &weighs[i]
						qty := ow.Qty
						if ow.CatchWeight != nil && *ow.CatchWeight > 0 {
							qty = *ow.CatchWeight
						}
						if qty <= 0 {
							response.Validation(w, map[string]string{"output_weighs": "Cut lot qty must be greater than zero."})
							return
						}
						if err := receiveDisassemblyCutLot(r.Context(), tx, tu.TenantID, wo.LocationID, ln.ComponentItemID, ow.LotNo, qty, ow.ExpiryDate, compSettings.DefaultShelfLifeDays, tu.AppUserID, id); err != nil {
							label := ln.ComponentCode
							if label == "" {
								label = fmt.Sprintf("item %d", ln.ComponentItemID)
							}
							response.Validation(w, map[string]string{"stock": fmt.Sprintf("failed to receive cut lot for %s: %v", label, err)})
							return
						}
						cutPostedTotal += qty
					}
					_ = markStagedComponentLotsPosted(r.Context(), tx, id, ln.ComponentItemID)
				} else {
					recvQty := plannedRecv
					if len(weighs) > 0 {
						recvQty = 0
						for _, w := range weighs {
							q := w.Qty
							if w.CatchWeight != nil && *w.CatchWeight > 0 {
								q = *w.CatchWeight
							}
							recvQty += q
						}
					}
					if err := inventory.ApplyStockDelta(r.Context(), tx, tu.TenantID, ln.ComponentItemID, wo.LocationID, recvQty, tu.AppUserID, "mfg_work_order", id, "wo_disassembly_receipt"); err != nil {
						label := ln.ComponentCode
						if label == "" {
							label = fmt.Sprintf("item %d", ln.ComponentItemID)
						}
						msg := err.Error()
						if strings.Contains(msg, "insufficient") || strings.Contains(msg, "no balance") {
							msg = fmt.Sprintf("failed to receive %s: %.4f %s", label, recvQty, unitCode)
						}
						response.Validation(w, map[string]string{"stock": msg})
						return
					}
					cutPostedTotal += recvQty
					_ = markStagedComponentLotsPosted(r.Context(), tx, id, ln.ComponentItemID)
				}
			}
			if cutPostedTotal > 0 {
				qtyProduced = cutPostedTotal
			}
		} else {
			fgSettings, err := inventory.LoadItemTrackingSettings(r.Context(), tx, tu.TenantID, wo.FinishedItemID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load finished item settings.", "ERR_INTERNAL")
				return
			}
			if fgSettings.TrackSerial || fgSettings.TrackLot {
				if staged, err := stagedAssemblyOutputQty(r.Context(), tx, id, fgSettings.TrackSerial, fgSettings.TrackLot); err == nil && staged > 0 {
					qtyProduced = staged
				}
			}
			for _, ln := range bom.Lines {
				issueQty, unitCode, err := StockIssueForLine(r.Context(), tx, tu.TenantID, ln, qtyProduced, bom.OutputQty, bom.YieldPct)
				if err != nil {
					response.Validation(w, map[string]string{"stock": err.Error()})
					return
				}
				compSettings, err := inventory.LoadItemTrackingSettings(r.Context(), tx, tu.TenantID, ln.ComponentItemID)
				if err != nil {
					response.Validation(w, map[string]string{"stock": err.Error()})
					return
				}
				if compSettings.TrackSerial || compSettings.TrackLot {
					if err := consumeWoIssueTrace(r.Context(), tx, tu.TenantID, id, wo.LocationID, ln.ComponentItemID, issueQty, tu.AppUserID); err != nil {
						label := ln.ComponentCode
						if label == "" {
							label = fmt.Sprintf("item %d", ln.ComponentItemID)
						}
						response.Validation(w, map[string]string{"stock": fmt.Sprintf("insufficient staged issue for %s: %s", label, err.Error())})
						return
					}
				} else if err := inventory.ApplyStockDelta(r.Context(), tx, tu.TenantID, ln.ComponentItemID, wo.LocationID, -issueQty, tu.AppUserID, "mfg_work_order", id, "wo_backflush_issue"); err != nil {
					label := ln.ComponentCode
					if label == "" {
						label = fmt.Sprintf("item %d", ln.ComponentItemID)
					}
					msg := err.Error()
					if strings.Contains(msg, "insufficient") || strings.Contains(msg, "no balance") {
						msg = fmt.Sprintf("insufficient stock for %s: need %.4f %s at location", label, issueQty, unitCode)
					}
					response.Validation(w, map[string]string{"stock": msg})
					return
				}
			}
			if fgSettings.TrackSerial || fgSettings.TrackLot {
				if err := postWoOutputTrace(r.Context(), tx, tu.TenantID, id, wo.LocationID, wo.FinishedItemID, qtyProduced, tu.AppUserID, bom.FinishedItemCode, fgSettings.DefaultShelfLifeDays); err != nil {
					response.Validation(w, map[string]string{"stock": err.Error()})
					return
				}
			} else if err := inventory.ApplyStockDelta(r.Context(), tx, tu.TenantID, wo.FinishedItemID, wo.LocationID, qtyProduced, tu.AppUserID, "mfg_work_order", id, "wo_backflush_receipt"); err != nil {
				response.Validation(w, map[string]string{"stock": err.Error()})
				return
			}
			actualInputQty = qtyProduced
		}

		tag, err := tx.Exec(r.Context(), `
			update public.mfg_work_orders
			set status = 'completed', qty_produced = $5, completed_at = now(), updated_at = now(),
			  actual_input_qty = $3, input_lot_batch_id = $4
			where id = $1 and tenant_id = $2 and status = 'released'`, id, tu.TenantID, actualInputQty, completeBody.InputLotBatchID, qtyProduced)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusConflict, "Work order already completed.", "ERR_CONFLICT")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to complete work order.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "manufacturing.work_order_complete", "mfg_work_order", &id, nil, completeBody)
		row, _ := loadWorkOrder(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Work order completed.")
	}
}

func getWorkOrderMaterialNeeds(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		wo, err := loadWorkOrder(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				response.Err(w, http.StatusNotFound, "Work order not found.", "ERR_NOT_FOUND")
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to load work order.", "ERR_INTERNAL")
			return
		}
		bom, err := loadBom(r.Context(), pool, tu.TenantID, wo.BomID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "BOM not found.", "ERR_INTERNAL")
			return
		}
		out, err := buildMaterialNeeds(r.Context(), pool, tu.TenantID, wo, bom)
		if err != nil {
			response.Validation(w, map[string]string{"lines": err.Error()})
			return
		}
		response.OK(w, out, "OK")
	}
}

func buildMaterialNeeds(ctx context.Context, pool *pgxpool.Pool, tenantID int64, wo WorkOrder, bom Bom) (MaterialNeeds, error) {
	bomType := normalizeBomType(bom.BomType)
	out := MaterialNeeds{
		WorkOrderID:          wo.ID,
		BomType:              bomType,
		QtyToProduce:         wo.QtyToProduce,
		FinishedBaseUnitCode: wo.FinishedBaseUnit,
		OutputQty:            bom.OutputQty,
		YieldPct:             bom.YieldPct,
		ReceiveQty:           wo.QtyToProduce,
		Lines:                []MaterialNeedLine{},
	}

	itemOnHand := func(itemID int64) float64 {
		var onHand float64
		_ = pool.QueryRow(ctx, `
			select coalesce(qty_on_hand, 0)::float8 from public.inv_item_location_balances
			where tenant_id=$1 and item_id=$2 and location_id=$3`,
			tenantID, itemID, wo.LocationID).Scan(&onHand)
		return onHand
	}

	appendLine := func(ln BomLine, stock float64, unitCode string) MaterialNeedLine {
		onHand := itemOnHand(ln.ComponentItemID)
		shortage := 0.0
		if stock > onHand+0.0001 {
			shortage = stock - onHand
		}
		unitCodeBom := ln.UnitCode
		if unitCodeBom == "" {
			unitCodeBom = ln.BaseUnitCode
		}
		return MaterialNeedLine{
			ComponentItemID: ln.ComponentItemID,
			ComponentCode:   ln.ComponentCode,
			ComponentName:   ln.ComponentName,
			BomQty:          ln.Qty,
			BomUnitCode:     unitCodeBom,
			ScrapQty:        ln.ScrapQty,
			StockToIssue:    stock,
			StockUnitCode:   unitCode,
			QtyOnHand:       onHand,
			Shortage:        shortage,
		}
	}

	if bomType == "disassembly" {
		// Whole/input to consume = job qty in finished-item base UoM (not StockIssueForLine with Qty=0).
		inputStock := wo.QtyToProduce
		unitCode := wo.FinishedBaseUnit
		inputLine := appendLine(BomLine{
			ComponentItemID: wo.FinishedItemID,
			ComponentCode:   wo.FinishedItemCode,
			ComponentName:   wo.FinishedItemName,
			BaseUnitCode:    wo.FinishedBaseUnit,
		}, inputStock, unitCode)
		out.InputLine = &inputLine
		out.ReceiveQty = 0
		for _, ln := range bom.Lines {
			plannedRecv, recvUnit, err := StockIssueForLine(ctx, pool, tenantID, ln, wo.QtyToProduce, bom.OutputQty, bom.YieldPct)
			if err != nil {
				return MaterialNeeds{}, err
			}
			line := appendLine(ln, plannedRecv, recvUnit)
			_ = pool.QueryRow(ctx, `
				select coalesce(sum(coalesce(catch_weight, qty)), 0)::float8
				from public.mfg_wo_output_lots
				where tenant_id = $1 and work_order_id = $2 and component_item_id = $3 and status = 'staged'`,
				tenantID, wo.ID, ln.ComponentItemID).Scan(&line.StagedQty)
			if st, err := inventory.LoadItemTrackingSettings(ctx, pool, tenantID, ln.ComponentItemID); err == nil {
				line.TrackLot = st.TrackLot
			}
			out.Lines = append(out.Lines, line)
			out.ReceiveQty += plannedRecv
		}
		return out, nil
	}

	for _, ln := range bom.Lines {
		stock, unitCode, err := StockIssueForLine(ctx, pool, tenantID, ln, wo.QtyToProduce, bom.OutputQty, bom.YieldPct)
		if err != nil {
			return MaterialNeeds{}, err
		}
		out.Lines = append(out.Lines, appendLine(ln, stock, unitCode))
	}
	return out, nil
}

func loadWorkOrder(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (WorkOrder, error) {
	var row WorkOrder
	var notes *string
	var created, released, completed, inspectedAt *string
	var inspectionNotes *string
	var soNo *string
	err := pool.QueryRow(ctx, `
		select wo.id, wo.work_order_no, wo.bom_id, b.bom_code, b.bom_name,
		  coalesce(b.bom_type, 'assembly'),
		  wo.finished_item_id, coalesce(fi.item_code, ''), coalesce(fi.item_name, ''),
		  coalesce(bu.code, coalesce(nullif(trim(fi.unit), ''), 'ea')),
		  wo.location_id, coalesce(loc.location_name, ''),
		  wo.qty_to_produce::float8, wo.qty_produced::float8, wo.status,
		  wo.order_date::text, wo.notes,
		  wo.created_at::text, wo.released_at::text, wo.completed_at::text,
		  wo.actual_input_qty::float8, wo.input_lot_batch_id,
		  wo.inspection_status, wo.inspection_notes, wo.inspected_at::text,
		  wo.source_sales_order_id, wo.source_sales_order_line_id, so.sales_order_no,
		  coalesce(fi.track_serial, false), coalesce(fi.track_lot, false),
		  exists (
		    select 1 from public.mfg_bom_lines bl
		    join public.inv_items ci on ci.id = bl.component_item_id
		    where bl.bom_id = wo.bom_id
		      and (coalesce(ci.track_serial, false) or coalesce(ci.track_lot, false))
		  )
		from public.mfg_work_orders wo
		join public.mfg_boms b on b.id = wo.bom_id
		join public.inv_items fi on fi.id = wo.finished_item_id
		left join public.inv_units bu on bu.id = fi.base_unit_id
		left join public.inv_locations loc on loc.id = wo.location_id
		left join public.so_sales_orders so on so.id = wo.source_sales_order_id
		where wo.id=$1 and wo.tenant_id=$2`, id, tenantID).Scan(
		&row.ID, &row.WorkOrderNo, &row.BomID, &row.BomCode, &row.BomName, &row.BomType,
		&row.FinishedItemID, &row.FinishedItemCode, &row.FinishedItemName, &row.FinishedBaseUnit,
		&row.LocationID, &row.LocationName,
		&row.QtyToProduce, &row.QtyProduced, &row.Status,
		&row.OrderDate, &notes, &created, &released, &completed, &row.ActualInputQty, &row.InputLotBatchID,
		&row.InspectionStatus, &inspectionNotes, &inspectedAt,
		&row.SourceSalesOrderID, &row.SourceSalesOrderLineID, &soNo,
		&row.FinishedTrackSerial, &row.FinishedTrackLot, &row.ComponentsTracked)
	if err != nil {
		return WorkOrder{}, err
	}
	row.Notes = notes
	row.CreatedAt = created
	row.ReleasedAt = released
	row.CompletedAt = completed
	if completed != nil {
		row.TransactedAt = completed
	} else if released != nil {
		row.TransactedAt = released
	} else {
		row.TransactedAt = created
	}
	row.InspectionNotes = inspectionNotes
	row.InspectedAt = inspectedAt
	row.SourceSalesOrderNo = soNo
	return row, nil
}

func validateWorkOrderBody(b workOrderBody) map[string]string {
	errs := map[string]string{}
	if b.BomID <= 0 {
		errs["bom_id"] = "BOM is required."
	}
	if b.QtyToProduce <= 0 {
		errs["qty_to_produce"] = "Quantity must be greater than zero."
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func initialWorkOrderInspectionStatus(ctx context.Context, pool *pgxpool.Pool, tenantID int64) string {
	pol, err := processpolicy.Load(ctx, pool, tenantID)
	if err != nil || !pol.ManufacturingRequireFgQc {
		return "released"
	}
	return "pending"
}

func filterOutputWeighs(weighs []woOutputWeigh, componentItemID int64) []woOutputWeigh {
	var out []woOutputWeigh
	for _, w := range weighs {
		if w.ComponentItemID == componentItemID {
			out = append(out, w)
		}
	}
	return out
}

func loadStagedComponentOutputWeighs(ctx context.Context, tx pgx.Tx, tenantID, woID, componentItemID int64) ([]woOutputWeigh, error) {
	rows, err := tx.Query(ctx, `
		select lot_no, qty::float8, catch_weight::float8, expiry_date::text
		from public.mfg_wo_output_lots
		where tenant_id = $1 and work_order_id = $2 and component_item_id = $3 and status = 'staged'
		order by id`, tenantID, woID, componentItemID)
	if err != nil {
		// Column may be missing before migration 279 — treat as no staged cuts.
		if strings.Contains(err.Error(), "component_item_id") {
			return nil, nil
		}
		return nil, err
	}
	defer rows.Close()
	var out []woOutputWeigh
	for rows.Next() {
		var lotNo string
		var qty float64
		var cw *float64
		var exp *string
		if err := rows.Scan(&lotNo, &qty, &cw, &exp); err != nil {
			return nil, err
		}
		out = append(out, woOutputWeigh{
			ComponentItemID: componentItemID,
			LotNo:           lotNo,
			Qty:             qty,
			CatchWeight:     cw,
			ExpiryDate:      exp,
		})
	}
	return out, rows.Err()
}

func markStagedComponentLotsPosted(ctx context.Context, tx pgx.Tx, woID, componentItemID int64) error {
	_, err := tx.Exec(ctx, `
		update public.mfg_wo_output_lots set status = 'posted'
		where work_order_id = $1 and component_item_id = $2 and status = 'staged'`, woID, componentItemID)
	if err != nil && strings.Contains(err.Error(), "component_item_id") {
		return nil
	}
	return err
}

func receiveDisassemblyCutLot(
	ctx context.Context, tx pgx.Tx, tenantID, locationID, itemID int64,
	lotNo string, qty float64, expiryDate *string, shelfDays *int, userID, woID int64,
) error {
	lotNo = strings.TrimSpace(lotNo)
	if lotNo == "" {
		return fmt.Errorf("lot number required")
	}
	var expiry any
	if expiryDate != nil && strings.TrimSpace(*expiryDate) != "" {
		d, err := parseDate(strings.TrimSpace(*expiryDate))
		if err != nil {
			return fmt.Errorf("invalid expiry date")
		}
		expiry = d
	} else if shelfDays != nil && *shelfDays > 0 {
		expiry = time.Now().UTC().AddDate(0, 0, *shelfDays)
	} else {
		expiry = nil
	}
	var lotBatchID int64
	err := tx.QueryRow(ctx, `
		insert into public.inv_lot_batches (
		  tenant_id, item_id, lot_no, location_id, qty_on_hand, expiry_date
		) values ($1, $2, $3, $4, $5, $6)
		on conflict (tenant_id, item_id, lot_no, location_id)
		do update set
		  qty_on_hand = inv_lot_batches.qty_on_hand + excluded.qty_on_hand,
		  expiry_date = coalesce(excluded.expiry_date, inv_lot_batches.expiry_date),
		  updated_at = now()
		returning id`,
		tenantID, itemID, lotNo, locationID, qty, expiry).Scan(&lotBatchID)
	if err != nil {
		return err
	}
	if err := inventory.InsertLotEvent(ctx, tx, inventory.LotEventInput{
		TenantID:        tenantID,
		LotBatchID:      lotBatchID,
		EventType:       "produced",
		ToLocationID:    &locationID,
		Qty:             qty,
		RefType:         "mfg_work_order",
		RefID:           &woID,
		CreatedByUserID: &userID,
	}); err != nil {
		return err
	}
	return inventory.ApplyStockDelta(ctx, tx, tenantID, itemID, locationID, qty, userID, "mfg_work_order", woID, "wo_disassembly_receipt")
}

func stagedAssemblyOutputQty(ctx context.Context, tx pgx.Tx, woID int64, trackSerial, trackLot bool) (float64, error) {
	if trackSerial {
		var n int64
		err := tx.QueryRow(ctx, `
			select count(*) from public.mfg_wo_output_serials
			where work_order_id = $1 and status = 'staged'`, woID).Scan(&n)
		return float64(n), err
	}
	if trackLot {
		var qty float64
		err := tx.QueryRow(ctx, `
			select coalesce(sum(coalesce(catch_weight, qty)), 0)::float8
			from public.mfg_wo_output_lots
			where work_order_id = $1 and status = 'staged' and component_item_id is null`, woID).Scan(&qty)
		if err != nil {
			return 0, err
		}
		if qty > 0 {
			return qty, nil
		}
		// Older rows may omit null component_item_id filter.
		err = tx.QueryRow(ctx, `
			select coalesce(sum(coalesce(catch_weight, qty)), 0)::float8
			from public.mfg_wo_output_lots
			where work_order_id = $1 and status = 'staged'`, woID).Scan(&qty)
		return qty, err
	}
	return 0, nil
}
