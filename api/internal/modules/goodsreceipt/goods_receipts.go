package goodsreceipt

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/finance"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/inventory"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/approval"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth/datascope"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/inventorygl"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type GoodsReceiptSerial struct {
	ID        int64  `json:"id"`
	SerialNo  string `json:"serial_no"`
	CreatedAt string `json:"created_at"`
}

type GoodsReceiptLot struct {
	ID         int64   `json:"id"`
	LotNo      string  `json:"lot_no"`
	Qty        float64 `json:"qty"`
	ExpiryDate *string `json:"expiry_date,omitempty"`
	CreatedAt  string  `json:"created_at"`
}

type GoodsReceiptLine struct {
	ID                  int64                `json:"id"`
	LineNo              int                  `json:"line_no"`
	PurchaseOrderLineID int64                `json:"purchase_order_line_id"`
	ItemID              *int64               `json:"item_id,omitempty"`
	ItemCode            string               `json:"item_code"`
	ItemName            string               `json:"item_name"`
	TrackSerial         bool                 `json:"track_serial"`
	TrackLot            bool                 `json:"track_lot"`
	ExpectedQty         float64              `json:"expected_qty"`
	ReceivedQty         float64              `json:"received_qty"`
	Serials             []GoodsReceiptSerial `json:"serials,omitempty"`
	Lots                []GoodsReceiptLot    `json:"lots,omitempty"`
}

type GoodsReceipt struct {
	ID                int64              `json:"id"`
	PurchaseOrderID   int64              `json:"purchase_order_id"`
	PurchaseOrderNo   string             `json:"purchase_order_no,omitempty"`
	ReceiptDate       string             `json:"receipt_date"`
	LocationID        int64              `json:"location_id"`
	LocationName      string             `json:"location_name,omitempty"`
	Status            string             `json:"status"`
	InspectionStatus  string             `json:"inspection_status"`
	InspectionNotes   *string            `json:"inspection_notes,omitempty"`
	Reference         *string            `json:"reference,omitempty"`
	Notes             *string            `json:"notes,omitempty"`
	CreatedByUserID   *int64             `json:"created_by_user_id,omitempty"`
	CreatedByName     string             `json:"created_by_name,omitempty"`
	CreatedAt         string             `json:"created_at"`
	UpdatedAt         string             `json:"updated_at"`
	Lines             []GoodsReceiptLine `json:"lines,omitempty"`
}

type createGoodsReceiptBody struct {
	PurchaseOrderID int64   `json:"purchase_order_id"`
	ReceiptDate     string  `json:"receipt_date"`
	LocationID      int64   `json:"location_id"`
	Reference       *string `json:"reference"`
	Notes           *string `json:"notes"`
}

type addSerialBody struct {
	GoodsReceiptLineID int64  `json:"goods_receipt_line_id"`
	SerialNo           string `json:"serial_no"`
	ClientScanID       string `json:"client_scan_id,omitempty"`
}

type batchSerialScanItem struct {
	ClientScanID       string `json:"client_scan_id"`
	GoodsReceiptLineID int64  `json:"goods_receipt_line_id"`
	SerialNo           string `json:"serial_no"`
}

type batchSerialBody struct {
	Scans []batchSerialScanItem `json:"scans"`
}

type addLotBody struct {
	GoodsReceiptLineID int64   `json:"goods_receipt_line_id"`
	LotNo              string  `json:"lot_no"`
	Qty                float64 `json:"qty"`
	ExpiryDate         *string `json:"expiry_date"`
}

type batchLotScanItem struct {
	ClientScanID       string   `json:"client_scan_id"`
	GoodsReceiptLineID int64    `json:"goods_receipt_line_id"`
	LotNo              string   `json:"lot_no"`
	Qty                float64  `json:"qty"`
	ExpiryDate         *string  `json:"expiry_date,omitempty"`
	GrossWeightKg      *float64 `json:"gross_weight_kg,omitempty"`
}

type batchLotBody struct {
	Scans []batchLotScanItem `json:"scans"`
}

type batchContainerScanItem struct {
	ClientScanID       string   `json:"client_scan_id"`
	GoodsReceiptLineID int64    `json:"goods_receipt_line_id"`
	ContainerNo        string   `json:"container_no"`
	ContainerType      string   `json:"container_type"`
	GrossWeightKg      *float64 `json:"gross_weight_kg,omitempty"`
	TareWeightKg       *float64 `json:"tare_weight_kg,omitempty"`
	NetWeightKg        float64  `json:"net_weight_kg"`
	LotNo              string   `json:"lot_no"`
	ExpiryDate         *string  `json:"expiry_date,omitempty"`
}

type batchContainerBody struct {
	Scans []batchContainerScanItem `json:"scans"`
}

