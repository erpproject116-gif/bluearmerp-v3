package inventory

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/financedefaults"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/fiscalyear"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/inventorygl"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/ledger"
)

const (
	warrantyExpenseAccountCode = "5280"
	coveredWarrantyMessage     = "This serial is outside warranty. Use Goodwill or Denied."
	partKeyRequiredMessage     = "Part key is required for a part that was already issued."
	partQtyEpsilon             = 0.0001
)

type partDelta struct {
	PartKey string
	Qty     float64
	Issue   bool
	Line    RepairOrderLine
}

func newPartKey() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func planPartIssueDeltas(existing map[string]float64, incoming []RepairOrderLine) ([]RepairOrderLine, []partDelta, string) {
	parts := make([]RepairOrderLine, 0, len(incoming))
	for _, ln := range incoming {
		if strings.TrimSpace(ln.LineRole) != "part" {
			continue
		}
		if ln.ItemID == nil && strings.TrimSpace(ln.PartKey) == "" && ln.Qty <= partQtyEpsilon {
			continue
		}
		parts = append(parts, ln)
	}

	seen := map[string]bool{}
	for i := range parts {
		key := strings.TrimSpace(parts[i].PartKey)
		if key == "" {
			continue
		}
		seen[key] = true
	}
	var missingIssued bool
	for key, qty := range existing {
		if qty > partQtyEpsilon && !seen[key] {
			missingIssued = true
			break
		}
	}
	for i := range parts {
		if strings.TrimSpace(parts[i].PartKey) != "" {
			continue
		}
		if missingIssued {
			return nil, nil, partKeyRequiredMessage
		}
		key, err := newPartKey()
		if err != nil {
			return nil, nil, "Could not assign a part key."
		}
		parts[i].PartKey = key
		parts[i].LineRole = "part"
	}

	var deltas []partDelta
	incomingKeys := map[string]bool{}
	for _, ln := range parts {
		key := strings.TrimSpace(ln.PartKey)
		incomingKeys[key] = true
		net := existing[key]
		if ln.Qty > net+partQtyEpsilon {
			deltas = append(deltas, partDelta{PartKey: key, Qty: ln.Qty - net, Issue: true, Line: ln})
		} else if net > ln.Qty+partQtyEpsilon {
			deltas = append(deltas, partDelta{PartKey: key, Qty: net - ln.Qty, Issue: false, Line: ln})
		}
	}
	for key, net := range existing {
		if incomingKeys[key] || net <= partQtyEpsilon {
			continue
		}
		deltas = append(deltas, partDelta{PartKey: key, Qty: net, Issue: false})
	}
	return parts, deltas, ""
}

func serialPartQtyError(trackSerial bool, qty float64) string {
	if trackSerial && qty > partQtyEpsilon && math.Abs(qty-1) > partQtyEpsilon {
		return "A serial-tracked part must have quantity 1."
	}
	return ""
}

func validatePartLines(ctx context.Context, tx pgx.Tx, tenantID int64, parts []RepairOrderLine) error {
	for _, ln := range parts {
		if ln.ItemID == nil || *ln.ItemID <= 0 || ln.Qty <= partQtyEpsilon {
			continue
		}
		var trackSerial bool
		if err := tx.QueryRow(ctx, `
			select coalesce(track_serial, false) from public.inv_items
			where id = $1 and tenant_id = $2`, *ln.ItemID, tenantID).Scan(&trackSerial); err != nil {
			return partFieldError("item_id", "Part item was not found.")
		}
		if msg := serialPartQtyError(trackSerial, ln.Qty); msg != "" {
			return partFieldError("qty", msg)
		}
	}
	return nil
}

func unknownLotError(trackLot bool, found bool) string {
	if trackLot && !found {
		return "Unknown lot."
	}
	return ""
}

func partIssueBlockedByCost(hybridOn bool, price float64) bool {
	return hybridOn && price <= partQtyEpsilon
}

