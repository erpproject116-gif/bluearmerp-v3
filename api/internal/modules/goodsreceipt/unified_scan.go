package goodsreceipt

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const (
	UnifiedScanLineSelected  = "line_selected"
	UnifiedScanSerialResult  = "serial_scan"
	UnifiedScanAmbiguousLine = "ambiguous_line"
	UnifiedScanItemNotFound  = "item_not_found"
	UnifiedScanNeedLine      = "need_active_line"
)

type unifiedScanBody struct {
	Scan         string `json:"scan"`
	ActiveLineID *int64 `json:"active_line_id,omitempty"`
	ClientScanID string `json:"client_scan_id,omitempty"`
}

type scanContextLine struct {
	LineID       int64   `json:"line_id"`
	LineNo       int     `json:"line_no"`
	ItemCode     string  `json:"item_code"`
	ItemName     string  `json:"item_name"`
	TrackSerial  bool    `json:"track_serial"`
	ExpectedQty  float64 `json:"expected_qty"`
	ReceivedQty  float64 `json:"received_qty"`
	SerialCount  int     `json:"serial_count"`
	IsOpen       bool    `json:"is_open"`
}

type scanContextPayload struct {
	GoodsReceiptID int64             `json:"goods_receipt_id"`
	Status         string            `json:"status"`
	ActiveLineID   *int64            `json:"active_line_id,omitempty"`
	Lines          []scanContextLine `json:"lines"`
}

type unifiedScanPayload struct {
	Mode         string            `json:"mode"`
	ActiveLineID *int64            `json:"active_line_id,omitempty"`
	ItemCode     string            `json:"item_code,omitempty"`
	LineNo       *int              `json:"line_no,omitempty"`
	Result       *serialScanResult `json:"result,omitempty"`
	Message      string            `json:"message,omitempty"`
	Candidates   []scanContextLine `json:"candidates,omitempty"`
}

func getGoodsReceiptScanContext(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		grID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		activeLine := parseOptionalInt64(r.URL.Query().Get("active_line_id"))
		ctx, err := loadScanContext(r.Context(), pool, tu.TenantID, grID, activeLine)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				response.Err(w, http.StatusNotFound, "Goods receipt not found.", "ERR_NOT_FOUND")
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to load scan context.", "ERR_INTERNAL")
			return
		}
		response.OK(w, ctx, "OK")
	}
}