func listGoodsReceipts(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"receipt_date":      "gr.receipt_date",
		"purchase_order_no": "po.purchase_order_no",
		"status":            "gr.status",
		"created_at":        "gr.created_at",
		"updated_at":        "gr.updated_at",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParamsWithDefaults(r, "updated_at", "desc", allowed)
		offset := httputil.Offset(p)

		where := "gr.tenant_id = $1"
		args := []any{tu.TenantID}
		argN := 2
		var explicitLoc *int64

		if p.Q != "" {
			where += fmt.Sprintf(` and (
				po.purchase_order_no ilike $%d or
				coalesce(gr.reference, '') ilike $%d or
				(to_char(gr.receipt_date, 'MM/DD/YYYY') || '-' || gr.date_seq) ilike $%d or
				exists (
					select 1 from public.gr_goods_receipt_lines grl
					join public.po_purchase_order_lines pol on pol.id = grl.purchase_order_line_id
					where grl.goods_receipt_id = gr.id and pol.item_name ilike $%d
				))`, argN, argN, argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}
		if st := strings.TrimSpace(r.URL.Query().Get("status")); st != "" {
			where += fmt.Sprintf(" and gr.status = $%d", argN)
			args = append(args, st)
			argN++
		}
		if id, ok := optionalInt64Query(r, "purchase_order_id"); ok {
			where += fmt.Sprintf(" and gr.purchase_order_id = $%d", argN)
			args = append(args, *id)
			argN++
		}
		if id, ok := optionalInt64Query(r, "location_id"); ok {
			explicitLoc = id
		}
		if fromStr := strings.TrimSpace(r.URL.Query().Get("date_from")); fromStr != "" {
			if from, err := parseDate(fromStr); err == nil {
				where += fmt.Sprintf(" and gr.receipt_date >= $%d::date", argN)
				args = append(args, from)
				argN++
			}
		}
		if toStr := strings.TrimSpace(r.URL.Query().Get("date_to")); toStr != "" {
			if to, err := parseDate(toStr); err == nil {
				where += fmt.Sprintf(" and gr.receipt_date <= $%d::date", argN)
				args = append(args, to)
				argN++
			}
		}

		dsScope, argN, err := datascope.ApplyUserScopesSQL(r.Context(), pool, tu, datascope.ListFilter{
			CustomerColumn:       "po.partner_id",
			LocationColumn:       "gr.location_id",
			ExplicitLocationID: explicitLoc,
		}, argN, &args)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to apply data scopes.", "ERR_INTERNAL")
			return
		}
		where += dsScope

		q := fmt.Sprintf(`
			select gr.id, gr.purchase_order_id, po.purchase_order_no,
			  gr.receipt_date, gr.location_id, loc.location_name,
			  gr.status, gr.inspection_status, gr.inspection_notes,
			  gr.reference, gr.notes,
			  gr.created_by_user_id, coalesce(u.full_name, ''),
			  gr.created_at, gr.updated_at, count(*) over()
			from public.gr_goods_receipts gr
			join public.po_purchase_orders po on po.id = gr.purchase_order_id
			join public.inv_locations loc on loc.id = gr.location_id
			left join public.users u on u.id = gr.created_by_user_id
			where %s
			order by %s %s, gr.id %s
			limit $%d offset $%d`, where, p.Sort, orderSQL(p.Order), orderSQL(p.Order), argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list goods receipts.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []GoodsReceipt
		var total int64
		for rows.Next() {
			var row GoodsReceipt
			var receiptDate time.Time
			var createdAt, updatedAt time.Time
			if err := rows.Scan(
				&row.ID, &row.PurchaseOrderID, &row.PurchaseOrderNo,
				&receiptDate, &row.LocationID, &row.LocationName,
				&row.Status, &row.InspectionStatus, &row.InspectionNotes,
				&row.Reference, &row.Notes,
				&row.CreatedByUserID, &row.CreatedByName,
				&createdAt, &updatedAt, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read goods receipts.", "ERR_INTERNAL")
				return
			}
			row.ReceiptDate = dateToStr(receiptDate)
			row.CreatedAt = createdAt.Format(time.RFC3339)
			row.UpdatedAt = updatedAt.Format(time.RFC3339)
			out = append(out, row)
		}
		if out == nil {
			out = []GoodsReceipt{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getGoodsReceipt(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		gr, err := loadGoodsReceipt(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Goods receipt not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, gr, "OK")
	}
}

func loadGoodsReceipt(ctx context.Context, conn pgxpoolConn, tenantID, id int64) (GoodsReceipt, error) {
	var gr GoodsReceipt
	var receiptDate time.Time
	var createdAt, updatedAt time.Time

	err := conn.QueryRow(ctx, `
		select gr.id, gr.purchase_order_id, po.purchase_order_no,
		  gr.receipt_date, gr.location_id, loc.location_name,
		  gr.status, gr.inspection_status, gr.inspection_notes,
		  gr.reference, gr.notes,
		  gr.created_by_user_id, coalesce(u.full_name, ''),
		  gr.created_at, gr.updated_at
		from public.gr_goods_receipts gr
		join public.po_purchase_orders po on po.id = gr.purchase_order_id
		join public.inv_locations loc on loc.id = gr.location_id
		left join public.users u on u.id = gr.created_by_user_id
		where gr.id = $1 and gr.tenant_id = $2`,
		id, tenantID).Scan(
		&gr.ID, &gr.PurchaseOrderID, &gr.PurchaseOrderNo,
		&receiptDate, &gr.LocationID, &gr.LocationName,
		&gr.Status, &gr.InspectionStatus, &gr.InspectionNotes,
		&gr.Reference, &gr.Notes,
		&gr.CreatedByUserID, &gr.CreatedByName,
		&createdAt, &updatedAt,
	)
	if err != nil {
		return GoodsReceipt{}, err
	}
	gr.ReceiptDate = dateToStr(receiptDate)
	gr.CreatedAt = createdAt.Format(time.RFC3339)
	gr.UpdatedAt = updatedAt.Format(time.RFC3339)

	lines, err := loadGoodsReceiptLines(ctx, conn, id)
	if err != nil {
		return GoodsReceipt{}, err
	}
	gr.Lines = lines
	return gr, nil
}

func loadGoodsReceiptLines(ctx context.Context, conn pgxpoolConn, goodsReceiptID int64) ([]GoodsReceiptLine, error) {
	rows, err := conn.Query(ctx, `
		select grl.id, grl.line_no, grl.purchase_order_line_id,
		  pol.item_id, pol.item_code, pol.item_name,
		  coalesce(i.track_serial, false), coalesce(i.track_lot, false),
		  grl.expected_qty::float8, grl.received_qty::float8
		from public.gr_goods_receipt_lines grl
		join public.po_purchase_order_lines pol on pol.id = grl.purchase_order_line_id
		left join public.inv_items i on i.id = pol.item_id
		where grl.goods_receipt_id = $1
		order by grl.line_no`, goodsReceiptID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var lines []GoodsReceiptLine
	var lineIDs []int64
	for rows.Next() {
		var ln GoodsReceiptLine
		if err := rows.Scan(
			&ln.ID, &ln.LineNo, &ln.PurchaseOrderLineID,
			&ln.ItemID, &ln.ItemCode, &ln.ItemName, &ln.TrackSerial, &ln.TrackLot,
			&ln.ExpectedQty, &ln.ReceivedQty,
		); err != nil {
			return nil, err
		}
		lineIDs = append(lineIDs, ln.ID)
		lines = append(lines, ln)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if lines == nil {
		return []GoodsReceiptLine{}, nil
	}

	serialsByLine, err := loadGoodsReceiptSerials(ctx, conn, lineIDs)
	if err != nil {
		return nil, err
	}
	lotsByLine, err := loadGoodsReceiptLots(ctx, conn, lineIDs)
	if err != nil {
		return nil, err
	}
	for i := range lines {
		if s := serialsByLine[lines[i].ID]; s != nil {
			lines[i].Serials = s
		} else {
			lines[i].Serials = []GoodsReceiptSerial{}
		}
		if l := lotsByLine[lines[i].ID]; l != nil {
			lines[i].Lots = l
		} else {
			lines[i].Lots = []GoodsReceiptLot{}
		}
	}
	return lines, nil
}

func loadGoodsReceiptSerials(ctx context.Context, conn pgxpoolConn, lineIDs []int64) (map[int64][]GoodsReceiptSerial, error) {
	out := make(map[int64][]GoodsReceiptSerial)
	if len(lineIDs) == 0 {
		return out, nil
	}
	rows, err := conn.Query(ctx, `
		select id, goods_receipt_line_id, serial_no, created_at
		from public.gr_goods_receipt_serials
		where goods_receipt_line_id = any($1)
		order by goods_receipt_line_id, serial_no`, lineIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var s GoodsReceiptSerial
		var lineID int64
		var createdAt time.Time
		if err := rows.Scan(&s.ID, &lineID, &s.SerialNo, &createdAt); err != nil {
			return nil, err
		}
		s.CreatedAt = createdAt.Format(time.RFC3339)
		out[lineID] = append(out[lineID], s)
	}
	return out, rows.Err()
}

func loadGoodsReceiptLots(ctx context.Context, conn pgxpoolConn, lineIDs []int64) (map[int64][]GoodsReceiptLot, error) {
	out := make(map[int64][]GoodsReceiptLot)
	if len(lineIDs) == 0 {
		return out, nil
	}
	rows, err := conn.Query(ctx, `
		select id, goods_receipt_line_id, lot_no, qty::float8, expiry_date, created_at
		from public.gr_goods_receipt_line_lots
		where goods_receipt_line_id = any($1)
		order by goods_receipt_line_id, lot_no`, lineIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var lot GoodsReceiptLot
		var lineID int64
		var expiry *time.Time
		var createdAt time.Time
		if err := rows.Scan(&lot.ID, &lineID, &lot.LotNo, &lot.Qty, &expiry, &createdAt); err != nil {
			return nil, err
		}
		lot.ExpiryDate = formatDatePtr(expiry)
		lot.CreatedAt = createdAt.Format(time.RFC3339)
		out[lineID] = append(out[lineID], lot)
	}
	return out, rows.Err()
}

func formatDatePtr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.Format("2006-01-02")
	return &s
}

// validatePOApprovalForReceipt blocks GR create/post against a purchase order
// that lacks a confirmed approval when the PO-approval policy is on.
func validatePOApprovalForReceipt(ctx context.Context, tx pgx.Tx, tenantID, purchaseOrderID int64) map[string]string {
	policy, err := processpolicy.LoadTx(ctx, tx, tenantID)
	if err != nil {
		return map[string]string{"purchase_order_id": "Failed to load process policies."}
	}
	if !policy.PurchaseRequirePOApproval {
		return nil
	}
	status, found, err := approval.Status(ctx, tx, tenantID, "purchase_order", purchaseOrderID)
	if err != nil {
		return map[string]string{"purchase_order_id": "Failed to check purchase order approval."}
	}
	return processpolicy.ValidatePurchaseOrderApproval(policy, found, status)
}

func createGoodsReceipt(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body createGoodsReceiptBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		errs := map[string]string{}
		if body.PurchaseOrderID <= 0 {
			errs["purchase_order_id"] = "Purchase order is required."
		}
		if strings.TrimSpace(body.ReceiptDate) == "" {
			errs["receipt_date"] = "Receipt date is required."
		}
		if body.LocationID <= 0 {
			errs["location_id"] = "Location is required."
		}
		if len(errs) > 0 {
			response.Validation(w, errs)
			return
		}
		receiptDate, err := parseDate(body.ReceiptDate)
		if err != nil {
			response.Validation(w, map[string]string{"receipt_date": "Invalid date. Use YYYY-MM-DD."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create goods receipt.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var poStatus string
		err = tx.QueryRow(r.Context(), `
			select status from public.po_purchase_orders
			where id = $1 and tenant_id = $2 and deleted_at is null
			for update`, body.PurchaseOrderID, tu.TenantID).Scan(&poStatus)
		if err != nil {
			response.Validation(w, map[string]string{"purchase_order_id": "Purchase order not found."})
			return
		}
		if poStatus != "draft" && poStatus != "confirmed" && poStatus != "partially_received" {
			response.ValidationSmart(w, map[string]string{"purchase_order_id": "Purchase order must be open for receiving (Unconfirmed/draft, confirmed, or partially received)."})
			return
		}
		if v := validatePOApprovalForReceipt(r.Context(), tx, tu.TenantID, body.PurchaseOrderID); v != nil {
			response.Validation(w, v)
			return
		}

		var locTenant int64
		if err := tx.QueryRow(r.Context(), `select tenant_id from public.inv_locations where id = $1 and deleted_at is null`, body.LocationID).Scan(&locTenant); err != nil || locTenant != tu.TenantID {
			response.Validation(w, map[string]string{"location_id": "Invalid location."})
			return
		}

		var grID int64
		err = tx.QueryRow(r.Context(), `
			insert into public.gr_goods_receipts (
			  tenant_id, purchase_order_id, receipt_date, location_id, status,
			  inspection_status, reference, notes, created_by_user_id
			) values ($1, $2, $3::date, $4, 'draft', 'released', $5, $6, $7)
			returning id`,
			tu.TenantID, body.PurchaseOrderID, receiptDate, body.LocationID,
			body.Reference, body.Notes, tu.AppUserID).Scan(&grID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create goods receipt.", "ERR_INTERNAL")
			return
		}

		poLineRows, err := tx.Query(r.Context(), `
			select pol.id, pol.line_no, (pol.qty - pol.received_qty)::float8,
			  coalesce(i.track_serial, false), coalesce(i.track_lot, false)
			from public.po_purchase_order_lines pol
			left join public.inv_items i on i.id = pol.item_id
			where pol.purchase_order_id = $1
			  and (pol.qty - pol.received_qty) > 0.0001
			order by pol.line_no`, body.PurchaseOrderID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load purchase order lines.", "ERR_INTERNAL")
			return
		}

		type openPOLine struct {
			poLineID               int64
			lineNo                 int
			openQty                float64
			trackSerial, trackLot  bool
		}
		var openLines []openPOLine
		for poLineRows.Next() {
			var line openPOLine
			if err := poLineRows.Scan(&line.poLineID, &line.lineNo, &line.openQty, &line.trackSerial, &line.trackLot); err != nil {
				poLineRows.Close()
				response.Err(w, http.StatusInternalServerError, "Failed to read purchase order lines.", "ERR_INTERNAL")
				return
			}
			openLines = append(openLines, line)
		}
		if err := poLineRows.Err(); err != nil {
			poLineRows.Close()
			response.Err(w, http.StatusInternalServerError, "Failed to read purchase order lines.", "ERR_INTERNAL")
			return
		}
		poLineRows.Close()

		if len(openLines) == 0 {
			response.Validation(w, map[string]string{"purchase_order_id": "No open lines on purchase order."})
			return
		}

		for i, line := range openLines {
			receivedQty := line.openQty
			if line.trackSerial || line.trackLot {
				receivedQty = 0
			}
			_, err = tx.Exec(r.Context(), `
				insert into public.gr_goods_receipt_lines (
				  goods_receipt_id, purchase_order_line_id, line_no, expected_qty, received_qty
				) values ($1, $2, $3, $4, $5)`,
				grID, line.poLineID, i+1, line.openQty, receivedQty)
			if err != nil {
				log.Printf("goods_receipt create lines: %v", err)
				response.Err(w, http.StatusInternalServerError, "Failed to create goods receipt lines.", "ERR_INTERNAL")
				return
			}
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create goods receipt.", "ERR_INTERNAL")
			return
		}

		gr, err := loadGoodsReceipt(r.Context(), pool, tu.TenantID, grID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Created but failed to load goods receipt.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "goods_receipt.create", "gr_goods_receipt", &grID, nil, body)
		response.OK(w, gr, "Goods receipt created.")
	}
}

func addGoodsReceiptSerial(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		grID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body addSerialBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to add serial.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		results, err := processSerialScans(r.Context(), tx, tu.TenantID, grID, []serialScanInput{{
			ClientScanID:       body.ClientScanID,
			GoodsReceiptLineID: body.GoodsReceiptLineID,
			SerialNo:           body.SerialNo,
		}})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) || strings.Contains(err.Error(), "not found") {
				response.Err(w, http.StatusNotFound, "Goods receipt not found.", "ERR_NOT_FOUND")
				return
			}
			if err.Error() == "only draft goods receipts accept serials" {
				response.Validation(w, map[string]string{"status": "Only draft goods receipts accept serials."})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to add serial.", "ERR_INTERNAL")
			return
		}

		if len(results) == 0 {
			response.Validation(w, map[string]string{"body": "Invalid scan."})
			return
		}
		res := results[0]
		if res.Status != SerialScanAccepted && res.Status != SerialScanIdempotentReplay {
			key := "serial_no"
			if res.Status == SerialScanInvalidLine {
				key = "goods_receipt_line_id"
			}
			response.Validation(w, map[string]string{key: res.Message})
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to add serial.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "goods_receipt.add_serial", "gr_goods_receipt", &grID, nil, body)
		response.OK(w, map[string]any{
			"id":        res.SerialID,
			"serial_no": res.SerialNo,
			"status":    res.Status,
		}, "Serial added.")
	}
}

func addGoodsReceiptSerialBatch(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		grID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body batchSerialBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.Scans) == 0 {
			response.Validation(w, map[string]string{"scans": "At least one scan is required."})
			return
		}
		if len(body.Scans) > maxSerialBatchSize {
			response.Validation(w, map[string]string{"scans": fmt.Sprintf("Maximum %d scans per batch.", maxSerialBatchSize)})
			return
		}

		inputs := make([]serialScanInput, len(body.Scans))
		for i, sc := range body.Scans {
			inputs[i] = serialScanInput{
				ClientScanID:       sc.ClientScanID,
				GoodsReceiptLineID: sc.GoodsReceiptLineID,
				SerialNo:           sc.SerialNo,
			}
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to add serials.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		results, err := processSerialScans(r.Context(), tx, tu.TenantID, grID, inputs)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				response.Err(w, http.StatusNotFound, "Goods receipt not found.", "ERR_NOT_FOUND")
				return
			}
			if err.Error() == "only draft goods receipts accept serials" {
				response.Validation(w, map[string]string{"status": "Only draft goods receipts accept serials."})
				return
			}
			if strings.HasPrefix(err.Error(), "maximum ") {
				response.Validation(w, map[string]string{"scans": err.Error()})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to add serials.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to add serials.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "goods_receipt.add_serial_batch", "gr_goods_receipt", &grID, nil, map[string]any{"count": len(body.Scans)})
		response.OK(w, map[string]any{"results": results}, "Batch processed.")
	}
}

func removeGoodsReceiptSerial(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		grID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid goods receipt id."})
			return
		}
		serialID, err := strconv.ParseInt(chi.URLParam(r, "serialId"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"serialId": "Invalid serial id."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to remove serial.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var status string
		err = tx.QueryRow(r.Context(), `
			select status from public.gr_goods_receipts
			where id = $1 and tenant_id = $2
			for update`, grID, tu.TenantID).Scan(&status)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Goods receipt not found.", "ERR_NOT_FOUND")
			return
		}
		if status != "draft" {
			response.Validation(w, map[string]string{"status": "Only draft goods receipts allow serial removal."})
			return
		}

		var lineID int64
		var serialNo string
		err = tx.QueryRow(r.Context(), `
			select gs.goods_receipt_line_id, gs.serial_no
			from public.gr_goods_receipt_serials gs
			join public.gr_goods_receipt_lines grl on grl.id = gs.goods_receipt_line_id
			where gs.id = $1 and grl.goods_receipt_id = $2`, serialID, grID).Scan(&lineID, &serialNo)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Serial not found on this goods receipt.", "ERR_NOT_FOUND")
			return
		}

		tag, err := tx.Exec(r.Context(), `delete from public.gr_goods_receipt_serials where id = $1`, serialID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Serial not found.", "ERR_NOT_FOUND")
			return
		}

		_, err = tx.Exec(r.Context(), `
			update public.gr_goods_receipt_lines
			set received_qty = greatest(received_qty - 1, 0)
			where id = $1`, lineID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update line quantity.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to remove serial.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "goods_receipt.remove_serial", "gr_goods_receipt", &grID, nil, map[string]any{
			"serial_id": serialID,
			"serial_no": serialNo,
		})
		response.OK(w, map[string]any{"id": serialID, "serial_no": serialNo}, "Serial removed.")
	}
}

