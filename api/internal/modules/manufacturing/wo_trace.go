package manufacturing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
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
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const maxWoOutputBatchSize = 100

type woIssueSerialsBody struct {
	SerialUnitIDs []int64 `json:"serial_unit_ids"`
}

type woIssueLotLine struct {
	LotBatchID int64   `json:"lot_batch_id"`
	Qty        float64 `json:"qty"`
}

type woIssueLotsBody struct {
	Lines []woIssueLotLine `json:"lines"`
}

type woOutputSerialScan struct {
	SerialNo     string `json:"serial_no"`
	ClientScanID string `json:"client_scan_id,omitempty"`
}

type woOutputSerialBatchBody struct {
	Scans []woOutputSerialScan `json:"scans"`
}

type woOutputLotScan struct {
	LotNo           string   `json:"lot_no"`
	Qty             float64  `json:"qty"`
	ExpiryDate      *string  `json:"expiry_date,omitempty"`
	CatchWeight     *float64 `json:"catch_weight,omitempty"`
	ClientScanID    string   `json:"client_scan_id,omitempty"`
	ComponentItemID *int64   `json:"component_item_id,omitempty"`
}

type woOutputLotBatchBody struct {
	Scans []woOutputLotScan `json:"scans"`
}

type woOutputSerialScanResult struct {
	ClientScanID string `json:"client_scan_id,omitempty"`
	SerialNo     string `json:"serial_no"`
	Status       string `json:"status"`
	ID           *int64 `json:"id,omitempty"`
	Message      string `json:"message,omitempty"`
}

type woOutputLotScanResult struct {
	ClientScanID string  `json:"client_scan_id,omitempty"`
	LotNo        string  `json:"lot_no"`
	Qty          float64 `json:"qty,omitempty"`
	Status       string  `json:"status"`
	ID           *int64  `json:"id,omitempty"`
	Message      string  `json:"message,omitempty"`
}

type woScanContextComponent struct {
	ComponentItemID int64   `json:"component_item_id"`
	ComponentCode   string  `json:"component_code"`
	ComponentName   string  `json:"component_name"`
	StockToIssue    float64 `json:"stock_to_issue"`
	TrackSerial     bool    `json:"track_serial"`
	TrackLot        bool    `json:"track_lot"`
	IssuedSerials   int     `json:"issued_serials"`
	IssuedLotQty    float64 `json:"issued_lot_qty"`
}

type woScanContextPayload struct {
	WorkOrderID      int64                    `json:"work_order_id"`
	WorkOrderNo      string                   `json:"work_order_no"`
	Status           string                   `json:"status"`
	LocationID       int64                    `json:"location_id"`
	LocationName     string                   `json:"location_name"`
	FinishedItemID   int64                    `json:"finished_item_id"`
	FinishedItemCode string                   `json:"finished_item_code"`
	FinishedItemName string                   `json:"finished_item_name"`
	QtyToProduce     float64                  `json:"qty_to_produce"`
	TrackSerial      bool                     `json:"track_serial"`
	TrackLot         bool                     `json:"track_lot"`
	OutputSerials    int                      `json:"output_serials"`
	OutputLotQty     float64                  `json:"output_lot_qty"`
	Components       []woScanContextComponent `json:"components"`
}