func coverageWarrantyError(decision string, serialID *int64, assetFound bool, status string, warrantyEnd, orderDate time.Time) string {
	if decision != "covered" {
		return ""
	}
	if serialID == nil || *serialID <= 0 || !assetFound || status != "active" || warrantyEnd.Before(orderDate) {
		return coveredWarrantyMessage
	}
	return ""
}

func serialUnitIDFromMatches(ids []int64) *int64 {
	if len(ids) != 1 {
		return nil
	}
	id := ids[0]
	return &id
}

func warrantyJournalDebitCode() string {
	return warrantyExpenseAccountCode
}

func repairPartConsumptionUsesIssues(query string) bool {
	return strings.Contains(query, "public.inv_repair_part_issues")
}

func statusReportKeepsUnitLines(clause string) bool {
	return strings.Contains(clause, "ln.line_role = 'unit'")
}

type partIssueRow struct {
	ItemID       int64
	LocationID   int64
	SerialUnitID *int64
	LotNo        *string
	UnitCost     float64
}

func syncRepairPartIssues(ctx context.Context, tx pgx.Tx, tenantID, userID, orderID int64, orderDate time.Time, coverage string, lines []RepairOrderLine) error {
	existing, err := partIssueNets(ctx, tx, tenantID, orderID)
	if err != nil {
		return err
	}
	parts, deltas, msg := planPartIssueDeltas(existing, lines)
	if msg != "" {
		return partFieldError("part_key", msg)
	}
	if err := validatePartLines(ctx, tx, tenantID, parts); err != nil {
		return err
	}
	if err := writeRepairPartLines(ctx, tx, orderID, lines, parts); err != nil {
		return err
	}
	if coverage != "covered" && coverage != "goodwill" {
		return nil
	}
	hybrid, err := inventorygl.Enabled(ctx, tx, tenantID)
	if err != nil {
		return err
	}
	for _, d := range deltas {
		if d.Issue {
			if err := issueRepairPart(ctx, tx, tenantID, userID, orderID, orderDate, hybrid, d); err != nil {
				return err
			}
			continue
		}
		if err := returnRepairPart(ctx, tx, tenantID, userID, orderID, orderDate, hybrid, d); err != nil {
			return err
		}
	}
	return nil
}

func writeRepairPartLines(ctx context.Context, tx pgx.Tx, orderID int64, all []RepairOrderLine, parts []RepairOrderLine) error {
	unit := make([]RepairOrderLine, 0, len(all))
	for _, ln := range all {
		if strings.TrimSpace(ln.LineRole) == "part" {
			continue
		}
		ln.LineRole = "unit"
		unit = append(unit, ln)
	}
	combined := append(unit, parts...)
	return replaceRepairOrderLines(ctx, tx, orderID, combined)
}

func partIssueNets(ctx context.Context, tx pgx.Tx, tenantID, orderID int64) (map[string]float64, error) {
	rows, err := tx.Query(ctx, `
		select part_key,
		  coalesce(sum(case when direction = 'issue' then qty else -qty end), 0)::float8
		from public.inv_repair_part_issues
		where tenant_id = $1 and repair_order_id = $2
		group by part_key`, tenantID, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]float64{}
	for rows.Next() {
		var key string
		var qty float64
		if err := rows.Scan(&key, &qty); err != nil {
			return nil, err
		}
		out[key] = qty
	}
	return out, rows.Err()
}

func netIssuedQty(ctx context.Context, tx pgx.Tx, tenantID, orderID int64) (float64, error) {
	var qty float64
	err := tx.QueryRow(ctx, `
		select coalesce(sum(case when direction = 'issue' then qty else -qty end), 0)::float8
		from public.inv_repair_part_issues
		where tenant_id = $1 and repair_order_id = $2`, tenantID, orderID).Scan(&qty)
	return qty, err
}