func addGoodsReceiptLot(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		grID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body addLotBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		lotNo := strings.TrimSpace(body.LotNo)
		errs := map[string]string{}
		if body.GoodsReceiptLineID <= 0 {
			errs["goods_receipt_line_id"] = "Line is required."
		}
		if lotNo == "" {
			errs["lot_no"] = "Lot number is required."
		}
		if body.Qty <= 0 {
			errs["qty"] = "Quantity must be greater than zero."
		}
		var expiryDate *time.Time
		if body.ExpiryDate != nil && strings.TrimSpace(*body.ExpiryDate) != "" {
			d, err := parseDate(*body.ExpiryDate)
			if err != nil {
				errs["expiry_date"] = "Invalid date. Use YYYY-MM-DD."
			} else {
				expiryDate = &d
			}
		}
		if len(errs) > 0 {
			response.Validation(w, errs)
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to add lot.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var status string
		err = tx.QueryRow(r.Context(), `
			select status from public.gr_goods_receipts
			where id = $1 and tenant_id = $2
			for update`, grID, tu.TenantID).Scan(&status)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Goods receipt not found.", "ERR_NOT_FOUND")
			return
		}
		if status != "draft" {
			response.Validation(w, map[string]string{"status": "Only draft goods receipts accept lots."})
			return
		}

		var lineGRID int64
		var expectedQty, receivedQty float64
		var trackLot bool
		err = tx.QueryRow(r.Context(), `
			select grl.goods_receipt_id, grl.expected_qty::float8, grl.received_qty::float8,
			  coalesce(i.track_lot, false)
			from public.gr_goods_receipt_lines grl
			join public.po_purchase_order_lines pol on pol.id = grl.purchase_order_line_id
			left join public.inv_items i on i.id = pol.item_id
			where grl.id = $1`, body.GoodsReceiptLineID).Scan(&lineGRID, &expectedQty, &receivedQty, &trackLot)
		if err != nil || lineGRID != grID {
			response.Validation(w, map[string]string{"goods_receipt_line_id": "Line not found on this goods receipt."})
			return
		}
		if !trackLot {
			response.Validation(w, map[string]string{"goods_receipt_line_id": "Item does not track lots."})
			return
		}
		if receivedQty+body.Qty > expectedQty+0.0001 {
			response.ValidationSmart(w, map[string]string{"qty": "Lot qty is higher than what’s left on this receive line. Lower the lot qty."})
			return
		}

		var lotID int64
		err = tx.QueryRow(r.Context(), `
			insert into public.gr_goods_receipt_line_lots (goods_receipt_line_id, lot_no, qty, expiry_date)
			values ($1, $2, $3, $4)
			on conflict (goods_receipt_line_id, lot_no) do update set
			  qty = gr_goods_receipt_line_lots.qty + excluded.qty,
			  expiry_date = coalesce(excluded.expiry_date, gr_goods_receipt_line_lots.expiry_date)
			returning id`, body.GoodsReceiptLineID, lotNo, body.Qty, expiryDate).Scan(&lotID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to add lot.", "ERR_INTERNAL")
			return
		}

		_, err = tx.Exec(r.Context(), `
			update public.gr_goods_receipt_lines
			set received_qty = (
			  select coalesce(sum(qty), 0) from public.gr_goods_receipt_line_lots
			  where goods_receipt_line_id = $1
			)
			where id = $1`, body.GoodsReceiptLineID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update line quantity.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to add lot.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "goods_receipt.add_lot", "gr_goods_receipt", &grID, nil, body)
		response.OK(w, map[string]any{
			"id":     lotID,
			"lot_no": lotNo,
			"qty":    body.Qty,
		}, "Lot added.")
	}
}