func issueWorkOrderSerials(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		woID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body woIssueSerialsBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.SerialUnitIDs) == 0 {
			response.Validation(w, map[string]string{"serial_unit_ids": "At least one serial is required."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to issue serials.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		wo, bom, err := loadReleasedWorkOrderForTrace(r.Context(), tx, tu.TenantID, woID)
		if err != nil {
			respondReleasedWOLoadError(w, err, "Only released work orders accept issue scans.")
			return
		}
		componentIDs := bomComponentIDs(bom, wo.FinishedItemID, normalizeBomType(bom.BomType) == "disassembly")

		added := 0
		for _, unitID := range body.SerialUnitIDs {
			var itemID int64
			var serialNo string
			err := tx.QueryRow(r.Context(), `
				select su.item_id, su.serial_no
				from public.inv_serial_units su
				where su.id = $1 and su.tenant_id = $2 and su.location_id = $3
				  and su.status in ('in_stock', 'reserved')
				for update`, unitID, tu.TenantID, wo.LocationID).Scan(&itemID, &serialNo)
			if err != nil {
				response.Validation(w, map[string]string{"serial_unit_ids": fmt.Sprintf("Serial %d not available at location.", unitID)})
				return
			}
			if !componentIDs[itemID] {
				response.Validation(w, map[string]string{"serial_unit_ids": fmt.Sprintf("Serial %s is not a required component.", serialNo)})
				return
			}
			tag, err := tx.Exec(r.Context(), `
				insert into public.mfg_wo_issue_serials (tenant_id, work_order_id, component_item_id, serial_unit_id)
				values ($1, $2, $3, $4)
				on conflict (work_order_id, serial_unit_id) do nothing`,
				tu.TenantID, woID, itemID, unitID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to stage serial.", "ERR_INTERNAL")
				return
			}
			added += int(tag.RowsAffected())
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to issue serials.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "manufacturing.wo_issue_serials", "mfg_work_order", &woID, nil, body)
		response.OK(w, map[string]any{"added": added, "requested": len(body.SerialUnitIDs)}, "Serials staged.")
	}
}

func issueWorkOrderLots(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		woID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body woIssueLotsBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.Lines) == 0 {
			response.Validation(w, map[string]string{"lines": "At least one lot line is required."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to issue lots.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		wo, bom, err := loadReleasedWorkOrderForTrace(r.Context(), tx, tu.TenantID, woID)
		if err != nil {
			respondReleasedWOLoadError(w, err, "Only released work orders accept issue scans.")
			return
		}
		componentIDs := bomComponentIDs(bom, wo.FinishedItemID, normalizeBomType(bom.BomType) == "disassembly")

		added := 0
		for i, ln := range body.Lines {
			if ln.LotBatchID <= 0 {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].lot_batch_id", i): "Lot batch is required."})
				return
			}
			if ln.Qty <= 0 {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].qty", i): "Quantity must be greater than zero."})
				return
			}
			var itemID int64
			var lotQty float64
			err := tx.QueryRow(r.Context(), `
				select item_id, qty_on_hand::float8
				from public.inv_lot_batches
				where id = $1 and tenant_id = $2 and location_id = $3
				for update`, ln.LotBatchID, tu.TenantID, wo.LocationID).Scan(&itemID, &lotQty)
			if err != nil {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].lot_batch_id", i): "Lot batch not found at location."})
				return
			}
			if !componentIDs[itemID] {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].lot_batch_id", i): "Lot item is not a required component."})
				return
			}
			if lotQty+0.0001 < ln.Qty {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].qty", i): "Insufficient qty on lot batch."})
				return
			}
			_, err = tx.Exec(r.Context(), `
				insert into public.mfg_wo_issue_lots (tenant_id, work_order_id, component_item_id, lot_batch_id, qty)
				values ($1, $2, $3, $4, $5)`,
				tu.TenantID, woID, itemID, ln.LotBatchID, ln.Qty)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to stage lot.", "ERR_INTERNAL")
				return
			}
			added++
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to issue lots.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "manufacturing.wo_issue_lots", "mfg_work_order", &woID, nil, body)
		response.OK(w, map[string]any{"added": added}, "Lots staged.")
	}
}

func batchWorkOrderOutputSerials(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		woID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body woOutputSerialBatchBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.Scans) == 0 {
			response.Validation(w, map[string]string{"scans": "At least one scan is required."})
			return
		}
		if len(body.Scans) > maxWoOutputBatchSize {
			response.Validation(w, map[string]string{"scans": fmt.Sprintf("Maximum %d scans per batch.", maxWoOutputBatchSize)})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to stage output serials.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		wo, _, err := loadReleasedWorkOrderForTrace(r.Context(), tx, tu.TenantID, woID)
		if err != nil {
			respondReleasedWOLoadError(w, err, "Only released work orders accept output scans.")
			return
		}
		fgSettings, err := inventory.LoadItemTrackingSettings(r.Context(), tx, tu.TenantID, wo.FinishedItemID)
		if err != nil || !fgSettings.TrackSerial {
			response.Validation(w, map[string]string{"item": "Finished item does not track serial numbers."})
			return
		}

		results, err := processWoOutputSerialScans(r.Context(), tx, tu.TenantID, woID, body.Scans)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to stage output serials.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to stage output serials.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "manufacturing.wo_output_serial_batch", "mfg_work_order", &woID, nil, map[string]any{"count": len(body.Scans)})
		response.OK(w, map[string]any{"results": results}, "Batch processed.")
	}
}

