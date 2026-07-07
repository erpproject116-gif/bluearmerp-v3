package inventory

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type resolveScanBody struct {
	SerialNo   string `json:"serial_no"`
	LocationID *int64 `json:"location_id,omitempty"`
	ItemID     *int64 `json:"item_id,omitempty"`
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

		ctx := r.Context()
		seen := map[string]bool{}
		res := resolveOneSerial(ctx, pool, tu.TenantID, serialNo, body.LocationID, body.ItemID, body.Context, seen)
		switch res.Status {
		case resolveScanEmpty:
			response.Validation(w, map[string]string{"serial_no": "Serial number is required."})
			return
		case resolveScanNotFound:
			response.Err(w, http.StatusNotFound, res.Message, "ERR_NOT_FOUND")
			return
		case resolveScanWrongLocation:
			response.Err(w, http.StatusConflict, res.Message, "ERR_SERIAL_WRONG_LOCATION")
			return
		case resolveScanUnavailable:
			response.Err(w, http.StatusConflict, res.Message, "ERR_SERIAL_UNAVAILABLE")
			return
		case resolveScanWrongItem:
			response.Err(w, http.StatusConflict, res.Message, "ERR_SERIAL_WRONG_ITEM")
			return
		case resolveScanAccepted:
			if res.Unit != nil {
				enrichResolvedUnits(ctx, pool, tu.TenantID, []*resolvedSerialUnit{res.Unit})
				response.OK(w, res.Unit, "OK")
				return
			}
		}
		if res.Unit == nil {
			_, err := lookupResolvedSerial(ctx, pool, tu.TenantID, normalizeResolveSerialNo(serialNo), body.LocationID)
			if err == pgx.ErrNoRows {
				response.Err(w, http.StatusNotFound, "Serial not found.", "ERR_NOT_FOUND")
				return
			}
		}
		response.Err(w, http.StatusConflict, res.Message, "ERR_SERIAL_UNAVAILABLE")
	}
}