func addGoodsReceiptLotBatch(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		grID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body batchLotBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.Scans) == 0 {
			response.Validation(w, map[string]string{"scans": "At least one lot entry is required."})
			return
		}
		if len(body.Scans) > maxLotBatchSize {
			response.Validation(w, map[string]string{"scans": fmt.Sprintf("Maximum %d lot entries per batch.", maxLotBatchSize)})
			return
		}

		inputs := make([]lotScanInput, len(body.Scans))
		for i, sc := range body.Scans {
			var expiry *time.Time
			if sc.ExpiryDate != nil && strings.TrimSpace(*sc.ExpiryDate) != "" {
				d, err := parseDate(*sc.ExpiryDate)
				if err != nil {
					response.Validation(w, map[string]string{"expiry_date": "Invalid date. Use YYYY-MM-DD."})
					return
				}
				expiry = &d
			}
			qty := sc.Qty
			if qty <= 0 && sc.GrossWeightKg != nil && *sc.GrossWeightKg > 0 {
				qty = *sc.GrossWeightKg
			}
			inputs[i] = lotScanInput{
				ClientScanID:       sc.ClientScanID,
				GoodsReceiptLineID: sc.GoodsReceiptLineID,
				LotNo:              sc.LotNo,
				Qty:                qty,
				ExpiryDate:         expiry,
			}
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to add lots.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		results, err := processLotScans(r.Context(), tx, tu.TenantID, grID, inputs)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				response.Err(w, http.StatusNotFound, "Goods receipt not found.", "ERR_NOT_FOUND")
				return
			}
			if err.Error() == "only draft goods receipts accept lots" {
				response.Validation(w, map[string]string{"status": "Only draft goods receipts accept lots."})
				return
			}
			if strings.HasPrefix(err.Error(), "maximum ") {
				response.Validation(w, map[string]string{"scans": err.Error()})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to add lots.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to add lots.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "goods_receipt.add_lot_batch", "gr_goods_receipt", &grID, nil, map[string]any{"count": len(body.Scans)})
		response.OK(w, map[string]any{"results": results}, "Batch processed.")
	}
}