func batchWorkOrderOutputLots(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		woID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body woOutputLotBatchBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.Scans) == 0 {
			response.Validation(w, map[string]string{"scans": "At least one lot entry is required."})
			return
		}
		if len(body.Scans) > maxWoOutputBatchSize {
			response.Validation(w, map[string]string{"scans": fmt.Sprintf("Maximum %d lot entries per batch.", maxWoOutputBatchSize)})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to stage output lots.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		wo, _, err := loadReleasedWorkOrderForTrace(r.Context(), tx, tu.TenantID, woID)
		if err != nil {
			respondReleasedWOLoadError(w, err, "Only released work orders accept output scans.")
			return
		}
		bom, err := loadBom(r.Context(), tx, tu.TenantID, wo.BomID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "BOM not found.", "ERR_INTERNAL")
			return
		}
		disassembly := normalizeBomType(bom.BomType) == "disassembly"
		hasComponentScans := false
		for _, sc := range body.Scans {
			if sc.ComponentItemID != nil && *sc.ComponentItemID > 0 {
				hasComponentScans = true
				break
			}
		}
		if hasComponentScans {
			if !disassembly {
				response.Validation(w, map[string]string{"component_item_id": "Cut SKU lots are only valid on cut-apart (disassembly) jobs."})
				return
			}
			allowed := map[int64]BomLine{}
			for _, ln := range bom.Lines {
				allowed[ln.ComponentItemID] = ln
			}
			for _, sc := range body.Scans {
				if sc.ComponentItemID == nil || *sc.ComponentItemID <= 0 {
					response.Validation(w, map[string]string{"component_item_id": "Each cut weigh row needs component_item_id."})
					return
				}
				ln, ok := allowed[*sc.ComponentItemID]
				if !ok {
					response.Validation(w, map[string]string{"component_item_id": "Component is not on this recipe."})
					return
				}
				st, err := inventory.LoadItemTrackingSettings(r.Context(), tx, tu.TenantID, *sc.ComponentItemID)
				if err != nil || !st.TrackLot {
					response.Validation(w, map[string]string{"item": fmt.Sprintf("%s must be lot-tracked.", ln.ComponentCode)})
					return
				}
			}
			results, err := processWoOutputLotScans(r.Context(), tx, tu.TenantID, woID, wo.FinishedItemCode, nil, body.Scans)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to stage output lots.", "ERR_INTERNAL")
				return
			}
			if err := tx.Commit(r.Context()); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to stage output lots.", "ERR_INTERNAL")
				return
			}
			_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "manufacturing.wo_output_lot_batch", "mfg_work_order", &woID, nil, map[string]any{"count": len(body.Scans), "cut": true})
			response.OK(w, map[string]any{"results": results}, "Batch processed.")
			return
		}

		fgSettings, err := inventory.LoadItemTrackingSettings(r.Context(), tx, tu.TenantID, wo.FinishedItemID)
		if err != nil || !fgSettings.TrackLot {
			response.Validation(w, map[string]string{"item": "Finished item does not track lots."})
			return
		}

		results, err := processWoOutputLotScans(r.Context(), tx, tu.TenantID, woID, wo.FinishedItemCode, fgSettings.DefaultShelfLifeDays, body.Scans)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to stage output lots.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to stage output lots.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "manufacturing.wo_output_lot_batch", "mfg_work_order", &woID, nil, map[string]any{"count": len(body.Scans)})
		response.OK(w, map[string]any{"results": results}, "Batch processed.")
	}
}

func getWorkOrderScanContext(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		woID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		ctx, err := loadWorkOrderScanContext(r.Context(), pool, tu.TenantID, woID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				response.Err(w, http.StatusNotFound, "Work order not found.", "ERR_NOT_FOUND")
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to load scan context.", "ERR_INTERNAL")
			return
		}
		response.OK(w, ctx, "OK")
	}
}

var errWoNotReleased = errors.New("work order not released")

func respondReleasedWOLoadError(w http.ResponseWriter, err error, notReleasedMsg string) {
	if errors.Is(err, errWoNotReleased) {
		response.Validation(w, map[string]string{"status": notReleasedMsg})
		return
	}
	if errors.Is(err, pgx.ErrNoRows) {
		response.Err(w, http.StatusNotFound, "Work order not found.", "ERR_NOT_FOUND")
		return
	}
	response.Err(w, http.StatusInternalServerError, "Failed to load work order.", "ERR_INTERNAL")
}

func isUndefinedColumnErr(err error, column string) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	col := strings.ToLower(column)
	return strings.Contains(msg, col) && (strings.Contains(msg, "does not exist") || strings.Contains(msg, "undefined_column"))
}