func postGoodsReceiptUnifiedScan(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		grID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body unifiedScanBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		scan := strings.TrimSpace(body.Scan)
		if scan == "" {
			response.Validation(w, map[string]string{"scan": "Scan value is required."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to process scan.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		payload, err := processUnifiedScan(r.Context(), tx, tu.TenantID, grID, scan, body.ActiveLineID, body.ClientScanID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				response.Err(w, http.StatusNotFound, "Goods receipt not found.", "ERR_NOT_FOUND")
				return
			}
			if err.Error() == "only draft goods receipts accept serials" {
				response.Validation(w, map[string]string{"status": err.Error()})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to process scan.", "ERR_INTERNAL")
			return
		}

		if payload.Mode == UnifiedScanSerialResult && payload.Result != nil {
			if payload.Result.Status != SerialScanAccepted && payload.Result.Status != SerialScanIdempotentReplay {
				if err := tx.Rollback(r.Context()); err == nil {
					response.OK(w, payload, "Scan processed.")
				}
				return
			}
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to process scan.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "goods_receipt.unified_scan", "gr_goods_receipt", &grID, nil, body)
		response.OK(w, payload, "Scan processed.")
	}
}

func parseOptionalInt64(s string) *int64 {
	if s == "" {
		return nil
	}
	v, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return nil
	}
	return &v
}

func loadScanContext(ctx context.Context, pool *pgxpool.Pool, tenantID, grID int64, activeLineID *int64) (scanContextPayload, error) {
	var status string
	err := pool.QueryRow(ctx, `
		select status from public.gr_goods_receipts
		where id = $1 and tenant_id = $2`, grID, tenantID).Scan(&status)
	if err != nil {
		return scanContextPayload{}, err
	}

	rows, err := pool.Query(ctx, `
		select grl.id, grl.line_no, coalesce(i.item_code, ''), coalesce(i.item_name, ''),
		  coalesce(i.track_serial, false), grl.expected_qty::float8, grl.received_qty::float8,
		  (select count(*)::int from public.gr_goods_receipt_serials gs where gs.goods_receipt_line_id = grl.id)
		from public.gr_goods_receipt_lines grl
		join public.po_purchase_order_lines pol on pol.id = grl.purchase_order_line_id
		left join public.inv_items i on i.id = pol.item_id
		where grl.goods_receipt_id = $1
		order by grl.line_no`, grID)
	if err != nil {
		return scanContextPayload{}, err
	}
	defer rows.Close()

	lines := make([]scanContextLine, 0)
	for rows.Next() {
		var ln scanContextLine
		if err := rows.Scan(
			&ln.LineID, &ln.LineNo, &ln.ItemCode, &ln.ItemName, &ln.TrackSerial,
			&ln.ExpectedQty, &ln.ReceivedQty, &ln.SerialCount,
		); err != nil {
			return scanContextPayload{}, err
		}
		ln.IsOpen = ln.TrackSerial && ln.ReceivedQty+0.0001 < ln.ExpectedQty
		lines = append(lines, ln)
	}
	if err := rows.Err(); err != nil {
		return scanContextPayload{}, err
	}

	return scanContextPayload{
		GoodsReceiptID: grID,
		Status:         status,
		ActiveLineID:   activeLineID,
		Lines:          lines,
	}, nil
}

func processUnifiedScan(
	ctx context.Context,
	tx pgx.Tx,
	tenantID, grID int64,
	scan string,
	activeLineID *int64,
	clientScanID string,
) (unifiedScanPayload, error) {
	scan = normalizeSerialNo(scan)
	if scan == "" {
		return unifiedScanPayload{}, errors.New("empty scan")
	}

	matches, err := findOpenLinesByItemCode(ctx, tx, grID, scan)
	if err != nil {
		return unifiedScanPayload{}, err
	}
	if len(matches) > 1 {
		return unifiedScanPayload{
			Mode:       UnifiedScanAmbiguousLine,
			Message:    "Multiple open lines match this item code. Select a line.",
			Candidates: matches,
		}, nil
	}
	if len(matches) == 1 {
		lineID := matches[0].LineID
		lineNo := matches[0].LineNo
		return unifiedScanPayload{
			Mode:         UnifiedScanLineSelected,
			ActiveLineID: &lineID,
			ItemCode:     matches[0].ItemCode,
			LineNo:       &lineNo,
			Message:      "Line selected. Scan serial numbers.",
		}, nil
	}

	lineID := int64(0)
	if activeLineID != nil {
		lineID = *activeLineID
	}
	if lineID <= 0 {
		return unifiedScanPayload{
			Mode:    UnifiedScanNeedLine,
			Message: "Scan an item code first, or set active_line_id.",
		}, nil
	}

	results, err := processSerialScans(ctx, tx, tenantID, grID, []serialScanInput{{
		ClientScanID:       clientScanID,
		GoodsReceiptLineID: lineID,
		SerialNo:           scan,
	}})
	if err != nil {
		return unifiedScanPayload{}, err
	}
	if len(results) == 0 {
		return unifiedScanPayload{Mode: UnifiedScanSerialResult, Message: "No result."}, nil
	}
	res := results[0]
	return unifiedScanPayload{
		Mode:         UnifiedScanSerialResult,
		ActiveLineID: activeLineID,
		Result:       &res,
		Message:      res.Message,
	}, nil
}

func findOpenLinesByItemCode(ctx context.Context, tx pgx.Tx, grID int64, itemCode string) ([]scanContextLine, error) {
	rows, err := tx.Query(ctx, `
		select grl.id, grl.line_no, coalesce(i.item_code, ''), coalesce(i.item_name, ''),
		  coalesce(i.track_serial, false), grl.expected_qty::float8, grl.received_qty::float8,
		  (select count(*)::int from public.gr_goods_receipt_serials gs where gs.goods_receipt_line_id = grl.id)
		from public.gr_goods_receipt_lines grl
		join public.po_purchase_order_lines pol on pol.id = grl.purchase_order_line_id
		join public.inv_items i on i.id = pol.item_id
		where grl.goods_receipt_id = $1
		  and lower(trim(i.item_code)) = lower(trim($2))
		  and coalesce(i.track_serial, false) = true
		  and grl.received_qty + 0.0001 < grl.expected_qty
		order by grl.line_no`, grID, itemCode)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]scanContextLine, 0)
	for rows.Next() {
		var ln scanContextLine
		if err := rows.Scan(
			&ln.LineID, &ln.LineNo, &ln.ItemCode, &ln.ItemName, &ln.TrackSerial,
			&ln.ExpectedQty, &ln.ReceivedQty, &ln.SerialCount,
		); err != nil {
			return nil, err
		}
		ln.IsOpen = true
		out = append(out, ln)
	}
	return out, rows.Err()
}