func issueRepairPart(ctx context.Context, tx pgx.Tx, tenantID, userID, orderID int64, orderDate time.Time, hybrid bool, d partDelta) error {
	if d.Line.ItemID == nil || *d.Line.ItemID <= 0 {
		return partFieldError("item_id", "Part item is required.")
	}
	itemID := *d.Line.ItemID
	var trackQty, trackSerial, trackLot bool
	var price float64
	if err := tx.QueryRow(ctx, `
		select coalesce(track_inventory_qty, false), coalesce(track_serial, false), coalesce(track_lot, false),
		  coalesce(purchase_price, 0)::float8
		from public.inv_items where id = $1 and tenant_id = $2`, itemID, tenantID).Scan(&trackQty, &trackSerial, &trackLot, &price); err != nil {
		return partFieldError("item_id", "Part item was not found.")
	}
	if msg := serialPartQtyError(trackSerial, d.Line.Qty); msg != "" {
		return partFieldError("qty", msg)
	}
	if !trackQty && !trackSerial && !trackLot {
		return nil
	}
	if trackSerial && (d.Line.SerialUnitID == nil || *d.Line.SerialUnitID <= 0) {
		return partFieldError("serial_unit_id", "Select an in-stock serial for this part.")
	}
	if trackSerial && math.Abs(d.Qty-1) > partQtyEpsilon {
		return partFieldError("qty", "A serial-tracked part must have quantity 1.")
	}
	if trackLot && strings.TrimSpace(derefString(d.Line.LotNo)) == "" {
		return partFieldError("lot_no", "Select a lot for this part.")
	}
	if d.Line.PartLocationID == nil || *d.Line.PartLocationID <= 0 {
		return partFieldError("location_id", "Part location is required.")
	}
	locationID := *d.Line.PartLocationID
	var isRMA bool
	if err := tx.QueryRow(ctx, `
		select coalesce(is_rma, false) from public.inv_locations
		where id = $1 and tenant_id = $2 and deleted_at is null`, locationID, tenantID).Scan(&isRMA); err != nil {
		return partFieldError("location_id", "Part location was not found.")
	}
	if isRMA {
		return partFieldError("location_id", "Part location must not be an RMA warehouse.")
	}
	if partIssueBlockedByCost(hybrid, price) {
		return partFieldError("purchase_price", "Set a purchase price on the item before using it on a covered repair.")
	}

	var serialID *int64
	var lotNo *string
	if trackSerial {
		serialID = d.Line.SerialUnitID
		var status string
		var curLoc *int64
		err := tx.QueryRow(ctx, `
			select status, location_id from public.inv_serial_units
			where id = $1 and tenant_id = $2 and item_id = $3
			for update`, *serialID, tenantID, itemID).Scan(&status, &curLoc)
		if err != nil || status != "in_stock" || curLoc == nil || *curLoc != locationID {
			return partFieldError("serial_unit_id", "Select an in-stock serial at the part location.")
		}
	}
	if trackLot {
		lot := strings.TrimSpace(derefString(d.Line.LotNo))
		lotNo = &lot
		var onHand float64
		err := tx.QueryRow(ctx, `
			select qty_on_hand::float8 from public.inv_lot_batches
			where tenant_id = $1 and item_id = $2 and location_id = $3 and lot_no = $4
			for update`, tenantID, itemID, locationID, lot).Scan(&onHand)
		if errors.Is(err, pgx.ErrNoRows) {
			return partFieldError("lot_no", unknownLotError(true, false))
		}
		if err != nil {
			return err
		}
		if onHand+partQtyEpsilon < d.Qty {
			return partFieldError("lot_no", "Not enough quantity in that lot.")
		}
	}
	if trackQty || trackLot || trackSerial {
		var onHand float64
		err := tx.QueryRow(ctx, `
			select qty_on_hand::float8 from public.inv_item_location_balances
			where tenant_id = $1 and item_id = $2 and location_id = $3
			for update`, tenantID, itemID, locationID).Scan(&onHand)
		if errors.Is(err, pgx.ErrNoRows) || onHand+partQtyEpsilon < d.Qty {
			return partFieldError("qty", "Not enough stock at this location.")
		}
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
	}

	if trackLot {
		tag, err := tx.Exec(ctx, `
			update public.inv_lot_batches
			set qty_on_hand = qty_on_hand - $1, updated_at = now()
			where tenant_id = $2 and item_id = $3 and location_id = $4 and lot_no = $5
			  and qty_on_hand + $6 >= $1`,
			d.Qty, tenantID, itemID, locationID, *lotNo, partQtyEpsilon)
		if err != nil || tag.RowsAffected() == 0 {
			return partFieldError("lot_no", "Not enough quantity in that lot.")
		}
	}
	tag, err := tx.Exec(ctx, `
		update public.inv_item_location_balances
		set qty_on_hand = qty_on_hand - $1, updated_at = now()
		where tenant_id = $2 and item_id = $3 and location_id = $4`,
		d.Qty, tenantID, itemID, locationID)
	if err != nil || tag.RowsAffected() == 0 {
		return partFieldError("qty", "Not enough stock at this location.")
	}
	if trackSerial {
		tag, err := tx.Exec(ctx, `
			update public.inv_serial_units
			set status = 'scrapped', updated_at = now()
			where id = $1 and tenant_id = $2 and status = 'in_stock'`, *serialID, tenantID)
		if err != nil || tag.RowsAffected() == 0 {
			return partFieldError("serial_unit_id", "Select an in-stock serial at the part location.")
		}
	}

	var issueID int64
	if err := tx.QueryRow(ctx, `
		insert into public.inv_repair_part_issues (
		  tenant_id, repair_order_id, part_key, item_id, location_id, direction, qty,
		  serial_unit_id, lot_no, unit_cost
		) values ($1,$2,$3,$4,$5,'issue',$6,$7,$8,$9)
		returning id`,
		tenantID, orderID, d.PartKey, itemID, locationID, d.Qty, serialID, lotNo, price).Scan(&issueID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		insert into public.inv_stock_movements (
		  tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, created_by_user_id
		) values ($1,$2,$3,$4,'repair_part','inv_repair_part_issue',$5,$6)`,
		tenantID, itemID, locationID, -d.Qty, issueID, userID); err != nil {
		return err
	}
	if trackSerial {
		if _, err := tx.Exec(ctx, `
			insert into public.inv_serial_events (
			  tenant_id, serial_unit_id, event_type, from_location_id, ref_type, ref_id
			) values ($1,$2,'repair_issue',$3,'inv_repair_part_issue',$4)`,
			tenantID, *serialID, locationID, issueID); err != nil {
			return err
		}
	}
	if hybrid {
		jeID, err := postWarrantyPartJournal(ctx, tx, tenantID, userID, orderDate, "rpart_issue", issueID, d.Qty*price, true)
		if err != nil {
			return err
		}
		if jeID > 0 {
			if _, err := tx.Exec(ctx, `update public.inv_repair_part_issues set journal_entry_id = $1 where id = $2`, jeID, issueID); err != nil {
				return err
			}
		}
	}
	return nil
}

func returnRepairPart(ctx context.Context, tx pgx.Tx, tenantID, userID, orderID int64, orderDate time.Time, hybrid bool, d partDelta) error {
	src, err := latestPartIssue(ctx, tx, tenantID, orderID, d.PartKey)
	if err != nil {
		return err
	}
	if src.ItemID == 0 {
		return partFieldError("part_key", "Issued part was not found.")
	}
	if src.LotNo != nil && strings.TrimSpace(*src.LotNo) != "" {
		if _, err := tx.Exec(ctx, `
			update public.inv_lot_batches
			set qty_on_hand = qty_on_hand + $1, updated_at = now()
			where tenant_id = $2 and item_id = $3 and location_id = $4 and lot_no = $5`,
			d.Qty, tenantID, src.ItemID, src.LocationID, *src.LotNo); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, `
		update public.inv_item_location_balances
		set qty_on_hand = qty_on_hand + $1, updated_at = now()
		where tenant_id = $2 and item_id = $3 and location_id = $4`,
		d.Qty, tenantID, src.ItemID, src.LocationID); err != nil {
		return err
	}
	if src.SerialUnitID != nil {
		tag, err := tx.Exec(ctx, `
			update public.inv_serial_units
			set status = 'in_stock', location_id = $3, updated_at = now()
			where id = $1 and tenant_id = $2 and status = 'scrapped'`,
			*src.SerialUnitID, tenantID, src.LocationID)
		if err != nil || tag.RowsAffected() == 0 {
			return partFieldError("serial_unit_id", "This serial was not scrapped by this repair order.")
		}
	}
	var returnID int64
	if err := tx.QueryRow(ctx, `
		insert into public.inv_repair_part_issues (
		  tenant_id, repair_order_id, part_key, item_id, location_id, direction, qty,
		  serial_unit_id, lot_no, unit_cost
		) values ($1,$2,$3,$4,$5,'return',$6,$7,$8,$9)
		returning id`,
		tenantID, orderID, d.PartKey, src.ItemID, src.LocationID, d.Qty, src.SerialUnitID, src.LotNo, src.UnitCost).Scan(&returnID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		insert into public.inv_stock_movements (
		  tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, created_by_user_id
		) values ($1,$2,$3,$4,'repair_part','inv_repair_part_issue',$5,$6)`,
		tenantID, src.ItemID, src.LocationID, d.Qty, returnID, userID); err != nil {
		return err
	}
	if src.SerialUnitID != nil {
		if _, err := tx.Exec(ctx, `
			insert into public.inv_serial_events (
			  tenant_id, serial_unit_id, event_type, to_location_id, ref_type, ref_id
			) values ($1,$2,'repair_return',$3,'inv_repair_part_issue',$4)`,
			tenantID, *src.SerialUnitID, src.LocationID, returnID); err != nil {
			return err
		}
	}
	if hybrid && src.UnitCost > partQtyEpsilon {
		if _, err := postWarrantyPartJournal(ctx, tx, tenantID, userID, orderDate, "rpart_return", returnID, d.Qty*src.UnitCost, false); err != nil {
			return err
		}
	}
	return nil
}