func addGoodsReceiptContainerBatch(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		grID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body batchContainerBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.Scans) == 0 {
			response.Validation(w, map[string]string{"scans": "At least one container entry is required."})
			return
		}

		inputs := make([]inventory.ContainerScanInput, len(body.Scans))
		for i, sc := range body.Scans {
			var expiry *time.Time
			if sc.ExpiryDate != nil && strings.TrimSpace(*sc.ExpiryDate) != "" {
				d, err := parseDate(*sc.ExpiryDate)
				if err != nil {
					response.Validation(w, map[string]string{"expiry_date": "Invalid date. Use YYYY-MM-DD."})
					return
				}
				expiry = &d
			}
			netWeight := sc.NetWeightKg
			if netWeight <= 0 && sc.GrossWeightKg != nil && *sc.GrossWeightKg > 0 {
				tare := 0.0
				if sc.TareWeightKg != nil {
					tare = *sc.TareWeightKg
				}
				netWeight = *sc.GrossWeightKg - tare
			}
			inputs[i] = inventory.ContainerScanInput{
				ClientScanID:       sc.ClientScanID,
				GoodsReceiptLineID: sc.GoodsReceiptLineID,
				ContainerNo:        sc.ContainerNo,
				ContainerType:      sc.ContainerType,
				GrossWeightKg:      sc.GrossWeightKg,
				TareWeightKg:       sc.TareWeightKg,
				NetWeightKg:        netWeight,
				LotNo:              sc.LotNo,
				ExpiryDate:         expiry,
			}
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to add containers.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		results, err := inventory.ProcessContainerScans(r.Context(), tx, tu.TenantID, grID, inputs)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				response.Err(w, http.StatusNotFound, "Goods receipt not found.", "ERR_NOT_FOUND")
				return
			}
			if err.Error() == "only draft goods receipts accept containers" {
				response.Validation(w, map[string]string{"status": "Only draft goods receipts accept containers."})
				return
			}
			if strings.HasPrefix(err.Error(), "maximum ") {
				response.Validation(w, map[string]string{"scans": err.Error()})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to add containers.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to add containers.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "goods_receipt.add_container_batch", "gr_goods_receipt", &grID, nil, map[string]any{"count": len(body.Scans)})
		response.OK(w, map[string]any{"results": results}, "Batch processed.")
	}
}

