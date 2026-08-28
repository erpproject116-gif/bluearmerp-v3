package manufacturing

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/inventory"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type WorkOrder struct {
	ID                 int64   `json:"id"`
	WorkOrderNo        string  `json:"work_order_no"`
	BomID              int64   `json:"bom_id"`
	BomCode            string  `json:"bom_code,omitempty"`
	BomName            string  `json:"bom_name,omitempty"`
	FinishedItemID     int64   `json:"finished_item_id"`
	FinishedItemCode   string  `json:"finished_item_code,omitempty"`
	FinishedItemName   string  `json:"finished_item_name,omitempty"`
	FinishedBaseUnit   string  `json:"finished_base_unit_code,omitempty"`
	LocationID         int64   `json:"location_id"`
	LocationName       string  `json:"location_name,omitempty"`
	QtyToProduce       float64 `json:"qty_to_produce"`
	QtyProduced        float64 `json:"qty_produced"`
	Status             string  `json:"status"`
	OrderDate          string  `json:"order_date"`
	Notes              *string `json:"notes,omitempty"`
	ReleasedAt         *string  `json:"released_at,omitempty"`
	CompletedAt        *string  `json:"completed_at,omitempty"`
	ActualInputQty     *float64 `json:"actual_input_qty,omitempty"`
	InputLotBatchID    *int64   `json:"input_lot_batch_id,omitempty"`
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
}

type MaterialNeeds struct {
	WorkOrderID          int64              `json:"work_order_id"`
	QtyToProduce         float64            `json:"qty_to_produce"`
	FinishedBaseUnitCode string             `json:"finished_base_unit_code"`
	OutputQty            float64            `json:"output_qty"`
	YieldPct             float64            `json:"yield_pct"`
	ReceiveQty           float64            `json:"receive_qty"`
	Lines                []MaterialNeedLine `json:"lines"`
}

type workOrderBody struct {
	BomID        int64   `json:"bom_id"`
	LocationID   int64   `json:"location_id"`
	QtyToProduce float64 `json:"qty_to_produce"`
	OrderDate    string  `json:"order_date"`
	Notes        *string `json:"notes"`
}

type workOrderPatchBody struct {
	LocationID   *int64   `json:"location_id"`
	QtyToProduce *float64 `json:"qty_to_produce"`
	OrderDate    *string  `json:"order_date"`
	Notes        *string  `json:"notes"`
	Status       *string  `json:"status"`
}

type workOrderCompleteBody struct {
	ActualInputQty  *float64 `json:"actual_input_qty"`
	InputLotBatchID *int64   `json:"input_lot_batch_id"`
}

