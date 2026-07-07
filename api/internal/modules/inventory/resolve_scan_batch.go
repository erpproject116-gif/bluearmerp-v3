package inventory

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type resolveScanBatchBody struct {
	LocationID *int64 `json:"location_id,omitempty"`
	ItemID     *int64 `json:"item_id,omitempty"`
	Context    string `json:"context"`
	Scans      []struct {
		ClientScanID string `json:"client_scan_id"`
		SerialNo     string `json:"serial_no"`
	} `json:"scans"`
}

func resolveSerialScanBatch(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		var body resolveScanBatchBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.Scans) == 0 {
			response.Validation(w, map[string]string{"scans": "At least one scan is required."})
			return
		}

		inputs := make([]struct {
			ClientScanID string
			SerialNo     string
		}, len(body.Scans))
		for i, sc := range body.Scans {
			inputs[i] = struct {
				ClientScanID string
				SerialNo     string
			}{ClientScanID: sc.ClientScanID, SerialNo: sc.SerialNo}
		}

		results, err := resolveSerialBatch(r.Context(), pool, tu.TenantID, inputs, body.LocationID, body.ItemID, body.Context)
		if err != nil {
			var sizeErr *resolveBatchSizeError
			if errors.As(err, &sizeErr) {
				response.Validation(w, map[string]string{
					"scans": fmt.Sprintf("Maximum %d scans per batch.", maxResolveScanBatchSize),
				})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to resolve serials.", "ERR_INTERNAL")
			return
		}

		response.OK(w, map[string]any{"results": results}, "OK")
	}
}
