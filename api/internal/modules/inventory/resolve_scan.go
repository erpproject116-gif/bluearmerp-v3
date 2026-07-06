package inventory

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type resolveScanBody struct {
	SerialNo   string `json:"serial_no"`
	LocationID *int64 `json:"location_id,omitempty"`
	Context    string `json:"context"`
}

func resolveSerialScan(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		var body resolveScanBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		serialNo := strings.TrimSpace(body.SerialNo)
		if serialNo == "" {
			response.Validation(w, map[string]string{"serial_no": "Serial number is required."})
			return
		}

		where := `su.tenant_id = $1 and su.serial_no = $2 and su.status <> 'void'`
		args := []any{tu.TenantID, serialNo}
		argN := 3
		if body.LocationID != nil && *body.LocationID > 0 {
			where += ` and su.location_id = $3`
			args = append(args, *body.LocationID)
			argN++
		}
		_ = argN

		ctx := r.Context()
		var unitID, itemID int64
		var itemCode, itemName, status string
		var locationID *int64
		err := pool.QueryRow(ctx, `
			select su.id, su.item_id, i.item_code, i.item_name, su.status, su.location_id
			from public.inv_serial_units su
			join public.inv_items i on i.id = su.item_id
			where `+where+`
			order by su.id desc limit 1`, args...).Scan(&unitID, &itemID, &itemCode, &itemName, &status, &locationID)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Serial not found.", "ERR_NOT_FOUND")
			return
		}

		allowed := map[string]bool{"in_stock": true, "reserved": true}
		if body.Context == "release" {
			allowed["reserved"] = true
		}
		if !allowed[status] {
			response.Err(w, http.StatusConflict, "Serial is not available for sale.", "ERR_SERIAL_UNAVAILABLE")
			return
		}

		response.OK(w, map[string]any{
			"serial_unit_id": unitID,
			"serial_no":      serialNo,
			"item_id":        itemID,
			"item_code":      itemCode,
			"item_name":      itemName,
			"status":         status,
			"location_id":    locationID,
		}, "OK")
	}
}
