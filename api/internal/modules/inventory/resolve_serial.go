package inventory

import (
	"context"
	"log"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const maxResolveScanBatchSize = 100

type resolvedSerialUnit struct {
	SerialUnitID     int64          `json:"serial_unit_id"`
	SerialNo         string         `json:"serial_no"`
	ItemID           int64          `json:"item_id"`
	ItemCode         string         `json:"item_code"`
	ItemName         string         `json:"item_name"`
	ItemCategoryID   *int64         `json:"item_category_id,omitempty"`
	ItemCategoryName string         `json:"item_category_name,omitempty"`
	CustomValues     map[string]any `json:"custom_values,omitempty"`
	Manufacturer     string         `json:"manufacturer,omitempty"`
	Status           string         `json:"status"`
	LocationID       *int64         `json:"location_id,omitempty"`
	LocationName     string         `json:"location_name,omitempty"`
	PartnerID        *int64         `json:"partner_id,omitempty"`
	PartnerName      string         `json:"partner_name,omitempty"`
	WarrantyEnd      *string        `json:"warranty_end,omitempty"`
}

type resolveScanStatus string

const (
	resolveScanAccepted       resolveScanStatus = "accepted"
	resolveScanNotFound       resolveScanStatus = "not_found"
	resolveScanNotReceived    resolveScanStatus = "not_received"
	resolveScanUnavailable    resolveScanStatus = "unavailable"
	resolveScanWrongItem      resolveScanStatus = "wrong_item"
	resolveScanWrongLocation  resolveScanStatus = "wrong_location"
	resolveScanBatchDuplicate resolveScanStatus = "batch_duplicate"
	resolveScanEmpty          resolveScanStatus = "empty"
)

const (
	msgSerialNotFound      = "Serial not found."
	msgSerialNotReceivedPO = "Serial is on a purchase order but not in stock. Complete Purchase Receive, then scan again."
	msgSerialNotReceivedGR = "Serial was scanned on a draft receive but is not in stock yet. Confirm Purchase Receive, then scan again."
)

// isStockConsumingResolveContext is true for flows that require ledger units in stock.
func isStockConsumingResolveContext(context string) bool {
	return context == "sale" || context == "pos" || context == "release"
}

type resolveScanBatchResult struct {
	ClientScanID string              `json:"client_scan_id,omitempty"`
	SerialNo     string              `json:"serial_no"`
	Status       resolveScanStatus   `json:"status"`
	Message      string              `json:"message,omitempty"`
	Unit         *resolvedSerialUnit `json:"unit,omitempty"`
}

func normalizeResolveSerialNo(s string) string {
	s = strings.TrimSpace(s)
	s = strings.Trim(s, "\r\n\t")
	return s
}

func allowedSerialStatusForContext(context string) map[string]bool {
	allowed := map[string]bool{"in_stock": true, "reserved": true}
	if context == "release" {
		allowed["reserved"] = true
	}
	return allowed
}

func extractManufacturer(vals map[string]any) string {
	if len(vals) == 0 {
		return ""
	}
	for _, key := range []string{"manufacturer", "brand", "make"} {
		for k, v := range vals {
			if strings.EqualFold(k, key) {
				if s, ok := v.(string); ok {
					s = strings.TrimSpace(s)
					if s != "" {
						return s
					}
				}
			}
		}
	}
	return ""
}

func lookupResolvedSerial(ctx context.Context, pool *pgxpool.Pool, tenantID int64, serialNo string, locationID *int64) (*resolvedSerialUnit, error) {
	serialNo = normalizeResolveSerialNo(serialNo)
	where := `su.tenant_id = $1 and lower(btrim(su.serial_no)) = lower(btrim($2::text)) and su.status <> 'void'`
	args := []any{tenantID, serialNo}
	if locationID != nil && *locationID > 0 {
		where += ` and su.location_id = $3`
		args = append(args, *locationID)
	}

	var unit resolvedSerialUnit
	var catID *int64
	var catName string
	var wEnd *time.Time
	err := pool.QueryRow(ctx, `
		select su.id, su.serial_no, su.item_id, i.item_code, i.item_name,
		  i.item_category_id, coalesce(cat.name, ''),
		  su.status, su.location_id, coalesce(loc.location_name, ''),
		  su.partner_id, coalesce(p.company_name, ''),
		  su.warranty_end
		from public.inv_serial_units su
		join public.inv_items i on i.id = su.item_id
		left join public.inv_item_categories cat on cat.id = i.item_category_id
		left join public.inv_locations loc on loc.id = su.location_id
		left join public.inv_partners p on p.id = su.partner_id
		where `+where+`
		order by su.id desc limit 1`, args...).Scan(
		&unit.SerialUnitID, &unit.SerialNo, &unit.ItemID, &unit.ItemCode, &unit.ItemName,
		&catID, &catName,
		&unit.Status, &unit.LocationID, &unit.LocationName,
		&unit.PartnerID, &unit.PartnerName, &wEnd,
	)
	if err != nil {
		return nil, err
	}
	unit.ItemCategoryID = catID
	unit.ItemCategoryName = catName
	unit.WarrantyEnd = formatDatePtr(wEnd)
	unit.CustomValues = attachCustom(ctx, pool, tenantID, entityItem, unit.ItemID)
	unit.Manufacturer = extractManufacturer(unit.CustomValues)
	return &unit, nil
}

func enrichResolvedUnits(ctx context.Context, pool *pgxpool.Pool, tenantID int64, units []*resolvedSerialUnit) {
	ids := make([]int64, 0, len(units))
	seen := map[int64]bool{}
	for _, u := range units {
		if u == nil || seen[u.ItemID] {
			continue
		}
		seen[u.ItemID] = true
		ids = append(ids, u.ItemID)
	}
	if len(ids) == 0 {
		return
	}
	mergeCustomValues(ctx, pool, tenantID, entityItem, ids, func(id int64, vals map[string]any) {
		for _, u := range units {
			if u != nil && u.ItemID == id {
				u.CustomValues = vals
				u.Manufacturer = extractManufacturer(vals)
			}
		}
	})
}

// classifyLedgerMiss maps a missing ledger unit to not_found vs not_received.
// Never returns a Unit — planned/draft serials are not sellable.
func classifyLedgerMiss(serialNo string, context string, plannedOnPO, onDraftGR bool) resolveScanBatchResult {
	res := resolveScanBatchResult{SerialNo: serialNo}
	if isStockConsumingResolveContext(context) {
		if onDraftGR {
			res.Status = resolveScanNotReceived
			res.Message = msgSerialNotReceivedGR
			return res
		}
		if plannedOnPO {
			res.Status = resolveScanNotReceived
			res.Message = msgSerialNotReceivedPO
			return res
		}
	}
	res.Status = resolveScanNotFound
	res.Message = msgSerialNotFound
	return res
}

func serialPlannedOnOpenPO(ctx context.Context, pool *pgxpool.Pool, tenantID int64, serialNo string) (bool, error) {
	if pool == nil {
		return false, nil
	}
	var exists bool
	err := pool.QueryRow(ctx, `
		select exists(
		  select 1
		  from public.po_purchase_order_lines ln
		  join public.po_purchase_orders po on po.id = ln.purchase_order_id
		  where po.tenant_id = $1
		    and po.deleted_at is null
		    and po.status <> 'cancelled'
		    and exists (
		      select 1 from unnest(coalesce(ln.planned_serial_nos, '{}')) p
		      where lower(btrim(p)) = lower(btrim($2::text))
		    )
		)`, tenantID, serialNo).Scan(&exists)
	return exists, err
}

func serialOnDraftGoodsReceipt(ctx context.Context, pool *pgxpool.Pool, tenantID int64, serialNo string) (bool, error) {
	if pool == nil {
		return false, nil
	}
	var exists bool
	err := pool.QueryRow(ctx, `
		select exists(
		  select 1
		  from public.gr_goods_receipt_serials gs
		  join public.gr_goods_receipt_lines grl on grl.id = gs.goods_receipt_line_id
		  join public.gr_goods_receipts gr on gr.id = grl.goods_receipt_id
		  where gr.tenant_id = $1
		    and gr.status in ('draft', 'posted')
		    and lower(btrim(gs.serial_no)) = lower(btrim($2::text))
		)`, tenantID, serialNo).Scan(&exists)
	return exists, err
}

func resolveLedgerMiss(
	ctx context.Context,
	pool *pgxpool.Pool,
	tenantID int64,
	serialNo string,
	context string,
) resolveScanBatchResult {
	plannedOnPO, errPO := serialPlannedOnOpenPO(ctx, pool, tenantID, serialNo)
	if errPO != nil {
		return resolveScanBatchResult{SerialNo: serialNo, Status: resolveScanNotFound, Message: msgSerialNotFound}
	}
	onDraftGR, errGR := serialOnDraftGoodsReceipt(ctx, pool, tenantID, serialNo)
	if errGR != nil {
		return resolveScanBatchResult{SerialNo: serialNo, Status: resolveScanNotFound, Message: msgSerialNotFound}
	}
	return classifyLedgerMiss(serialNo, context, plannedOnPO, onDraftGR)
}

func resolveOneSerial(
	ctx context.Context,
	pool *pgxpool.Pool,
	tenantID int64,
	serialNo string,
	locationID *int64,
	filterItemID *int64,
	context string,
	seenInBatch map[string]bool,
) resolveScanBatchResult {
	res := resolveScanBatchResult{SerialNo: serialNo}
	sn := normalizeResolveSerialNo(serialNo)
	res.SerialNo = sn
	if sn == "" {
		res.Status = resolveScanEmpty
		res.Message = "Serial number is required."
		return res
	}
	if context == "" {
		context = "sale"
	}
	seenKey := strings.ToLower(sn)
	if seenInBatch[seenKey] {
		res.Status = resolveScanBatchDuplicate
		res.Message = "Duplicate serial in this batch."
		return res
	}
	seenInBatch[seenKey] = true

	unit, err := lookupResolvedSerial(ctx, pool, tenantID, sn, locationID)
	if err != nil {
		if err == pgx.ErrNoRows {
			if locationID != nil && *locationID > 0 {
				unitAny, err2 := lookupResolvedSerial(ctx, pool, tenantID, sn, nil)
				if err2 == nil && unitAny != nil {
					res.Status = resolveScanWrongLocation
					res.Message = "Serial is not at the selected location."
					return res
				}
			}
			return resolveLedgerMiss(ctx, pool, tenantID, sn, context)
		}
		log.Printf("inventory: resolve serial %q: %v", sn, err)
		res.Status = resolveScanNotFound
		res.Message = msgSerialNotFound
		return res
	}

	// Purchase / lookup: any non-void serial identifies the item for line fill.
	if context == "lookup" || context == "purchase" {
		if filterItemID != nil && *filterItemID > 0 && unit.ItemID != *filterItemID {
			res.Status = resolveScanWrongItem
			res.Message = "Serial belongs to " + unit.ItemCode + ", not this line."
			return res
		}
		res.Status = resolveScanAccepted
		res.Unit = unit
		return res
	}

	allowed := allowedSerialStatusForContext(context)
	if !allowed[unit.Status] {
		res.Status = resolveScanUnavailable
		res.Message = "Serial is not available for sale."
		return res
	}
	if filterItemID != nil && *filterItemID > 0 && unit.ItemID != *filterItemID {
		res.Status = resolveScanWrongItem
		res.Message = "Serial belongs to " + unit.ItemCode + ", not this line."
		return res
	}

	res.Status = resolveScanAccepted
	res.Unit = unit
	return res
}

func resolveSerialBatch(
	ctx context.Context,
	pool *pgxpool.Pool,
	tenantID int64,
	scans []struct {
		ClientScanID string
		SerialNo     string
	},
	locationID *int64,
	filterItemID *int64,
	context string,
) ([]resolveScanBatchResult, error) {
	if len(scans) == 0 {
		return nil, nil
	}
	if len(scans) > maxResolveScanBatchSize {
		return nil, errResolveBatchTooLarge
	}

	seenInBatch := map[string]bool{}
	results := make([]resolveScanBatchResult, 0, len(scans))
	var accepted []*resolvedSerialUnit
	for _, sc := range scans {
		res := resolveOneSerial(ctx, pool, tenantID, sc.SerialNo, locationID, filterItemID, context, seenInBatch)
		res.ClientScanID = sc.ClientScanID
		if res.Status == resolveScanAccepted && res.Unit != nil {
			accepted = append(accepted, res.Unit)
		}
		results = append(results, res)
	}
	enrichResolvedUnits(ctx, pool, tenantID, accepted)
	return results, nil
}

var errResolveBatchTooLarge = &resolveBatchSizeError{}

type resolveBatchSizeError struct{}

func (e *resolveBatchSizeError) Error() string {
	return "batch too large"
}
