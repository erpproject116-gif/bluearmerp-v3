package goodsreceipt

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const maxLotBatchSize = 100

type LotScanStatus string

const (
	LotScanAccepted         LotScanStatus = "accepted"
	LotScanDuplicate        LotScanStatus = "duplicate"
	LotScanLineFull         LotScanStatus = "line_full"
	LotScanInvalidLine      LotScanStatus = "invalid_line"
	LotScanIdempotentReplay LotScanStatus = "idempotent_replay"
	LotScanEmpty            LotScanStatus = "empty"
	LotScanBatchDuplicate   LotScanStatus = "batch_duplicate"
)

type lotScanInput struct {
	ClientScanID       string
	GoodsReceiptLineID int64
	LotNo              string
	Qty                float64
	ExpiryDate         *time.Time
}

type lotScanResult struct {
	ClientScanID string        `json:"client_scan_id,omitempty"`
	LotNo        string        `json:"lot_no"`
	Qty          float64       `json:"qty,omitempty"`
	Status       LotScanStatus `json:"status"`
	LotID        *int64        `json:"lot_id,omitempty"`
	Message      string        `json:"message,omitempty"`
}

type grLotLineState struct {
	GRLineID    int64
	GRID        int64
	ExpectedQty float64
	ReceivedQty float64
	TrackLot    bool
	ItemID      int64
	ItemCode    string
	ShelfDays   *int
}

func normalizeLotNo(s string) string {
	return strings.TrimSpace(s)
}

func loadGRLotLineState(ctx context.Context, tx pgx.Tx, lineID int64) (grLotLineState, error) {
	var st grLotLineState
	err := tx.QueryRow(ctx, `
		select grl.id, grl.goods_receipt_id, grl.expected_qty::float8, grl.received_qty::float8,
		  coalesce(i.track_lot, false), coalesce(i.id, 0), coalesce(i.item_code, ''),
		  i.default_shelf_life_days
		from public.gr_goods_receipt_lines grl
		join public.po_purchase_order_lines pol on pol.id = grl.purchase_order_line_id
		left join public.inv_items i on i.id = pol.item_id
		where grl.id = $1`, lineID).Scan(
		&st.GRLineID, &st.GRID, &st.ExpectedQty, &st.ReceivedQty, &st.TrackLot,
		&st.ItemID, &st.ItemCode, &st.ShelfDays,
	)
	return st, err
}

func lookupIdempotentLot(ctx context.Context, tx pgx.Tx, lineID int64, clientScanID string) (int64, string, float64, bool) {
	if clientScanID == "" {
		return 0, "", 0, false
	}
	var lotID int64
	var lotNo string
	var qty float64
	err := tx.QueryRow(ctx, `
		select id, lot_no, qty::float8 from public.gr_goods_receipt_line_lots
		where goods_receipt_line_id = $1 and client_scan_id = $2::uuid`,
		lineID, clientScanID).Scan(&lotID, &lotNo, &qty)
	if err != nil {
		return 0, "", 0, false
	}
	return lotID, lotNo, qty, true
}

func autoLotNo(itemCode string, seq int) string {
	code := strings.TrimSpace(itemCode)
	if code == "" {
		code = "ITEM"
	}
	return fmt.Sprintf("%s-%s-%03d", time.Now().UTC().Format("20060102"), code, seq)
}

func defaultExpiry(shelfDays *int) *time.Time {
	if shelfDays == nil || *shelfDays <= 0 {
		return nil
	}
	d := time.Now().UTC().AddDate(0, 0, *shelfDays)
	t := time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, time.UTC)
	return &t
}

