package goodsreceipt

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

const maxSerialBatchSize = 100

// reversalBlockingSerialStatuses lists serial statuses that block a goods receipt reversal:
// sold units belong to a customer and reserved units are committed to a sales order.
var reversalBlockingSerialStatuses = []string{"sold", "reserved"}

// SerialScanStatus is the outcome of a single scan in a batch request.
type SerialScanStatus string

const (
	SerialScanAccepted         SerialScanStatus = "accepted"
	SerialScanDuplicate        SerialScanStatus = "duplicate"
	SerialScanLineFull         SerialScanStatus = "line_full"
	SerialScanInvalidLine      SerialScanStatus = "invalid_line"
	SerialScanIdempotentReplay SerialScanStatus = "idempotent_replay"
	SerialScanEmpty            SerialScanStatus = "empty"
	SerialScanBatchDuplicate   SerialScanStatus = "batch_duplicate"
)

type serialScanInput struct {
	ClientScanID       string
	GoodsReceiptLineID int64
	SerialNo           string
}

type serialScanResult struct {
	ClientScanID string           `json:"client_scan_id,omitempty"`
	SerialNo     string           `json:"serial_no"`
	Status       SerialScanStatus `json:"status"`
	SerialID     *int64           `json:"serial_id,omitempty"`
	Message      string           `json:"message,omitempty"`
}

type grLineState struct {
	GRLineID    int64
	GRID        int64
	ExpectedQty float64
	ReceivedQty float64
	TrackSerial bool
}

func normalizeSerialNo(s string) string {
	s = strings.TrimSpace(s)
	s = strings.Trim(s, "\r\n\t")
	return s
}

func assertSerialAvailable(ctx context.Context, tx pgx.Tx, tenantID int64, serialNo string, excludeGrID int64) error {
	var inLedger bool
	err := tx.QueryRow(ctx, `
		select exists(
		  select 1 from public.inv_serial_units
		  where tenant_id = $1 and serial_no = $2 and status <> 'void'
		)`, tenantID, serialNo).Scan(&inLedger)
	if err != nil {
		return errors.New("failed to validate serial number.")
	}
	if inLedger {
		return errors.New("serial number already exists.")
	}

	var inDraft bool
	err = tx.QueryRow(ctx, `
		select exists(
		  select 1
		  from public.gr_goods_receipt_serials gs
		  join public.gr_goods_receipt_lines grl on grl.id = gs.goods_receipt_line_id
		  join public.gr_goods_receipts gr on gr.id = grl.goods_receipt_id
		  where gr.tenant_id = $1 and gr.status = 'draft' and gr.id <> $2
		    and gs.serial_no = $3
		)`, tenantID, excludeGrID, serialNo).Scan(&inDraft)
	if err != nil {
		return errors.New("failed to validate serial number.")
	}
	if inDraft {
		return errors.New("serial number is pending on another draft goods receipt.")
	}
	return nil
}

// assertSerialNotDuplicate checks ledger only (used at post time).
func assertSerialNotDuplicate(ctx context.Context, tx pgx.Tx, tenantID int64, serialNo string) error {
	var inLedger bool
	err := tx.QueryRow(ctx, `
		select exists(
		  select 1 from public.inv_serial_units
		  where tenant_id = $1 and serial_no = $2 and status <> 'void'
		)`, tenantID, serialNo).Scan(&inLedger)
	if err != nil {
		return errors.New("failed to validate serial number.")
	}
	if inLedger {
		return errors.New("serial number already exists.")
	}
	return nil
}

func loadGRLineState(ctx context.Context, tx pgx.Tx, lineID int64) (grLineState, error) {
	var st grLineState
	err := tx.QueryRow(ctx, `
		select grl.id, grl.goods_receipt_id, grl.expected_qty::float8, grl.received_qty::float8,
		  coalesce(i.track_serial, false)
		from public.gr_goods_receipt_lines grl
		join public.po_purchase_order_lines pol on pol.id = grl.purchase_order_line_id
		left join public.inv_items i on i.id = pol.item_id
		where grl.id = $1`, lineID).Scan(
		&st.GRLineID, &st.GRID, &st.ExpectedQty, &st.ReceivedQty, &st.TrackSerial,
	)
	return st, err
}