func loadReleasedWorkOrderForTrace(ctx context.Context, tx pgx.Tx, tenantID, woID int64) (WorkOrder, Bom, error) {
	var wo WorkOrder
	var status string
	err := tx.QueryRow(ctx, `
		select wo.id, wo.work_order_no, wo.bom_id, wo.finished_item_id, wo.location_id,
		  wo.qty_to_produce::float8, wo.status,
		  coalesce(fi.item_code, ''), coalesce(fi.item_name, ''),
		  coalesce(loc.location_name, '')
		from public.mfg_work_orders wo
		join public.inv_items fi on fi.id = wo.finished_item_id
		left join public.inv_locations loc on loc.id = wo.location_id
		where wo.id = $1 and wo.tenant_id = $2
		for update of wo`, woID, tenantID).Scan(
		&wo.ID, &wo.WorkOrderNo, &wo.BomID, &wo.FinishedItemID, &wo.LocationID,
		&wo.QtyToProduce, &status, &wo.FinishedItemCode, &wo.FinishedItemName, &wo.LocationName)
	if err != nil {
		return WorkOrder{}, Bom{}, err
	}
	wo.Status = status
	if status != "released" {
		return wo, Bom{}, errWoNotReleased
	}
	bom, err := loadBom(ctx, tx, tenantID, wo.BomID)
	if err != nil {
		return wo, Bom{}, err
	}
	return wo, bom, nil
}

func bomComponentIDs(bom Bom, finishedItemID int64, disassembly bool) map[int64]bool {
	out := map[int64]bool{}
	if disassembly {
		out[finishedItemID] = true
		return out
	}
	for _, ln := range bom.Lines {
		out[ln.ComponentItemID] = true
	}
	return out
}

func normalizeWoSerialNo(s string) string {
	return strings.TrimSpace(strings.Trim(s, "\r\n\t"))
}

func normalizeWoLotNo(s string) string {
	return strings.TrimSpace(s)
}

func autoWoLotNo(itemCode string, seq int) string {
	code := strings.TrimSpace(itemCode)
	if code == "" {
		code = "ITEM"
	}
	return fmt.Sprintf("%s-%s-%03d", time.Now().UTC().Format("20060102"), code, seq)
}

func defaultWoExpiry(shelfDays *int) *time.Time {
	if shelfDays == nil || *shelfDays <= 0 {
		return nil
	}
	d := time.Now().UTC().AddDate(0, 0, *shelfDays)
	t := time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, time.UTC)
	return &t
}

func processWoOutputSerialScans(ctx context.Context, tx pgx.Tx, tenantID, woID int64, scans []woOutputSerialScan) ([]woOutputSerialScanResult, error) {
	seen := map[string]bool{}
	results := make([]woOutputSerialScanResult, 0, len(scans))
	for _, sc := range scans {
		res := woOutputSerialScanResult{ClientScanID: sc.ClientScanID, SerialNo: sc.SerialNo}
		serialNo := normalizeWoSerialNo(sc.SerialNo)
		res.SerialNo = serialNo
		if serialNo == "" {
			res.Status = "empty"
			res.Message = "Serial number is required."
			results = append(results, res)
			continue
		}
		if sc.ClientScanID != "" {
			var existingID int64
			var existingNo string
			err := tx.QueryRow(ctx, `
				select id, serial_no from public.mfg_wo_output_serials
				where tenant_id = $1 and work_order_id = $2 and client_scan_id = $3 and status = 'staged'`,
				tenantID, woID, sc.ClientScanID).Scan(&existingID, &existingNo)
			if err == nil {
				res.Status = "idempotent_replay"
				res.ID = &existingID
				res.SerialNo = existingNo
				results = append(results, res)
				continue
			}
		}
		batchKey := serialNo
		if seen[batchKey] {
			res.Status = "batch_duplicate"
			res.Message = "Duplicate serial in batch."
			results = append(results, res)
			continue
		}
		seen[batchKey] = true

		var dup bool
		_ = tx.QueryRow(ctx, `
			select exists(
			  select 1 from public.inv_serial_units
			  where tenant_id = $1 and serial_no = $2 and status <> 'void'
			)`, tenantID, serialNo).Scan(&dup)
		if dup {
			res.Status = "duplicate"
			res.Message = "Serial number already exists."
			results = append(results, res)
			continue
		}

		var clientScanArg any
		if sc.ClientScanID != "" {
			clientScanArg = sc.ClientScanID
		}
		var rowID int64
		err := tx.QueryRow(ctx, `
			insert into public.mfg_wo_output_serials (tenant_id, work_order_id, serial_no, client_scan_id, status)
			values ($1, $2, $3, $4, 'staged')
			returning id`, tenantID, woID, serialNo, clientScanArg).Scan(&rowID)
		if err != nil {
			res.Status = "duplicate"
			res.Message = "Failed to record serial."
			results = append(results, res)
			continue
		}
		res.Status = "accepted"
		res.ID = &rowID
		results = append(results, res)
	}
	return results, nil
}