func latestPartIssue(ctx context.Context, tx pgx.Tx, tenantID, orderID int64, partKey string) (partIssueRow, error) {
	var row partIssueRow
	err := tx.QueryRow(ctx, `
		select item_id, location_id, serial_unit_id, lot_no, unit_cost::float8
		from public.inv_repair_part_issues
		where tenant_id = $1 and repair_order_id = $2 and part_key = $3 and direction = 'issue'
		order by id desc
		limit 1`, tenantID, orderID, partKey).Scan(&row.ItemID, &row.LocationID, &row.SerialUnitID, &row.LotNo, &row.UnitCost)
	if errors.Is(err, pgx.ErrNoRows) {
		return partIssueRow{}, nil
	}
	return row, err
}

func postWarrantyPartJournal(ctx context.Context, tx pgx.Tx, tenantID, userID int64, entryDate time.Time, sourceType string, sourceID int64, amount float64, issue bool) (int64, error) {
	if amount <= partQtyEpsilon {
		return 0, nil
	}
	entryNo := ledger.EntryNo(sourceType, sourceID)
	var existing int64
	err := tx.QueryRow(ctx, `select id from public.fin_journal_entries where tenant_id = $1 and entry_no = $2`, tenantID, entryNo).Scan(&existing)
	if err == nil && existing > 0 {
		return existing, nil
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}
	debitID, err := accountIDByCode(ctx, tx, tenantID, warrantyExpenseAccountCode)
	if err != nil {
		return 0, partFieldError("coverage_decision", "Warranty Expense account 5280 is missing.")
	}
	creditID, err := financedefaults.ResolveByRole(ctx, tx, tenantID, financedefaults.RoleInventory)
	if err != nil {
		return 0, err
	}
	if !issue {
		debitID, creditID = creditID, debitID
	}
	var requireApproval bool
	if err := tx.QueryRow(ctx, `
		select coalesce(finance_require_je_approval, false)
		from public.tenant_process_policies where tenant_id = $1`, tenantID).Scan(&requireApproval); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}
	var dateSeq int
	if err := tx.QueryRow(ctx, `
		select coalesce(max(date_seq),0)+1 from public.fin_journal_entries
		where tenant_id = $1 and entry_date = $2`, tenantID, entryDate).Scan(&dateSeq); err != nil {
		return 0, err
	}
	var jeID int64
	if err := tx.QueryRow(ctx, `
		insert into public.fin_journal_entries (tenant_id, entry_date, date_seq, entry_no, status, remarks, created_by_user_id)
		values ($1,$2,$3,$4,'draft',$5,$6) returning id`,
		tenantID, entryDate, dateSeq, entryNo, "Repair part "+sourceType, userID).Scan(&jeID); err != nil {
		return 0, err
	}
	if _, err := tx.Exec(ctx, `
		insert into public.fin_journal_entry_lines (journal_entry_id, line_no, account_id, debit, credit)
		values ($1, 1, $2, $3, 0)`, jeID, debitID, amount); err != nil {
		return 0, err
	}
	if _, err := tx.Exec(ctx, `
		insert into public.fin_journal_entry_lines (journal_entry_id, line_no, account_id, debit, credit)
		values ($1, 2, $2, 0, $3)`, jeID, creditID, amount); err != nil {
		return 0, err
	}
	if !requireApproval {
		if err := fiscalyear.ErrIfClosed(ctx, tx, tenantID, entryDate); err != nil {
			return 0, err
		}
		if _, err := tx.Exec(ctx, `
			update public.fin_journal_entries
			set status = 'posted', posted_at = now(), updated_at = now()
			where id = $1 and status = 'draft'`, jeID); err != nil {
			return 0, err
		}
	}
	return jeID, nil
}

