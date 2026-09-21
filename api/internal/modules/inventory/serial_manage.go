package inventory

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type patchSerialUnitBody struct {
	SerialNo string `json:"serial_no"`
}

// patchSerialUnit renames a serial number for in-stock/reserved units.
func patchSerialUnit(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		var body patchSerialUnitBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		serialNo := strings.TrimSpace(body.SerialNo)
		if serialNo == "" {
			response.Validation(w, map[string]string{"serial_no": "Serial number is required."})
			return
		}

		var status string
		err := pool.QueryRow(r.Context(), `
			select status from public.inv_serial_units
			where id = $1 and tenant_id = $2`, id, tu.TenantID).Scan(&status)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Serial unit not found.", "ERR_NOT_FOUND")
			return
		}
		if status != "in_stock" && status != "reserved" {
			response.Validation(w, map[string]string{"status": "Only in-stock or reserved serials can be renamed."})
			return
		}

		var taken bool
		_ = pool.QueryRow(r.Context(), `
			select exists(
			  select 1 from public.inv_serial_units
			  where tenant_id = $1 and id <> $2 and status <> 'void'
			    and lower(btrim(serial_no)) = lower(btrim($3::text))
			)`, tu.TenantID, id, serialNo).Scan(&taken)
		if taken {
			response.Validation(w, map[string]string{"serial_no": "That serial number is already in use."})
			return
		}

		tag, err := pool.Exec(r.Context(), `
			update public.inv_serial_units
			set serial_no = $1, updated_at = now()
			where id = $2 and tenant_id = $3`, serialNo, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusInternalServerError, "Failed to update serial.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.serial.patch", "inv_serial_unit", &id, nil, body)
		response.OK(w, map[string]any{"id": id, "serial_no": serialNo}, "Serial updated.")
	}
}

type archiveSerialBody struct {
	Reason string `json:"reason"`
}

// archiveSerialUnit voids an in-stock serial (and decrements qty when track_inventory_qty).
func archiveSerialUnit(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		var body archiveSerialBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		reason := strings.TrimSpace(body.Reason)
		if reason == "" {
			reason = "Archived from serial registry"
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to archive serial.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		adjusted, verrs, err := postSerialAdjustmentLines(r.Context(), tx, tu.TenantID, tu.AppUserID, reason, []serialAdjustmentLine{
			{SerialUnitID: id, QtyDelta: -1},
		})
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to archive serial.", "ERR_INTERNAL")
			return
		}
		if verrs != nil {
			response.Validation(w, verrs)
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to archive serial.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.serial.archive", "inv_serial_unit", &id, nil, map[string]any{
			"reason":   reason,
			"adjusted": adjusted,
		})
		response.OK(w, map[string]any{"id": id, "adjusted": adjusted}, "Serial archived (voided). On-hand qty was reduced when the item tracks inventory.")
	}
}