func processWoOutputLotScans(ctx context.Context, tx pgx.Tx, tenantID, woID int64, itemCode string, shelfDays *int, scans []woOutputLotScan) ([]woOutputLotScanResult, error) {
	seen := map[string]bool{}
	results := make([]woOutputLotScanResult, 0, len(scans))
	seq := 0
	for _, sc := range scans {
		res := woOutputLotScanResult{ClientScanID: sc.ClientScanID, LotNo: sc.LotNo, Qty: sc.Qty}
		if sc.ClientScanID != "" {
			var existingID int64
			var existingNo string
			var existingQty float64
			err := tx.QueryRow(ctx, `
				select id, lot_no, qty::float8 from public.mfg_wo_output_lots
				where tenant_id = $1 and work_order_id = $2 and client_scan_id = $3 and status = 'staged'`,
				tenantID, woID, sc.ClientScanID).Scan(&existingID, &existingNo, &existingQty)
			if err == nil {
				res.Status = "idempotent_replay"
				res.ID = &existingID
				res.LotNo = existingNo
				res.Qty = existingQty
				results = append(results, res)
				continue
			}
		}
		qty := sc.Qty
		if sc.CatchWeight != nil && *sc.CatchWeight > 0 {
			qty = *sc.CatchWeight
		}
		if qty <= 0 {
			res.Status = "empty"
			res.Message = "Quantity must be greater than zero."
			results = append(results, res)
			continue
		}
		res.Qty = qty
		codeForLot := itemCode
		var shelfForScan = shelfDays
		if sc.ComponentItemID != nil && *sc.ComponentItemID > 0 {
			_ = tx.QueryRow(ctx, `select coalesce(item_code, '') from public.inv_items where id = $1`, *sc.ComponentItemID).Scan(&codeForLot)
			st, errSt := inventory.LoadItemTrackingSettings(ctx, tx, tenantID, *sc.ComponentItemID)
			if errSt == nil && st.DefaultShelfLifeDays != nil {
				shelfForScan = st.DefaultShelfLifeDays
			}
		}
		lotNo := normalizeWoLotNo(sc.LotNo)
		if lotNo == "" {
			seq++
			lotNo = autoWoLotNo(codeForLot, seq)
		}
		res.LotNo = lotNo
		if seen[lotNo] {
			res.Status = "batch_duplicate"
			res.Message = "Duplicate lot in batch."
			results = append(results, res)
			continue
		}
		seen[lotNo] = true

		var expiry *time.Time
		if sc.ExpiryDate != nil && strings.TrimSpace(*sc.ExpiryDate) != "" {
			d, err := parseDate(*sc.ExpiryDate)
			if err != nil {
				res.Status = "invalid"
				res.Message = "Invalid expiry date."
				results = append(results, res)
				continue
			}
			expiry = &d
		} else {
			expiry = defaultWoExpiry(shelfForScan)
		}

		var clientScanArg any
		if sc.ClientScanID != "" {
			clientScanArg = sc.ClientScanID
		}
		var componentArg any
		if sc.ComponentItemID != nil && *sc.ComponentItemID > 0 {
			componentArg = *sc.ComponentItemID
		}
		var rowID int64
		err := tx.QueryRow(ctx, `
			insert into public.mfg_wo_output_lots (tenant_id, work_order_id, lot_no, qty, expiry_date, catch_weight, client_scan_id, status, component_item_id)
			values ($1, $2, $3, $4, $5, $6, $7, 'staged', $8)
			returning id`, tenantID, woID, lotNo, qty, expiry, sc.CatchWeight, clientScanArg, componentArg).Scan(&rowID)
		if err != nil {
			// Fallback without component_item_id only when migration 279 is not applied.
			if componentArg != nil && !isUndefinedColumnErr(err, "component_item_id") {
				res.Status = "invalid"
				res.Message = "Failed to record lot."
				results = append(results, res)
				continue
			}
			err2 := tx.QueryRow(ctx, `
				insert into public.mfg_wo_output_lots (tenant_id, work_order_id, lot_no, qty, expiry_date, catch_weight, client_scan_id, status)
				values ($1, $2, $3, $4, $5, $6, $7, 'staged')
				returning id`, tenantID, woID, lotNo, qty, expiry, sc.CatchWeight, clientScanArg).Scan(&rowID)
			if err2 != nil {
				res.Status = "duplicate"
				res.Message = "Failed to record lot."
				results = append(results, res)
				continue
			}
		}
		res.Status = "accepted"
		res.ID = &rowID
		results = append(results, res)
	}
	return results, nil
}