func lookupIdempotentSerial(ctx context.Context, tx pgx.Tx, lineID int64, clientScanID string) (int64, string, bool) {
	if clientScanID == "" {
		return 0, "", false
	}
	var serialID int64
	var serialNo string
	err := tx.QueryRow(ctx, `
		select id, serial_no from public.gr_goods_receipt_serials
		where goods_receipt_line_id = $1 and client_scan_id = $2::uuid`,
		lineID, clientScanID).Scan(&serialID, &serialNo)
	if err != nil {
		return 0, "", false
	}
	return serialID, serialNo, true
}

func loadUnavailableSerials(ctx context.Context, tx pgx.Tx, tenantID int64, excludeGrID int64, serialNos []string) (map[string]bool, error) {
	out := map[string]bool{}
	if len(serialNos) == 0 {
		return out, nil
	}
	rows, err := tx.Query(ctx, `
		select serial_no from public.inv_serial_units
		where tenant_id = $1 and serial_no = any($2) and status <> 'void'
		union
		select gs.serial_no
		from public.gr_goods_receipt_serials gs
		join public.gr_goods_receipt_lines grl on grl.id = gs.goods_receipt_line_id
		join public.gr_goods_receipts gr on gr.id = grl.goods_receipt_id
		where gr.tenant_id = $1 and gr.status = 'draft' and gr.id <> $3
		  and gs.serial_no = any($2)`, tenantID, serialNos, excludeGrID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var sn string
		if err := rows.Scan(&sn); err != nil {
			return nil, err
		}
		out[sn] = true
	}
	return out, rows.Err()
}