func postGoodsReceipt(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		grID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to post goods receipt.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var purchaseOrderID, locationID int64
		var receiptDate time.Time
		var status, inspectionStatus string
		err = tx.QueryRow(r.Context(), `
			select purchase_order_id, location_id, receipt_date, status, inspection_status
			from public.gr_goods_receipts
			where id = $1 and tenant_id = $2
			for update`, grID, tu.TenantID).Scan(&purchaseOrderID, &locationID, &receiptDate, &status, &inspectionStatus)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Goods receipt not found.", "ERR_NOT_FOUND")
			return
		}
		if status != "draft" {
			response.Validation(w, map[string]string{"status": "Only draft goods receipts can be posted."})
			return
		}
		if inspectionStatus != "released" {
			response.ValidationSmart(w, map[string]string{"inspection_status": "Goods receipt must be inspection-released before posting. Release QC on this receipt, then post again."})
			return
		}

		var poStatus string
		err = tx.QueryRow(r.Context(), `
			select status from public.po_purchase_orders
			where id = $1 and tenant_id = $2 and deleted_at is null
			for update`, purchaseOrderID, tu.TenantID).Scan(&poStatus)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Purchase order not found.", "ERR_INTERNAL")
			return
		}
		if poStatus != "draft" && poStatus != "confirmed" && poStatus != "partially_received" {
			response.ValidationSmart(w, map[string]string{"purchase_order_id": "Purchase order is not open for receiving."})
			return
		}
		if v := validatePOApprovalForReceipt(r.Context(), tx, tu.TenantID, purchaseOrderID); v != nil {
			response.Validation(w, v)
			return
		}

		lineRows, err := tx.Query(r.Context(), `
			select grl.id, grl.purchase_order_line_id, grl.received_qty::float8,
			  pol.qty::float8, pol.received_qty::float8,
			  pol.item_id, pol.partner_id, pol.item_code, pol.item_name, pol.unit_id,
			  coalesce(pol.unit_non_vat, 0)::float8,
			  coalesce(i.track_serial, false), coalesce(i.track_lot, false),
			  coalesce(i.serial_policy, 'required'), coalesce(i.lot_policy, 'required'),
			  coalesce(i.track_inventory_qty, false),
			  coalesce(i.warranty_duration_months, 0)
			from public.gr_goods_receipt_lines grl
			join public.po_purchase_order_lines pol on pol.id = grl.purchase_order_line_id
			left join public.inv_items i on i.id = pol.item_id
			where grl.goods_receipt_id = $1
			order by grl.line_no`, grID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load lines.", "ERR_INTERNAL")
			return
		}
		defer lineRows.Close()

		type linePost struct {
			ID                  int64
			PurchaseOrderLineID int64
			ReceivedQty         float64
			POQty               float64
			POReceivedQty       float64
			ItemID              *int64
			PartnerID           *int64
			ItemCode            string
			ItemName            string
			UnitID              *int64
			UnitCost            float64
			BaseQty             float64
			TrackSerial         bool
			TrackLot            bool
			SerialPolicy        string
			LotPolicy           string
			TrackInventory      bool
			WarrantyMonths      int
		}
		var lines []linePost
		hasReceiptQty := false
		for lineRows.Next() {
			var ln linePost
			if err := lineRows.Scan(
				&ln.ID, &ln.PurchaseOrderLineID, &ln.ReceivedQty,
				&ln.POQty, &ln.POReceivedQty,
				&ln.ItemID, &ln.PartnerID, &ln.ItemCode, &ln.ItemName, &ln.UnitID,
				&ln.UnitCost,
				&ln.TrackSerial, &ln.TrackLot, &ln.SerialPolicy, &ln.LotPolicy, &ln.TrackInventory, &ln.WarrantyMonths,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read lines.", "ERR_INTERNAL")
				return
			}
			if ln.ReceivedQty <= 0 {
				continue
			}
			hasReceiptQty = true
			openQty := ln.POQty - ln.POReceivedQty
			if ln.ReceivedQty > openQty+0.0001 {
				response.ValidationSmart(w, map[string]string{
					"received_qty": fmt.Sprintf("Line %d qty is higher than the open purchase order (%.4f available). Lower the qty or open the PO to check balance.", ln.ID, openQty),
				})
				return
			}
			lines = append(lines, ln)
		}
		if err := lineRows.Err(); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to read lines.", "ERR_INTERNAL")
			return
		}
		lineRows.Close()
		if !hasReceiptQty {
			response.Validation(w, map[string]string{"lines": "At least one line must have a received quantity."})
			return
		}

		// Ledger writes happen in the item base unit, so convert once per line here.
		for i := range lines {
			ln := &lines[i]
			ln.BaseQty = ln.ReceivedQty
			if ln.ItemID != nil {
				baseQty, err := inventory.BaseQtyForLine(r.Context(), tx, tu.TenantID, *ln.ItemID, ln.UnitID, ln.ReceivedQty)
				if err != nil {
					response.Validation(w, map[string]string{"unit_id": fmt.Sprintf("Line %d: %v", ln.ID, err)})
					return
				}
				ln.BaseQty = baseQty
			}
			if ln.TrackSerial {
				if ln.BaseQty != float64(int64(ln.BaseQty)) {
					response.Validation(w, map[string]string{
						"serials": fmt.Sprintf("Line %d converts to %.4f base units; serial-tracked items need a whole number.", ln.ID, ln.BaseQty),
					})
					return
				}
				var serialCount int
				if err := tx.QueryRow(r.Context(), `
					select count(*) from public.gr_goods_receipt_serials
					where goods_receipt_line_id = $1`, ln.ID).Scan(&serialCount); err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to count serials.", "ERR_INTERNAL")
					return
				}
				if err := inventory.ValidateGRSerialCapture(ln.ID, ln.SerialPolicy, serialCount, ln.BaseQty); err != nil {
					response.Validation(w, map[string]string{"serials": err.Error()})
					return
				}
			}
			if ln.TrackLot {
				var lotQty float64
				if err := tx.QueryRow(r.Context(), `
					select coalesce(sum(qty), 0)::float8
					from public.gr_goods_receipt_line_lots
					where goods_receipt_line_id = $1`, ln.ID).Scan(&lotQty); err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to sum lots.", "ERR_INTERNAL")
					return
				}
				if err := inventory.ValidateGRLotCapture(ln.ID, ln.LotPolicy, lotQty, ln.ReceivedQty); err != nil {
					response.Validation(w, map[string]string{"lots": err.Error()})
					return
				}
			}
		}

		for _, ln := range lines {
			_, err = tx.Exec(r.Context(), `
				update public.gr_goods_receipt_lines grl
				set base_unit_cost = coalesce(pol.unit_non_vat, 0),
				    unit_cost = coalesce(pol.unit_non_vat, 0)
				from public.po_purchase_order_lines pol
				where grl.id = $1 and pol.id = grl.purchase_order_line_id`, ln.ID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to set GR unit cost.", "ERR_INTERNAL")
				return
			}
		}

		userID := tu.AppUserID

		for _, ln := range lines {
			if ln.TrackSerial {
				wEnd := warrantyEndDate(receiptDate, ln.WarrantyMonths)
				if ln.ItemID == nil {
					response.Validation(w, map[string]string{"item_id": "Serial line missing item."})
					return
				}
				var ledgerDup int
				if err := tx.QueryRow(r.Context(), `
					select count(*) from public.inv_serial_units su
					where su.tenant_id = $1 and su.status <> 'void'
					  and su.serial_no in (
					    select gs.serial_no from public.gr_goods_receipt_serials gs
					    where gs.goods_receipt_line_id = $2
					  )`, tu.TenantID, ln.ID).Scan(&ledgerDup); err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to validate serials.", "ERR_INTERNAL")
					return
				}
				if ledgerDup > 0 {
					response.Validation(w, map[string]string{"serial_no": "One or more serials already exist in inventory."})
					return
				}
				unitRows, err := tx.Query(r.Context(), `
					insert into public.inv_serial_units (
					  tenant_id, item_id, serial_no, status, location_id, partner_id,
					  warranty_start, warranty_end, purchase_order_line_id, goods_receipt_line_id,
					  received_at
					)
					select $1, $2, gs.serial_no, 'in_stock', $3, $4,
					  $5::date, $6::date, $7, $8,
					  $5::timestamptz
					from public.gr_goods_receipt_serials gs
					where gs.goods_receipt_line_id = $8
					order by gs.serial_no
					returning id, serial_no`,
					tu.TenantID, *ln.ItemID, locationID, ln.PartnerID,
					receiptDate, wEnd, ln.PurchaseOrderLineID, ln.ID,
				)
				if err != nil {
					response.Validation(w, map[string]string{"serial_no": "One or more serials already exist."})
					return
				}
				locID := locationID
				var createdUnits []struct {
					unitID   int64
					serialNo string
				}
				for unitRows.Next() {
					var unitID int64
					var serialNo string
					if err := unitRows.Scan(&unitID, &serialNo); err != nil {
						unitRows.Close()
						response.Err(w, http.StatusInternalServerError, "Failed to read serial unit.", "ERR_INTERNAL")
						return
					}
					createdUnits = append(createdUnits, struct {
						unitID   int64
						serialNo string
					}{unitID: unitID, serialNo: serialNo})
				}
				if err := unitRows.Err(); err != nil {
					unitRows.Close()
					response.Err(w, http.StatusInternalServerError, "Failed to process serials.", "ERR_INTERNAL")
					return
				}
				unitRows.Close()
				for _, u := range createdUnits {
					if err := inventory.InsertSerialEvent(r.Context(), tx, tu.TenantID, u.unitID, "received", nil, &locID, "goods_receipt", grID, &userID); err != nil {
						response.Err(w, http.StatusInternalServerError, "Failed to record serial event.", "ERR_INTERNAL")
						return
					}
					_ = u.serialNo
				}
			}

			if ln.TrackLot && ln.ItemID != nil {
				lotRows, err := tx.Query(r.Context(), `
					select lot_no, qty::float8, expiry_date
					from public.gr_goods_receipt_line_lots
					where goods_receipt_line_id = $1
					order by lot_no`, ln.ID)
				if err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to load lots.", "ERR_INTERNAL")
					return
				}
				type grLot struct {
					lotNo  string
					qty    float64
					expiry *time.Time
				}
				var lots []grLot
				for lotRows.Next() {
					var l grLot
					if err := lotRows.Scan(&l.lotNo, &l.qty, &l.expiry); err != nil {
						lotRows.Close()
						response.Err(w, http.StatusInternalServerError, "Failed to read lot.", "ERR_INTERNAL")
						return
					}
					lots = append(lots, l)
				}
				if err := lotRows.Err(); err != nil {
					lotRows.Close()
					response.Err(w, http.StatusInternalServerError, "Failed to process lots.", "ERR_INTERNAL")
					return
				}
				lotRows.Close()
				for _, l := range lots {
					lotNo, expiry := l.lotNo, l.expiry
					lotQty, err := inventory.BaseQtyForLine(r.Context(), tx, tu.TenantID, *ln.ItemID, ln.UnitID, l.qty)
					if err != nil {
						response.Validation(w, map[string]string{"lots": fmt.Sprintf("Line %d: %v", ln.ID, err)})
						return
					}
					var lotBatchID int64
					err = tx.QueryRow(r.Context(), `
						insert into public.inv_lot_batches (
						  tenant_id, item_id, lot_no, location_id, qty_on_hand, expiry_date,
						  purchase_order_line_id, goods_receipt_line_id
						) values ($1, $2, $3, $4, $5, $6, $7, $8)
						on conflict (tenant_id, item_id, lot_no, location_id)
						do update set
						  qty_on_hand = inv_lot_batches.qty_on_hand + excluded.qty_on_hand,
						  expiry_date = coalesce(excluded.expiry_date, inv_lot_batches.expiry_date),
						  goods_receipt_line_id = coalesce(excluded.goods_receipt_line_id, inv_lot_batches.goods_receipt_line_id),
						  updated_at = now()
						returning id`,
						tu.TenantID, *ln.ItemID, lotNo, locationID, lotQty, expiry,
						ln.PurchaseOrderLineID, ln.ID).Scan(&lotBatchID)
					if err != nil {
						response.Err(w, http.StatusInternalServerError, "Failed to upsert lot batch.", "ERR_INTERNAL")
						return
					}
					lotLocID := locationID
					if err := inventory.InsertLotEvent(r.Context(), tx, inventory.LotEventInput{
						TenantID:        tu.TenantID,
						LotBatchID:      lotBatchID,
						EventType:       "received",
						ToLocationID:    &lotLocID,
						Qty:             lotQty,
						RefType:         "goods_receipt",
						RefID:           &grID,
						CreatedByUserID: &userID,
					}); err != nil {
						response.Err(w, http.StatusInternalServerError, "Failed to record lot event.", "ERR_INTERNAL")
						return
					}
				}
				if err := inventory.LinkContainersAfterGoodsReceiptPost(r.Context(), tx, tu.TenantID, ln.ID, *ln.ItemID, locationID, receiptDate); err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to link containers.", "ERR_INTERNAL")
					return
				}
			}

			// Qty ledger: track_inventory_qty, or lot/serial (those imply stock even if the
			// inventory-qty flag was left off on the item master).
			postsQty := ln.TrackInventory || ln.TrackLot || ln.TrackSerial
			if postsQty && ln.ItemID != nil && ln.ReceivedQty > 0 {
				_, err = tx.Exec(r.Context(), `
					insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand)
					values ($1, $2, $3, $4)
					on conflict (tenant_id, item_id, location_id)
					do update set qty_on_hand = inv_item_location_balances.qty_on_hand + excluded.qty_on_hand, updated_at = now()`,
					tu.TenantID, *ln.ItemID, locationID, ln.BaseQty)
				if err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to update stock balance.", "ERR_INTERNAL")
					return
				}
				_, err = tx.Exec(r.Context(), `
					insert into public.inv_stock_movements (
					  tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, created_by_user_id
					) values ($1, $2, $3, $4, 'goods_receipt', 'goods_receipt', $5, $6)`,
					tu.TenantID, *ln.ItemID, locationID, ln.BaseQty, grID, tu.AppUserID)
				if err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to record stock movement.", "ERR_INTERNAL")
					return
				}
			}

			tag, err := tx.Exec(r.Context(), `
				update public.po_purchase_order_lines
				set received_qty = received_qty + $1
				where id = $2 and (qty - received_qty) >= $1 - 0.0001`,
				ln.ReceivedQty, ln.PurchaseOrderLineID)
			if err != nil || tag.RowsAffected() == 0 {
				response.Validation(w, map[string]string{"received_qty": "Failed to update purchase order line quantity."})
				return
			}
		}

		var glLines []inventorygl.Line
		for _, ln := range lines {
			postsQty := ln.TrackInventory || ln.TrackLot || ln.TrackSerial
			if ln.ItemID == nil || !postsQty || ln.BaseQty <= 0 {
				continue
			}
			glLines = append(glLines, inventorygl.Line{
				ItemID:         *ln.ItemID,
				Qty:            ln.BaseQty,
				UnitCost:       ln.UnitCost,
				TrackInventory: true,
			})
		}
		if _, err := inventorygl.PostReceiptTx(
			r.Context(), tx, tu.TenantID, userID, receiptDate,
			"goods_receipt", grID, "Goods receipt post", glLines,
		); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to post inventory GL for goods receipt.", "ERR_INTERNAL")
			return
		}

		// Customer warranty coverage is created on Sales (SyncWarrantyAssetsFromSale).
		// Unit warranty dates are already stamped on inv_serial_units at receive.
		// Do not create crm_warranty_assets here — receipt partner is typically the vendor.

		var openLines int
		if err := tx.QueryRow(r.Context(), `
			select count(*) from public.po_purchase_order_lines
			where purchase_order_id = $1 and (qty - received_qty) > 0.0001`, purchaseOrderID).Scan(&openLines); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to evaluate purchase order.", "ERR_INTERNAL")
			return
		}
		newPOStatus := "received"
		if openLines > 0 {
			newPOStatus = "partially_received"
		}
		_, err = tx.Exec(r.Context(), `
			update public.po_purchase_orders
			set status = $1, updated_at = now()
			where id = $2`, newPOStatus, purchaseOrderID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update purchase order status.", "ERR_INTERNAL")
			return
		}

		_, err = tx.Exec(r.Context(), `
			update public.gr_goods_receipts
			set status = 'posted', updated_at = now()
			where id = $1`, grID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to post goods receipt.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to post goods receipt.", "ERR_INTERNAL")
			return
		}

		gr, err := loadGoodsReceipt(r.Context(), pool, tu.TenantID, grID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Posted but failed to load goods receipt.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "goods_receipt.post", "gr_goods_receipt", &grID, nil, nil)

		msg := "Goods receipt posted."
		if siID, err := finance.CreateSupplierInvoiceFromGoodsReceipt(r.Context(), pool, tu, grID); err != nil {
			log.Printf("goods_receipt.post auto supplier invoice gr=%d: %v", grID, err)
			detail := ""
			for _, v := range finance.ValidationFields(err) {
				if v != "" {
					detail = v
					break
				}
			}
			if detail != "" {
				msg = "Goods receipt posted. Purchase invoice not created: " + detail
			} else {
				msg = "Goods receipt posted. Purchase invoice was not created automatically."
			}
		} else if siID > 0 {
			msg = fmt.Sprintf("Goods receipt posted. Purchase invoice #%d created for payables.", siID)
		}
		response.OK(w, gr, msg)
	}
}