func loadWorkOrderScanContext(ctx context.Context, pool *pgxpool.Pool, tenantID, woID int64) (woScanContextPayload, error) {
	wo, err := loadWorkOrder(ctx, pool, tenantID, woID)
	if err != nil {
		return woScanContextPayload{}, err
	}
	bom, err := loadBom(ctx, pool, tenantID, wo.BomID)
	if err != nil {
		return woScanContextPayload{}, err
	}
	fgSettings, err := inventory.LoadItemTrackingSettings(ctx, pool, tenantID, wo.FinishedItemID)
	if err != nil {
		return woScanContextPayload{}, err
	}

	out := woScanContextPayload{
		WorkOrderID:      wo.ID,
		WorkOrderNo:      wo.WorkOrderNo,
		Status:           wo.Status,
		LocationID:       wo.LocationID,
		LocationName:     wo.LocationName,
		FinishedItemID:   wo.FinishedItemID,
		FinishedItemCode: wo.FinishedItemCode,
		FinishedItemName: wo.FinishedItemName,
		QtyToProduce:     wo.QtyToProduce,
		TrackSerial:      fgSettings.TrackSerial,
		TrackLot:         fgSettings.TrackLot,
		Components:       []woScanContextComponent{},
	}

	disassembly := normalizeBomType(bom.BomType) == "disassembly"
	lines := bom.Lines
	if disassembly {
		// Whole/input qty to consume equals job qty (finished item is the carcass/whole).
		stock := wo.QtyToProduce
		settings, _ := inventory.LoadItemTrackingSettings(ctx, pool, tenantID, wo.FinishedItemID)
		var issuedSerials int
		var issuedLotQty float64
		_ = pool.QueryRow(ctx, `select count(*) from public.mfg_wo_issue_serials where work_order_id = $1 and component_item_id = $2`, woID, wo.FinishedItemID).Scan(&issuedSerials)
		_ = pool.QueryRow(ctx, `select coalesce(sum(qty), 0)::float8 from public.mfg_wo_issue_lots where work_order_id = $1 and component_item_id = $2`, woID, wo.FinishedItemID).Scan(&issuedLotQty)
		out.Components = append(out.Components, woScanContextComponent{
			ComponentItemID: wo.FinishedItemID,
			ComponentCode:   wo.FinishedItemCode,
			ComponentName:   wo.FinishedItemName,
			StockToIssue:    stock,
			TrackSerial:     settings.TrackSerial,
			TrackLot:        settings.TrackLot,
			IssuedSerials:   issuedSerials,
			IssuedLotQty:    issuedLotQty,
		})
	} else {
		for _, ln := range lines {
			stock, _, err := StockIssueForLine(ctx, pool, tenantID, ln, wo.QtyToProduce, bom.OutputQty, bom.YieldPct)
			if err != nil {
				return woScanContextPayload{}, err
			}
			settings, _ := inventory.LoadItemTrackingSettings(ctx, pool, tenantID, ln.ComponentItemID)
			var issuedSerials int
			var issuedLotQty float64
			_ = pool.QueryRow(ctx, `select count(*) from public.mfg_wo_issue_serials where work_order_id = $1 and component_item_id = $2`, woID, ln.ComponentItemID).Scan(&issuedSerials)
			_ = pool.QueryRow(ctx, `select coalesce(sum(qty), 0)::float8 from public.mfg_wo_issue_lots where work_order_id = $1 and component_item_id = $2`, woID, ln.ComponentItemID).Scan(&issuedLotQty)
			out.Components = append(out.Components, woScanContextComponent{
				ComponentItemID: ln.ComponentItemID,
				ComponentCode:   ln.ComponentCode,
				ComponentName:   ln.ComponentName,
				StockToIssue:    stock,
				TrackSerial:     settings.TrackSerial,
				TrackLot:        settings.TrackLot,
				IssuedSerials:   issuedSerials,
				IssuedLotQty:    issuedLotQty,
			})
		}
	}

	_ = pool.QueryRow(ctx, `select count(*) from public.mfg_wo_output_serials where work_order_id = $1 and status = 'staged'`, woID).Scan(&out.OutputSerials)
	_ = pool.QueryRow(ctx, `select coalesce(sum(qty), 0)::float8 from public.mfg_wo_output_lots where work_order_id = $1 and status = 'staged'`, woID).Scan(&out.OutputLotQty)
	return out, nil
}