func processLotScans(ctx context.Context, tx pgx.Tx, tenantID, grID int64, scans []lotScanInput) ([]lotScanResult, error) {
	if len(scans) == 0 {
		return nil, errors.New("at least one lot entry is required")
	}
	if len(scans) > maxLotBatchSize {
		return nil, fmt.Errorf("maximum %d lot entries per batch", maxLotBatchSize)
	}

	var status string
	if err := tx.QueryRow(ctx, `
		select status from public.gr_goods_receipts
		where id = $1 and tenant_id = $2
		for update`, grID, tenantID).Scan(&status); err != nil {
		return nil, err
	}
	if status != "draft" {
		return nil, errors.New("only draft goods receipts accept lots")
	}

	lineCache := map[int64]grLotLineState{}
	getLine := func(lineID int64) (grLotLineState, error) {
		if st, ok := lineCache[lineID]; ok {
			return st, nil
		}
		st, err := loadGRLotLineState(ctx, tx, lineID)
		if err != nil {
			return grLotLineState{}, err
		}
		lineCache[lineID] = st
		return st, nil
	}

	seenInBatch := map[string]bool{}
	normalized := make([]lotScanInput, 0, len(scans))
	results := make([]lotScanResult, 0, len(scans))
	lineSeq := map[int64]int{}

	for _, sc := range scans {
		lotNo := normalizeLotNo(sc.LotNo)
		res := lotScanResult{
			ClientScanID: sc.ClientScanID,
			LotNo:        lotNo,
			Qty:          sc.Qty,
		}
		if sc.GoodsReceiptLineID <= 0 {
			res.Status = LotScanInvalidLine
			res.Message = "Line is required."
			results = append(results, res)
			continue
		}
		if sc.Qty <= 0 {
			res.Status = LotScanEmpty
			res.Message = "Quantity must be greater than zero."
			results = append(results, res)
			continue
		}
		batchKey := fmt.Sprintf("%d:%s", sc.GoodsReceiptLineID, lotNo)
		if lotNo != "" && seenInBatch[batchKey] {
			res.Status = LotScanBatchDuplicate
			res.Message = "Duplicate lot in batch."
			results = append(results, res)
			continue
		}
		if lotNo != "" {
			seenInBatch[batchKey] = true
		}
		normalized = append(normalized, sc)
	}

	addedPerLine := map[int64]float64{}

	for _, sc := range normalized {
		res := lotScanResult{
			ClientScanID: sc.ClientScanID,
			LotNo:        sc.LotNo,
			Qty:          sc.Qty,
		}

		if lotID, lotNo, qty, ok := lookupIdempotentLot(ctx, tx, sc.GoodsReceiptLineID, sc.ClientScanID); ok {
			res.Status = LotScanIdempotentReplay
			res.LotID = &lotID
			res.LotNo = lotNo
			res.Qty = qty
			results = append(results, res)
			continue
		}

		line, err := getLine(sc.GoodsReceiptLineID)
		if err != nil || line.GRID != grID {
			res.Status = LotScanInvalidLine
			res.Message = "Line not found on this goods receipt."
			results = append(results, res)
			continue
		}
		if !line.TrackLot {
			res.Status = LotScanInvalidLine
			res.Message = "Item does not track lots."
			results = append(results, res)
			continue
		}

		lotNo := normalizeLotNo(sc.LotNo)
		if lotNo == "" {
			lineSeq[line.GRLineID]++
			lotNo = autoLotNo(line.ItemCode, lineSeq[line.GRLineID])
		}
		res.LotNo = lotNo

		expiry := sc.ExpiryDate
		if expiry == nil {
			expiry = defaultExpiry(line.ShelfDays)
		}

		extra := addedPerLine[sc.GoodsReceiptLineID]
		if line.ReceivedQty+extra+sc.Qty > line.ExpectedQty+0.0001 {
			res.Status = LotScanLineFull
			res.Message = "Lot quantity exceeds open line quantity."
			results = append(results, res)
			continue
		}

		var clientScanArg any
		if sc.ClientScanID != "" {
			clientScanArg = sc.ClientScanID
		}

		var lotID int64
		err = tx.QueryRow(ctx, `
			insert into public.gr_goods_receipt_line_lots (goods_receipt_line_id, lot_no, qty, expiry_date, client_scan_id)
			values ($1, $2, $3, $4, $5::uuid)
			on conflict (goods_receipt_line_id, lot_no) do update set
			  qty = gr_goods_receipt_line_lots.qty + excluded.qty,
			  expiry_date = coalesce(excluded.expiry_date, gr_goods_receipt_line_lots.expiry_date),
			  client_scan_id = coalesce(gr_goods_receipt_line_lots.client_scan_id, excluded.client_scan_id)
			returning id`, sc.GoodsReceiptLineID, lotNo, sc.Qty, expiry, clientScanArg).Scan(&lotID)
		if err != nil {
			res.Status = LotScanDuplicate
			res.Message = "Failed to record lot entry."
			results = append(results, res)
			continue
		}

		addedPerLine[sc.GoodsReceiptLineID] += sc.Qty
		res.Status = LotScanAccepted
		res.LotID = &lotID
		results = append(results, res)
	}

	for lineID, addQty := range addedPerLine {
		if addQty <= 0 {
			continue
		}
		_, err := tx.Exec(ctx, `
			update public.gr_goods_receipt_lines
			set received_qty = received_qty + $1
			where id = $2`, addQty, lineID)
		if err != nil {
			return nil, err
		}
		if st, ok := lineCache[lineID]; ok {
			st.ReceivedQty += addQty
			lineCache[lineID] = st
		}
	}

	return results, nil
}