func reverseGoodsReceipt(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		grID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to reverse goods receipt.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var purchaseOrderID, locationID int64
		var status string
		err = tx.QueryRow(r.Context(), `
			select purchase_order_id, location_id, status
			from public.gr_goods_receipts
			where id = $1 and tenant_id = $2
			for update`, grID, tu.TenantID).Scan(&purchaseOrderID, &locationID, &status)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Goods receipt not found.", "ERR_NOT_FOUND")
			return
		}
		if status != "posted" {
			response.Validation(w, map[string]string{"status": "Only posted goods receipts can be reversed."})
			return
		}

		var blockedSerials int
		if err := tx.QueryRow(r.Context(), `
			select count(*) from public.inv_serial_units su
			where su.tenant_id = $1 and su.goods_receipt_line_id in (
			  select id from public.gr_goods_receipt_lines where goods_receipt_id = $2
			) and su.status = any($3)`, tu.TenantID, grID, reversalBlockingSerialStatuses).Scan(&blockedSerials); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to check serials.", "ERR_INTERNAL")
			return
		}
		if blockedSerials > 0 {
			response.Validation(w, map[string]string{
				"serials": "Cannot reverse: one or more received serials have been sold or are reserved.",
			})
			return
		}

		lineRows, err := tx.Query(r.Context(), `
			select grl.id, grl.purchase_order_line_id, grl.received_qty::float8,
			  pol.item_id, coalesce(i.track_serial, false), coalesce(i.track_lot, false),
			  coalesce(i.track_inventory_qty, false)
			from public.gr_goods_receipt_lines grl
			join public.po_purchase_order_lines pol on pol.id = grl.purchase_order_line_id
			left join public.inv_items i on i.id = pol.item_id
			where grl.goods_receipt_id = $1
			order by grl.line_no`, grID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load lines.", "ERR_INTERNAL")
			return
		}
		defer lineRows.Close()

		type lineReverse struct {
			ID                  int64
			PurchaseOrderLineID int64
			ReceivedQty         float64
			ItemID              *int64
			TrackSerial         bool
			TrackLot            bool
			TrackInventory      bool
		}
		var lines []lineReverse
		for lineRows.Next() {
			var ln lineReverse
			if err := lineRows.Scan(&ln.ID, &ln.PurchaseOrderLineID, &ln.ReceivedQty, &ln.ItemID,
				&ln.TrackSerial, &ln.TrackLot, &ln.TrackInventory); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read lines.", "ERR_INTERNAL")
				return
			}
			if ln.ReceivedQty <= 0 {
				continue
			}
			lines = append(lines, ln)
		}
		if err := lineRows.Err(); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to process lines.", "ERR_INTERNAL")
			return
		}
		lineRows.Close()

		userID := tu.AppUserID
		for _, ln := range lines {
			if ln.TrackSerial {
				unitRows, err := tx.Query(r.Context(), `
					select id from public.inv_serial_units
					where tenant_id = $1 and goods_receipt_line_id = $2
					for update`, tu.TenantID, ln.ID)
				if err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to load serial units.", "ERR_INTERNAL")
					return
				}
				var unitIDs []int64
				for unitRows.Next() {
					var unitID int64
					if err := unitRows.Scan(&unitID); err != nil {
						unitRows.Close()
						response.Err(w, http.StatusInternalServerError, "Failed to read serial unit.", "ERR_INTERNAL")
						return
					}
					unitIDs = append(unitIDs, unitID)
				}
				if err := unitRows.Err(); err != nil {
					unitRows.Close()
					response.Err(w, http.StatusInternalServerError, "Failed to process serials.", "ERR_INTERNAL")
					return
				}
				unitRows.Close()
				for _, unitID := range unitIDs {
					_, err = tx.Exec(r.Context(), `
						update public.inv_serial_units
						set status = 'void', location_id = null, updated_at = now()
						where id = $1`, unitID)
					if err != nil {
						response.Err(w, http.StatusInternalServerError, "Failed to void serial.", "ERR_INTERNAL")
						return
					}
					if err := inventory.InsertSerialEvent(r.Context(), tx, tu.TenantID, unitID, "voided", nil, nil, "goods_receipt", grID, &userID); err != nil {
						response.Err(w, http.StatusInternalServerError, "Failed to record serial event.", "ERR_INTERNAL")
						return
					}
				}
			}

			if ln.TrackLot && ln.ItemID != nil {
				lotRows, err := tx.Query(r.Context(), `
					select lot_no, qty::float8
					from public.gr_goods_receipt_line_lots
					where goods_receipt_line_id = $1
					order by lot_no`, ln.ID)
				if err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to load lots.", "ERR_INTERNAL")
					return
				}
				type lotReverse struct {
					LotNo string
					Qty   float64
				}
				var lots []lotReverse
				for lotRows.Next() {
					var lot lotReverse
					if err := lotRows.Scan(&lot.LotNo, &lot.Qty); err != nil {
						lotRows.Close()
						response.Err(w, http.StatusInternalServerError, "Failed to read lot.", "ERR_INTERNAL")
						return
					}
					if lot.Qty > 0 {
						lots = append(lots, lot)
					}
				}
				if err := lotRows.Err(); err != nil {
					lotRows.Close()
					response.Err(w, http.StatusInternalServerError, "Failed to process lots.", "ERR_INTERNAL")
					return
				}
				lotRows.Close()
				for _, lot := range lots {
					var lotBatchID int64
					err := tx.QueryRow(r.Context(), `
						update public.inv_lot_batches
						set qty_on_hand = qty_on_hand - $1, updated_at = now()
						where tenant_id = $2 and item_id = $3 and lot_no = $4 and location_id = $5
						  and qty_on_hand >= $1 - 0.0001
						returning id`,
						lot.Qty, tu.TenantID, *ln.ItemID, lot.LotNo, locationID).Scan(&lotBatchID)
					if err != nil {
						response.Validation(w, map[string]string{
							"lots": fmt.Sprintf("Insufficient quantity in lot %s to reverse line %d.", lot.LotNo, ln.ID),
						})
						return
					}
					lotLocID := locationID
					if err := inventory.InsertLotEvent(r.Context(), tx, inventory.LotEventInput{
						TenantID:        tu.TenantID,
						LotBatchID:      lotBatchID,
						EventType:       "voided",
						FromLocationID:  &lotLocID,
						Qty:             lot.Qty,
						RefType:         "goods_receipt",
						RefID:           &grID,
						CreatedByUserID: &userID,
					}); err != nil {
						response.Err(w, http.StatusInternalServerError, "Failed to record lot event.", "ERR_INTERNAL")
						return
					}
				}
			}

			postsQty := ln.TrackInventory || ln.TrackLot || ln.TrackSerial
			if postsQty && ln.ItemID != nil {
				tag, err := tx.Exec(r.Context(), `
					update public.inv_item_location_balances
					set qty_on_hand = qty_on_hand - $1, updated_at = now()
					where tenant_id = $2 and item_id = $3 and location_id = $4
					  and qty_on_hand >= $1 - 0.0001`,
					ln.ReceivedQty, tu.TenantID, *ln.ItemID, locationID)
				if err != nil || tag.RowsAffected() == 0 {
					response.Validation(w, map[string]string{
						"stock": fmt.Sprintf("Insufficient stock to reverse line %d.", ln.ID),
					})
					return
				}
				_, err = tx.Exec(r.Context(), `
					insert into public.inv_stock_movements (
					  tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, created_by_user_id
					) values ($1, $2, $3, $4, 'goods_receipt_reversal', 'goods_receipt', $5, $6)`,
					tu.TenantID, *ln.ItemID, locationID, -ln.ReceivedQty, grID, tu.AppUserID)
				if err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to record stock movement.", "ERR_INTERNAL")
					return
				}
			}

			tag, err := tx.Exec(r.Context(), `
				update public.po_purchase_order_lines
				set received_qty = received_qty - $1
				where id = $2 and received_qty >= $1 - 0.0001`,
				ln.ReceivedQty, ln.PurchaseOrderLineID)
			if err != nil || tag.RowsAffected() == 0 {
				response.Validation(w, map[string]string{"received_qty": "Failed to update purchase order line quantity."})
				return
			}
		}

		_, err = tx.Exec(r.Context(), `
			update public.crm_warranty_assets
			set status = 'void', updated_at = now()
			where tenant_id = $1 and goods_receipt_line_id in (
			  select id from public.gr_goods_receipt_lines where goods_receipt_id = $2
			) and status <> 'void'`, tu.TenantID, grID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to void warranty assets.", "ERR_INTERNAL")
			return
		}

		var openLines int
		if err := tx.QueryRow(r.Context(), `
			select count(*) from public.po_purchase_order_lines
			where purchase_order_id = $1 and (qty - received_qty) > 0.0001`, purchaseOrderID).Scan(&openLines); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to evaluate purchase order.", "ERR_INTERNAL")
			return
		}
		newPOStatus := "received"
		if openLines > 0 {
			newPOStatus = "partially_received"
		} else {
			var anyReceived float64
			_ = tx.QueryRow(r.Context(), `
				select coalesce(sum(received_qty), 0)::float8
				from public.po_purchase_order_lines where purchase_order_id = $1`, purchaseOrderID).Scan(&anyReceived)
			if anyReceived <= 0.0001 {
				newPOStatus = "confirmed"
			}
		}
		_, err = tx.Exec(r.Context(), `
			update public.po_purchase_orders
			set status = $1, updated_at = now()
			where id = $2`, newPOStatus, purchaseOrderID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update purchase order status.", "ERR_INTERNAL")
			return
		}

		_, err = tx.Exec(r.Context(), `
			update public.gr_goods_receipts
			set status = 'cancelled', updated_at = now()
			where id = $1`, grID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to reverse goods receipt.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to reverse goods receipt.", "ERR_INTERNAL")
			return
		}

		gr, err := loadGoodsReceipt(r.Context(), pool, tu.TenantID, grID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Reversed but failed to load goods receipt.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "goods_receipt.reverse", "gr_goods_receipt", &grID, nil, nil)
		response.OK(w, gr, "Goods receipt reversed.")
	}
}

type pgxpoolConn interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}