func consumeWoIssueTrace(ctx context.Context, tx pgx.Tx, tenantID, woID, locationID, itemID int64, needQty float64, userID int64) error {
	settings, err := inventory.LoadItemTrackingSettings(ctx, tx, tenantID, itemID)
	if err != nil {
		return err
	}
	if !settings.TrackSerial && !settings.TrackLot {
		return fmt.Errorf("item %d is not trace-tracked", itemID)
	}
	if settings.TrackSerial {
		needCount := int(math.Round(needQty))
		if math.Abs(float64(needCount)-needQty) > 0.0001 {
			return fmt.Errorf("serial-tracked issue qty must be a whole number")
		}
		rows, err := tx.Query(ctx, `
			select wis.serial_unit_id
			from public.mfg_wo_issue_serials wis
			where wis.work_order_id = $1 and wis.component_item_id = $2
			order by wis.id`, woID, itemID)
		if err != nil {
			return err
		}
		defer rows.Close()
		var unitIDs []int64
		for rows.Next() {
			var id int64
			if err := rows.Scan(&id); err != nil {
				return err
			}
			unitIDs = append(unitIDs, id)
		}
		if len(unitIDs) != needCount {
			return fmt.Errorf("staged serial count %d does not match required %d", len(unitIDs), needCount)
		}
		for _, unitID := range unitIDs {
			var serialNo string
			err := tx.QueryRow(ctx, `
				select serial_no from public.inv_serial_units
				where id = $1 and tenant_id = $2 and item_id = $3 and location_id = $4
				  and status in ('in_stock', 'reserved')
				for update`, unitID, tenantID, itemID, locationID).Scan(&serialNo)
			if err != nil {
				return fmt.Errorf("serial %d not available", unitID)
			}
			_, err = tx.Exec(ctx, `
				update public.inv_serial_units
				set status = 'scrapped', updated_at = now()
				where id = $1`, unitID)
			if err != nil {
				return err
			}
			loc := locationID
			if err := inventory.InsertSerialEvent(ctx, tx, tenantID, unitID, "adjusted", &loc, nil, "mfg_work_order", woID, &userID); err != nil {
				return err
			}
			if err := inventory.ApplyStockDelta(ctx, tx, tenantID, itemID, locationID, -1, userID, "mfg_work_order", woID, "wo_trace_issue"); err != nil {
				return err
			}
		}
		return nil
	}

	var stagedQty float64
	err = tx.QueryRow(ctx, `
		select coalesce(sum(qty), 0)::float8
		from public.mfg_wo_issue_lots
		where work_order_id = $1 and component_item_id = $2`, woID, itemID).Scan(&stagedQty)
	if err != nil {
		return err
	}
	if stagedQty+0.0001 < needQty || stagedQty-needQty > 0.0001 {
		return fmt.Errorf("staged lot qty %.4f does not match required %.4f", stagedQty, needQty)
	}
	rows, err := tx.Query(ctx, `
		select lot_batch_id, qty::float8
		from public.mfg_wo_issue_lots
		where work_order_id = $1 and component_item_id = $2
		order by id`, woID, itemID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var lotID int64
		var qty float64
		if err := rows.Scan(&lotID, &qty); err != nil {
			return err
		}
		tag, err := tx.Exec(ctx, `
			update public.inv_lot_batches
			set qty_on_hand = qty_on_hand - $1, updated_at = now()
			where id = $2 and tenant_id = $3 and location_id = $4 and qty_on_hand >= $1`,
			qty, lotID, tenantID, locationID)
		if err != nil || tag.RowsAffected() == 0 {
			return fmt.Errorf("failed to consume lot batch %d", lotID)
		}
		if err := inventory.InsertLotEvent(ctx, tx, inventory.LotEventInput{
			TenantID:        tenantID,
			LotBatchID:      lotID,
			EventType:       "consumed",
			FromLocationID:  &locationID,
			Qty:             qty,
			RefType:         "mfg_work_order",
			RefID:           &woID,
			CreatedByUserID: &userID,
		}); err != nil {
			return err
		}
		if err := inventory.ApplyStockDelta(ctx, tx, tenantID, itemID, locationID, -qty, userID, "mfg_work_order", woID, "wo_trace_issue"); err != nil {
			return err
		}
	}
	return nil
}