func accountIDByCode(ctx context.Context, tx pgx.Tx, tenantID int64, code string) (int64, error) {
	var id int64
	err := tx.QueryRow(ctx, `
		select id from public.fin_accounts
		where tenant_id = $1 and account_code = $2 and deleted_at is null and is_active
		limit 1`, tenantID, code).Scan(&id)
	return id, err
}

func assertCoveredWarranty(ctx context.Context, tx pgx.Tx, tenantID int64, decision string, serialID *int64, orderDate time.Time) error {
	if decision != "covered" {
		return nil
	}
	found := false
	status := ""
	var end time.Time
	if serialID != nil && *serialID > 0 {
		err := tx.QueryRow(ctx, `
			select status, warranty_end from public.crm_warranty_assets
			where tenant_id = $1 and serial_unit_id = $2
			limit 1`, tenantID, *serialID).Scan(&status, &end)
		if err == nil {
			found = true
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
	}
	if msg := coverageWarrantyError(decision, serialID, found, status, end, orderDate); msg != "" {
		return partFieldError("coverage_decision", msg)
	}
	return nil
}

func coverageDowngradeBlocked(current, next string, issued float64) string {
	if (current == "covered" || current == "goodwill") && (next == "pending" || next == "denied") && issued > partQtyEpsilon {
		return "Return issued parts before changing coverage."
	}
	return ""
}

type partFieldErr struct {
	field   string
	message string
}

func (e partFieldErr) Error() string { return e.message }

func partFieldError(field, message string) error {
	return partFieldErr{field: field, message: message}
}

func asPartFieldError(err error) (partFieldErr, bool) {
	var fe partFieldErr
	if errors.As(err, &fe) {
		return fe, true
	}
	return partFieldErr{}, false
}

func derefString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func repairPartConsumptionSQL(where string) string {
	return fmt.Sprintf(`
		select i.id, i.item_code, i.item_name,
		  sum(case when iss.direction = 'issue' then iss.qty else -iss.qty end)::float8,
		  count(distinct iss.part_key)::int
		from public.inv_repair_part_issues iss
		join public.inv_repair_orders ro on ro.id = iss.repair_order_id
		join public.inv_items i on i.id = iss.item_id
		where %s
		group by i.id, i.item_code, i.item_name
		having sum(case when iss.direction = 'issue' then iss.qty else -iss.qty end) > 0
		order by i.item_code`, where)
}
