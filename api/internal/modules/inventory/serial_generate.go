package inventory

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type serialGenerateBody struct {
	RegisterDate string `json:"register_date"`
	SlipType     string `json:"slip_type"`
	LocationID   int64  `json:"location_id"`
	ItemID       int64  `json:"item_id"`
	Qty          int    `json:"qty"`
	Prefix       string `json:"prefix"`
	Remark       string `json:"remark"`
	ProjectID    *int64 `json:"project_id,omitempty"`
}

type generatedSerial struct {
	ID       int64  `json:"id"`
	SerialNo string `json:"serial_no"`
	ItemID   int64  `json:"item_id"`
}

// generateSerialUnits allocates unique serial numbers (tenant-wide) and registers them in_stock.
func generateSerialUnits(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body serialGenerateBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}

		errs := map[string]string{}
		registerDate, err := parseDate(strings.TrimSpace(body.RegisterDate))
		if err != nil {
			registerDate = time.Now().UTC()
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
		qty := body.Qty
		if qty < 1 {
			qty = 1
		}
		if qty > 200 {
			errs["qty"] = "Generate at most 200 serials at once."
		}
		prefix := strings.ToUpper(strings.TrimSpace(body.Prefix))
		if prefix == "" {
			prefix = "SN"
		}
		if len(prefix) > 16 {
			errs["prefix"] = "Prefix max 16 characters."
		}
		if len(errs) > 0 {
			response.Validation(w, errs)
			return
		}

		var trackSerial bool
		var trackQty bool
		err = pool.QueryRow(r.Context(), `
			select coalesce(track_serial, false), coalesce(track_inventory_qty, false)
			from public.inv_items
			where id = $1 and tenant_id = $2 and deleted_at is null`,
			body.ItemID, tu.TenantID).Scan(&trackSerial, &trackQty)
		if err != nil || !trackSerial {
			response.Validation(w, map[string]string{"item_id": "Item must exist and track serial numbers."})
			return
		}

		var locTenant int64
		if err := pool.QueryRow(r.Context(), `select tenant_id from public.inv_locations where id = $1 and deleted_at is null`, body.LocationID).Scan(&locTenant); err != nil || locTenant != tu.TenantID {
			response.Validation(w, map[string]string{"location_id": "Invalid location."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to generate serials.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		_, err = tx.Exec(r.Context(), `
			insert into public.inv_serial_number_sequences (tenant_id, prefix, last_value)
			values ($1, $2, 0)
			on conflict (tenant_id, prefix) do nothing`, tu.TenantID, prefix)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to allocate serial sequence.", "ERR_INTERNAL")
			return
		}

		var nextVal int64
		err = tx.QueryRow(r.Context(), `
			update public.inv_serial_number_sequences
			set last_value = last_value + $3, updated_at = now()
			where tenant_id = $1 and prefix = $2
			returning last_value`, tu.TenantID, prefix, qty).Scan(&nextVal)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to allocate serial sequence.", "ERR_INTERNAL")
			return
		}
		start := nextVal - int64(qty) + 1
		out := make([]generatedSerial, 0, qty)
		recvAt := registerDate.Format("2006-01-02") + " 12:00:00+00"
		datePart := registerDate.Format("060102")
		remark := strings.TrimSpace(body.Remark)
		var notes *string
		if remark != "" {
			notes = &remark
		}
		userID := tu.AppUserID
		cursor := start

		for i := 0; i < qty; i++ {
			var unitID int64
			var serialNo string
			created := false
			for attempt := 0; attempt < 50; attempt++ {
				serialNo = fmt.Sprintf("%s-%s-%06d", prefix, datePart, cursor)
				cursor++
				err = tx.QueryRow(r.Context(), `
					insert into public.inv_serial_units (
					  tenant_id, item_id, serial_no, status, location_id, project_id, received_at
					) values ($1, $2, $3, 'in_stock', $4, $5, $6::timestamptz)
					returning id`,
					tu.TenantID, body.ItemID, serialNo, body.LocationID, body.ProjectID, recvAt,
				).Scan(&unitID)
				if err == nil {
					created = true
					break
				}
			}
			if !created {
				response.Validation(w, map[string]string{"serial_no": "Could not allocate unique serial numbers. Try again."})
				return
			}
			_, err = tx.Exec(r.Context(), `
				insert into public.inv_serial_events (
				  tenant_id, serial_unit_id, event_type, to_location_id,
				  ref_type, notes, created_by_user_id
				) values ($1, $2, 'generated', $3, $4, $5, $6)`,
				tu.TenantID, unitID, body.LocationID, slipType, notes, userID)
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
			}
			out = append(out, generatedSerial{ID: unitID, SerialNo: serialNo, ItemID: body.ItemID})
		}

		_, _ = tx.Exec(r.Context(), `
			update public.inv_serial_number_sequences
			set last_value = greatest(last_value, $3), updated_at = now()
			where tenant_id = $1 and prefix = $2`, tu.TenantID, prefix, cursor-1)

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to commit generated serials.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.serial.generate", "inv_serial_unit", nil, nil, map[string]any{
			"count": len(out), "item_id": body.ItemID, "prefix": prefix,
		})

		response.OK(w, map[string]any{
			"serials": out,
			"count":   len(out),
		}, "Generated.")
	}
}
