package inventory

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type serialRegisterBody struct {
	RegisterDate string  `json:"register_date"`
	SlipType     string  `json:"slip_type"`
	LocationID   int64   `json:"location_id"`
	ItemID       int64   `json:"item_id"`
	Qty          float64 `json:"qty"`
	SerialNo     string  `json:"serial_no"`
	Remark       string  `json:"remark"`
	ProjectID    *int64  `json:"project_id,omitempty"`
}

func registerSerialUnits(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body serialRegisterBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}

		errs := map[string]string{}
		registerDate, err := parseDate(strings.TrimSpace(body.RegisterDate))
		if err != nil {
			errs["register_date"] = "Valid date is required (YYYY-MM-DD)."
		}
		slipType := strings.TrimSpace(body.SlipType)
		if slipType == "" {
			slipType = "quotation"
		}
		if !isValidSerialSlipType(slipType) {
			errs["slip_type"] = "Invalid slip type."
		}
		if body.LocationID <= 0 {
			errs["location_id"] = "Location is required."
		}
		if body.ItemID <= 0 {
			errs["item_id"] = "Item is required."
		}
		serialNo := strings.TrimSpace(body.SerialNo)
		if serialNo == "" {
			errs["serial_no"] = "Serial number is required."
		}
		if body.Qty != 1 {
			errs["qty"] = "Quantity must be 1 for serial-tracked items."
		}
		if len(errs) > 0 {
			response.Validation(w, errs)
			return
		}

		var trackSerial bool
		var trackQty bool
		var warrantyMonths int
		err = pool.QueryRow(r.Context(), `
			select coalesce(track_serial, false), coalesce(track_inventory_qty, false),
			  coalesce(warranty_duration_months, 0)
			from public.inv_items
			where id = $1 and tenant_id = $2 and deleted_at is null`,
			body.ItemID, tu.TenantID).Scan(&trackSerial, &trackQty, &warrantyMonths)
		if err != nil || !trackSerial {
			response.Validation(w, map[string]string{"item_id": "Item must exist and track serial numbers."})
			return
		}

		var locTenant int64
		if err := pool.QueryRow(r.Context(), `select tenant_id from public.inv_locations where id = $1 and deleted_at is null`, body.LocationID).Scan(&locTenant); err != nil || locTenant != tu.TenantID {
			response.Validation(w, map[string]string{"location_id": "Invalid location."})
			return
		}

		if body.ProjectID != nil && *body.ProjectID > 0 {
			var projTenant int64
			if err := pool.QueryRow(r.Context(), `select tenant_id from public.inv_projects where id = $1 and deleted_at is null`, *body.ProjectID).Scan(&projTenant); err != nil || projTenant != tu.TenantID {
				response.Validation(w, map[string]string{"project_id": "Invalid project."})
				return
			}
		}

		var dup int
		_ = pool.QueryRow(r.Context(), `
			select count(*) from public.inv_serial_units
			where tenant_id = $1 and serial_no = $2 and status <> 'void'`, tu.TenantID, serialNo).Scan(&dup)
		if dup > 0 {
			response.Validation(w, map[string]string{"serial_no": "Serial number already exists."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to register serial.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		recvAt := registerDate
		var wStart *time.Time
		wEnd := warrantyEndFromMonths(registerDate, warrantyMonths)
		if warrantyMonths > 0 {
			wStart = &registerDate
		}
		var unitID int64
		err = tx.QueryRow(r.Context(), `
			insert into public.inv_serial_units (
			  tenant_id, item_id, serial_no, status, location_id, project_id,
			  warranty_start, warranty_end, received_at
			) values ($1, $2, $3, 'in_stock', $4, $5, $6::date, $7::date, $8::timestamptz)
			returning id`,
			tu.TenantID, body.ItemID, serialNo, body.LocationID, body.ProjectID,
			wStart, wEnd,
			recvAt.Format("2006-01-02")+" 12:00:00+00").Scan(&unitID)
		if err != nil {
			response.Validation(w, map[string]string{"serial_no": "Serial number already exists."})
			return
		}

		locID := body.LocationID
		remark := strings.TrimSpace(body.Remark)
		var notes *string
		if remark != "" {
			notes = &remark
		}
		userID := tu.AppUserID
		_, err = tx.Exec(r.Context(), `
			insert into public.inv_serial_events (
			  tenant_id, serial_unit_id, event_type, to_location_id,
			  ref_type, notes, created_by_user_id
			) values ($1, $2, 'received', $3, $4, $5, $6)`,
			tu.TenantID, unitID, locID, slipType, notes, userID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to record serial event.", "ERR_INTERNAL")
			return
		}

		if trackQty {
			_, err = tx.Exec(r.Context(), `
				insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand)
				values ($1, $2, $3, 1)
				on conflict (tenant_id, item_id, location_id)
				do update set qty_on_hand = inv_item_location_balances.qty_on_hand + 1, updated_at = now()`,
				tu.TenantID, body.ItemID, body.LocationID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to update stock balance.", "ERR_INTERNAL")
				return
			}

			var movementID int64
			err = tx.QueryRow(r.Context(), `
				insert into public.inv_stock_movements
				  (tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, reason, created_by_user_id)
				values ($1, $2, $3, 1, 'adjustment', 'serial_register', $4, $5, $6)
				returning id`,
				tu.TenantID, body.ItemID, body.LocationID, unitID, remark, tu.AppUserID).Scan(&movementID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to record stock movement.", "ERR_INTERNAL")
				return
			}
			_, _ = tx.Exec(r.Context(), `update public.inv_stock_movements set ref_id = $1 where id = $1`, movementID)
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to register serial.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.serial.register", "inv_serial_unit", &unitID, nil, body)

		var row SerialUnitRow
		var outStart, outEnd *time.Time
		var recv *time.Time
		var createdAt time.Time
		_ = pool.QueryRow(r.Context(), `
			select su.id, su.serial_no, su.item_id, i.item_code, i.item_name, su.status,
			  su.location_id, coalesce(loc.location_name, ''),
			  su.partner_id, coalesce(p.company_name, ''),
			  su.warranty_start, su.warranty_end, su.received_at,
			  po.purchase_order_no, su.sales_line_id, su.created_at
			from public.inv_serial_units su
			join public.inv_items i on i.id = su.item_id
			left join public.inv_locations loc on loc.id = su.location_id
			left join public.inv_partners p on p.id = su.partner_id
			left join public.po_purchase_order_lines pol on pol.id = su.purchase_order_line_id
			left join public.po_purchase_orders po on po.id = pol.purchase_order_id
			where su.id = $1`, unitID).Scan(
			&row.ID, &row.SerialNo, &row.ItemID, &row.ItemCode, &row.ItemName, &row.Status,
			&row.LocationID, &row.LocationName, &row.PartnerID, &row.PartnerName,
			&outStart, &outEnd, &recv, &row.PurchaseOrderNo, &row.SalesID, &createdAt)
		row.WarrantyStart = formatDatePtr(outStart)
		row.WarrantyEnd = formatDatePtr(outEnd)
		row.ReceivedAt = formatTimePtr(recv)
		row.CreatedAt = createdAt.Format(time.RFC3339)

		response.OK(w, row, "Serial registered.")
	}
}