func listWorkOrders(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"work_order_no": "wo.work_order_no",
		"order_date":    "wo.order_date",
		"status":        "wo.status",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "order_date", allowed)
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

		sortCol := allowed[p.Sort]
		if sortCol == "" {
			sortCol = "wo.order_date"
		}
		q := fmt.Sprintf(`
			select wo.id, wo.work_order_no, wo.bom_id, b.bom_code, b.bom_name,
			  wo.finished_item_id, coalesce(fi.item_code, ''), coalesce(fi.item_name, ''),
			  coalesce(bu.code, coalesce(nullif(trim(fi.unit), ''), 'ea')),
			  wo.location_id, coalesce(loc.location_name, ''),
			  wo.qty_to_produce::float8, wo.qty_produced::float8, wo.status,
			  wo.order_date::text, wo.notes, wo.released_at::text, wo.completed_at::text,
			  wo.actual_input_qty::float8, wo.input_lot_batch_id,
			  count(*) over()
			from public.mfg_work_orders wo
			join public.mfg_boms b on b.id = wo.bom_id
			join public.inv_items fi on fi.id = wo.finished_item_id
			left join public.inv_units bu on bu.id = fi.base_unit_id
			left join public.inv_locations loc on loc.id = wo.location_id
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
			var released, completed *string
			if err := rows.Scan(
				&row.ID, &row.WorkOrderNo, &row.BomID, &row.BomCode, &row.BomName,
				&row.FinishedItemID, &row.FinishedItemCode, &row.FinishedItemName, &row.FinishedBaseUnit,
				&row.LocationID, &row.LocationName,
				&row.QtyToProduce, &row.QtyProduced, &row.Status,
				&row.OrderDate, &notes, &released, &completed,
				&row.ActualInputQty, &row.InputLotBatchID, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read work order.", "ERR_INTERNAL")
				return
			}
			row.Notes = notes
			row.ReleasedAt = released
			row.CompletedAt = completed
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
			response.Err(w, http.StatusNotFound, "Work order not found.", "ERR_NOT_FOUND")
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
		var id int64
		err = pool.QueryRow(r.Context(), `
			insert into public.mfg_work_orders (
			  tenant_id, work_order_no, bom_id, finished_item_id, location_id,
			  qty_to_produce, order_date, notes, created_by_user_id
			) values ($1,$2,$3,$4,$5,$6,$7::date,$8,$9)
			returning id`,
			tu.TenantID, woNo, body.BomID, bom.FinishedItemID, locationID,
			body.QtyToProduce, orderDate.Format("2006-01-02"), body.Notes, tu.AppUserID,
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
		var status string
		err = tx.QueryRow(r.Context(), `
			select wo.id, wo.work_order_no, wo.bom_id, wo.finished_item_id, wo.location_id,
			  wo.qty_to_produce::float8, wo.qty_produced::float8, wo.status
			from public.mfg_work_orders wo
			where wo.id = $1 and wo.tenant_id = $2
			for update`, id, tu.TenantID).Scan(
			&wo.ID, &wo.WorkOrderNo, &wo.BomID, &wo.FinishedItemID, &wo.LocationID,
			&wo.QtyToProduce, &wo.QtyProduced, &status)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Work order not found.", "ERR_NOT_FOUND")
			return
		}
		if status != "released" {
			response.Validation(w, map[string]string{"status": "Only released work orders can be completed."})
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

		if bomType == "disassembly" {
			if completeBody.InputLotBatchID != nil && *completeBody.InputLotBatchID > 0 {
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
			}
			if err := inventory.ApplyStockDelta(r.Context(), tx, tu.TenantID, wo.FinishedItemID, wo.LocationID, -actualInputQty, tu.AppUserID, "mfg_work_order", id, "wo_disassembly_issue"); err != nil {
				response.Validation(w, map[string]string{"stock": err.Error()})
				return
			}
			for _, ln := range bom.Lines {
				recvQty, unitCode, err := StockIssueForLine(r.Context(), tx, tu.TenantID, ln, actualInputQty, bom.OutputQty, bom.YieldPct)
				if err != nil {
					response.Validation(w, map[string]string{"stock": err.Error()})
					return
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
			}
		} else {
			for _, ln := range bom.Lines {
				issueQty, unitCode, err := StockIssueForLine(r.Context(), tx, tu.TenantID, ln, wo.QtyToProduce, bom.OutputQty, bom.YieldPct)
				if err != nil {
					response.Validation(w, map[string]string{"stock": err.Error()})
					return
				}
				if err := inventory.ApplyStockDelta(r.Context(), tx, tu.TenantID, ln.ComponentItemID, wo.LocationID, -issueQty, tu.AppUserID, "mfg_work_order", id, "wo_backflush_issue"); err != nil {
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
			if err := inventory.ApplyStockDelta(r.Context(), tx, tu.TenantID, wo.FinishedItemID, wo.LocationID, wo.QtyToProduce, tu.AppUserID, "mfg_work_order", id, "wo_backflush_receipt"); err != nil {
				response.Validation(w, map[string]string{"stock": err.Error()})
				return
			}
			actualInputQty = wo.QtyToProduce
		}

		tag, err := tx.Exec(r.Context(), `
			update public.mfg_work_orders
			set status = 'completed', qty_produced = qty_to_produce, completed_at = now(), updated_at = now(),
			  actual_input_qty = $3, input_lot_batch_id = $4
			where id = $1 and tenant_id = $2 and status = 'released'`, id, tu.TenantID, actualInputQty, completeBody.InputLotBatchID)
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
			response.Err(w, http.StatusNotFound, "Work order not found.", "ERR_NOT_FOUND")
			return
		}
		bom, err := loadBom(r.Context(), pool, tu.TenantID, wo.BomID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "BOM not found.", "ERR_INTERNAL")
			return
		}
		out := MaterialNeeds{
			WorkOrderID:          wo.ID,
			QtyToProduce:         wo.QtyToProduce,
			FinishedBaseUnitCode: wo.FinishedBaseUnit,
			OutputQty:            bom.OutputQty,
			YieldPct:             bom.YieldPct,
			ReceiveQty:           wo.QtyToProduce,
			Lines:                []MaterialNeedLine{},
		}
		for _, ln := range bom.Lines {
			stock, unitCode, err := StockIssueForLine(r.Context(), pool, tu.TenantID, ln, wo.QtyToProduce, bom.OutputQty, bom.YieldPct)
			if err != nil {
				response.Validation(w, map[string]string{"lines": err.Error()})
				return
			}
			var onHand float64
			_ = pool.QueryRow(r.Context(), `
				select coalesce(qty_on_hand, 0)::float8 from public.inv_item_location_balances
				where tenant_id=$1 and item_id=$2 and location_id=$3`,
				tu.TenantID, ln.ComponentItemID, wo.LocationID).Scan(&onHand)
			shortage := 0.0
			if stock > onHand+0.0001 {
				shortage = stock - onHand
			}
			unitCodeBom := ln.UnitCode
			if unitCodeBom == "" {
				unitCodeBom = ln.BaseUnitCode
			}
			out.Lines = append(out.Lines, MaterialNeedLine{
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
			})
		}
		response.OK(w, out, "OK")
	}
}

func loadWorkOrder(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (WorkOrder, error) {
	var row WorkOrder
	var notes *string
	var released, completed *string
	err := pool.QueryRow(ctx, `
		select wo.id, wo.work_order_no, wo.bom_id, b.bom_code, b.bom_name,
		  wo.finished_item_id, coalesce(fi.item_code, ''), coalesce(fi.item_name, ''),
		  coalesce(bu.code, coalesce(nullif(trim(fi.unit), ''), 'ea')),
		  wo.location_id, coalesce(loc.location_name, ''),
		  wo.qty_to_produce::float8, wo.qty_produced::float8, wo.status,
		  wo.order_date::text, wo.notes, wo.released_at::text, wo.completed_at::text,
		  wo.actual_input_qty::float8, wo.input_lot_batch_id
		from public.mfg_work_orders wo
		join public.mfg_boms b on b.id = wo.bom_id
		join public.inv_items fi on fi.id = wo.finished_item_id
		left join public.inv_units bu on bu.id = fi.base_unit_id
		left join public.inv_locations loc on loc.id = wo.location_id
		where wo.id=$1 and wo.tenant_id=$2`, id, tenantID).Scan(
		&row.ID, &row.WorkOrderNo, &row.BomID, &row.BomCode, &row.BomName,
		&row.FinishedItemID, &row.FinishedItemCode, &row.FinishedItemName, &row.FinishedBaseUnit,
		&row.LocationID, &row.LocationName,
		&row.QtyToProduce, &row.QtyProduced, &row.Status,
		&row.OrderDate, &notes, &released, &completed, &row.ActualInputQty, &row.InputLotBatchID)
	if err != nil {
		return WorkOrder{}, err
	}
	row.Notes = notes
	row.ReleasedAt = released
	row.CompletedAt = completed
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