func postWoOutputTrace(ctx context.Context, tx pgx.Tx, tenantID, woID, locationID, itemID int64, outputQty float64, userID int64, itemCode string, shelfDays *int) error {
	settings, err := inventory.LoadItemTrackingSettings(ctx, tx, tenantID, itemID)
	if err != nil {
		return err
	}
	if !settings.TrackSerial && !settings.TrackLot {
		return fmt.Errorf("item %d is not trace-tracked", itemID)
	}
	if settings.TrackSerial {
		needCount := int(math.Round(outputQty))
		if math.Abs(float64(needCount)-outputQty) > 0.0001 {
			return fmt.Errorf("serial-tracked output qty must be a whole number")
		}
		rows, err := tx.Query(ctx, `
			select id, serial_no from public.mfg_wo_output_serials
			where work_order_id = $1 and status = 'staged'
			order by id`, woID)
		if err != nil {
			return err
		}
		defer rows.Close()
		type stagedSerial struct {
			id       int64
			serialNo string
		}
		var staged []stagedSerial
		for rows.Next() {
			var s stagedSerial
			if err := rows.Scan(&s.id, &s.serialNo); err != nil {
				return err
			}
			staged = append(staged, s)
		}
		if len(staged) != needCount {
			return fmt.Errorf("staged output serial count %d does not match required %d", len(staged), needCount)
		}
		recvAt := time.Now()
		var warrantyMonths int
		_ = tx.QueryRow(ctx, `select coalesce(warranty_duration_months, 0) from public.inv_items where id = $1`, itemID).Scan(&warrantyMonths)
		var wStart *time.Time
		wEnd := warrantyEndFromMonths(recvAt, warrantyMonths)
		if warrantyMonths > 0 {
			wStart = &recvAt
		}
		for _, s := range staged {
			var unitID int64
			err := tx.QueryRow(ctx, `
				insert into public.inv_serial_units (
				  tenant_id, item_id, serial_no, status, location_id,
				  warranty_start, warranty_end, received_at
				) values ($1, $2, $3, 'in_stock', $4, $5::date, $6::date, $7::timestamptz)
				returning id`,
				tenantID, itemID, s.serialNo, locationID, wStart, wEnd,
				recvAt.Format("2006-01-02")+" 12:00:00+00").Scan(&unitID)
			if err != nil {
				return fmt.Errorf("failed to post serial %s: %w", s.serialNo, err)
			}
			loc := locationID
			if err := inventory.InsertSerialEvent(ctx, tx, tenantID, unitID, "received", nil, &loc, "mfg_work_order", woID, &userID); err != nil {
				return err
			}
			if err := inventory.ApplyStockDelta(ctx, tx, tenantID, itemID, locationID, 1, userID, "mfg_work_order", woID, "wo_trace_receipt"); err != nil {
				return err
			}
			_, err = tx.Exec(ctx, `update public.mfg_wo_output_serials set status = 'posted' where id = $1`, s.id)
			if err != nil {
				return err
			}
		}
		return nil
	}

	var stagedQty float64
	err = tx.QueryRow(ctx, `
		select coalesce(sum(qty), 0)::float8
		from public.mfg_wo_output_lots
		where work_order_id = $1 and status = 'staged'`, woID).Scan(&stagedQty)
	if err != nil {
		return err
	}
	if stagedQty+0.0001 < outputQty || stagedQty-outputQty > 0.0001 {
		return fmt.Errorf("staged output lot qty %.4f does not match required %.4f", stagedQty, outputQty)
	}
	rows, err := tx.Query(ctx, `
		select id, lot_no, qty::float8, expiry_date
		from public.mfg_wo_output_lots
		where work_order_id = $1 and status = 'staged'
		order by id`, woID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var rowID int64
		var lotNo string
		var qty float64
		var expiry *time.Time
		if err := rows.Scan(&rowID, &lotNo, &qty, &expiry); err != nil {
			return err
		}
		var lotBatchID int64
		err = tx.QueryRow(ctx, `
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
		if err := inventory.ApplyStockDelta(ctx, tx, tenantID, itemID, locationID, qty, userID, "mfg_work_order", woID, "wo_trace_receipt"); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `update public.mfg_wo_output_lots set status = 'posted' where id = $1`, rowID)
		if err != nil {
			return err
		}
	}
	return nil
}

func warrantyEndFromMonths(start time.Time, months int) *time.Time {
	if months <= 0 {
		return nil
	}
	end := start.AddDate(0, months, 0)
	t := time.Date(end.Year(), end.Month(), end.Day(), 0, 0, 0, 0, time.UTC)
	return &t
}