func processSerialScans(ctx context.Context, tx pgx.Tx, tenantID, grID int64, scans []serialScanInput) ([]serialScanResult, error) {
	if len(scans) == 0 {
		return nil, errors.New("at least one scan is required")
	}
	if len(scans) > maxSerialBatchSize {
		return nil, fmt.Errorf("maximum %d scans per batch", maxSerialBatchSize)
	}

	var status string
	if err := tx.QueryRow(ctx, `
		select status from public.gr_goods_receipts
		where id = $1 and tenant_id = $2
		for update`, grID, tenantID).Scan(&status); err != nil {
		return nil, err
	}
	if status != "draft" {
		return nil, errors.New("only draft goods receipts accept serials")
	}

	lineCache := map[int64]grLineState{}
	getLine := func(lineID int64) (grLineState, error) {
		if st, ok := lineCache[lineID]; ok {
			return st, nil
		}
		st, err := loadGRLineState(ctx, tx, lineID)
		if err != nil {
			return grLineState{}, err
		}
		lineCache[lineID] = st
		return st, nil
	}

	// Normalize and validate inputs; detect within-batch duplicates.
	seenInBatch := map[string]bool{}
	normalized := make([]serialScanInput, 0, len(scans))
	results := make([]serialScanResult, 0, len(scans))

	for _, sc := range scans {
		sn := normalizeSerialNo(sc.SerialNo)
		res := serialScanResult{
			ClientScanID: sc.ClientScanID,
			SerialNo:     sn,
		}
		if sc.GoodsReceiptLineID <= 0 {
			res.Status = SerialScanInvalidLine
			res.Message = "Line is required."
			results = append(results, res)
			continue
		}
		if sn == "" {
			res.Status = SerialScanEmpty
			res.Message = "Serial number is required."
			results = append(results, res)
			continue
		}
		if seenInBatch[sn] {
			res.Status = SerialScanBatchDuplicate
			res.Message = "Duplicate serial in batch."
			results = append(results, res)
			continue
		}
		seenInBatch[sn] = true
		normalized = append(normalized, serialScanInput{
			ClientScanID:       sc.ClientScanID,
			GoodsReceiptLineID: sc.GoodsReceiptLineID,
			SerialNo:           sn,
		})
	}

	// Collect serial nos for bulk availability check.
	serialNos := make([]string, 0, len(normalized))
	for _, sc := range normalized {
		serialNos = append(serialNos, sc.SerialNo)
	}
	unavailable, err := loadUnavailableSerials(ctx, tx, tenantID, grID, serialNos)
	if err != nil {
		return nil, err
	}

	acceptedPerLine := map[int64]int{}

	for _, sc := range normalized {
		res := serialScanResult{
			ClientScanID: sc.ClientScanID,
			SerialNo:     sc.SerialNo,
		}

		if serialID, sn, ok := lookupIdempotentSerial(ctx, tx, sc.GoodsReceiptLineID, sc.ClientScanID); ok {
			res.Status = SerialScanIdempotentReplay
			res.SerialID = &serialID
			res.SerialNo = sn
			results = append(results, res)
			continue
		}

		line, err := getLine(sc.GoodsReceiptLineID)
		if err != nil || line.GRID != grID {
			res.Status = SerialScanInvalidLine
			res.Message = "Line not found on this goods receipt."
			results = append(results, res)
			continue
		}
		if !line.TrackSerial {
			res.Status = SerialScanInvalidLine
			res.Message = "Item does not track serial numbers."
			results = append(results, res)
			continue
		}

		extra := acceptedPerLine[sc.GoodsReceiptLineID]
		effectiveReceived := line.ReceivedQty + float64(extra)
		if effectiveReceived+0.0001 >= line.ExpectedQty {
			res.Status = SerialScanLineFull
			res.Message = "Line already has the expected quantity of serials."
			results = append(results, res)
			continue
		}

		if unavailable[sc.SerialNo] {
			res.Status = SerialScanDuplicate
			res.Message = "Serial number already exists or is pending on another receipt."
			results = append(results, res)
			continue
		}

		// Also block duplicate on same line (unique constraint).
		var onLine bool
		_ = tx.QueryRow(ctx, `
			select exists(
			  select 1 from public.gr_goods_receipt_serials
			  where goods_receipt_line_id = $1 and serial_no = $2
			)`, sc.GoodsReceiptLineID, sc.SerialNo).Scan(&onLine)
		if onLine {
			res.Status = SerialScanDuplicate
			res.Message = "Serial already scanned for this line."
			results = append(results, res)
			continue
		}

		var clientScanArg any
		if sc.ClientScanID != "" {
			clientScanArg = sc.ClientScanID
		}

		var serialID int64
		err = tx.QueryRow(ctx, `
			insert into public.gr_goods_receipt_serials (goods_receipt_line_id, serial_no, client_scan_id)
			values ($1, $2, $3::uuid)
			returning id`, sc.GoodsReceiptLineID, sc.SerialNo, clientScanArg).Scan(&serialID)
		if err != nil {
			res.Status = SerialScanDuplicate
			res.Message = "Serial already scanned for this line."
			results = append(results, res)
			continue
		}

		acceptedPerLine[sc.GoodsReceiptLineID]++
		unavailable[sc.SerialNo] = true
		res.Status = SerialScanAccepted
		res.SerialID = &serialID
		results = append(results, res)
	}

	for lineID, count := range acceptedPerLine {
		if count == 0 {
			continue
		}
		_, err := tx.Exec(ctx, `
			update public.gr_goods_receipt_lines
			set received_qty = received_qty + $1
			where id = $2`, count, lineID)
		if err != nil {
			return nil, err
		}
		if st, ok := lineCache[lineID]; ok {
			st.ReceivedQty += float64(count)
			lineCache[lineID] = st
		}
	}

	return results, nil
}
