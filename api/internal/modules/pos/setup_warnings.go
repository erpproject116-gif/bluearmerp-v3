package pos

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/inventory"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// setupWarningsListSQL lists sellable items whose serial or lot policy stops a POS sale.
// Policy rule matches inventory.IsTrackingPolicyRequired: only the exact value "optional" is optional.
const setupWarningsListSQL = `
	select i.id, i.item_code,
	  case
	    when coalesce(i.track_serial, false)
	      and coalesce(nullif(i.serial_policy, ''), 'required') <> 'optional'
	    then 'serial'
	    else 'lot'
	  end,
	  count(*) over()
	from public.inv_items i
	where i.tenant_id = $1
	  and i.deleted_at is null
	  and i.status = 'active'
	  and coalesce(i.pos_visible, true) = true
	  and (
	    (coalesce(i.track_serial, false) and coalesce(nullif(i.serial_policy, ''), 'required') <> 'optional')
	    or
	    (coalesce(i.track_lot, false) and coalesce(nullif(i.lot_policy, ''), 'required') <> 'optional')
	  )
	order by i.item_code
	limit 20`

type setupWarningItem struct {
	ItemID   int64  `json:"item_id"`
	ItemCode string `json:"item_code"`
	Stop     string `json:"stop"`
}

type setupWarningsPayload struct {
	Count int                `json:"count"`
	Items []setupWarningItem `json:"items"`
}

// setupWarningStop reports whether a tracked item stops the sale, and which capture.
// Serial wins when both policies are required so the list stays one row per item.
func setupWarningStop(trackSerial, trackLot bool, serialPolicy, lotPolicy string) (string, bool) {
	if trackSerial && inventory.IsTrackingPolicyRequired(serialPolicy) {
		return "serial", true
	}
	if trackLot && inventory.IsTrackingPolicyRequired(lotPolicy) {
		return "lot", true
	}
	return "", false
}

// setupWarningItemIncluded is the row filter beside setupWarningsListSQL.
func setupWarningItemIncluded(status string, deleted bool, posVisible bool) bool {
	return status == "active" && !deleted && posVisible
}

func getPosSetupWarnings(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		// pos.terminal can read /settings. This list is managers only.
		if !tu.HasPermission("pos.manage", auth.AccessRead) {
			response.Err(w, http.StatusForbidden, "You do not have permission for this action.", "ERR_FORBIDDEN")
			return
		}
		rows, err := pool.Query(r.Context(), setupWarningsListSQL, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load POS setup warnings.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		items := []setupWarningItem{}
		count := 0
		for rows.Next() {
			var item setupWarningItem
			if err := rows.Scan(&item.ItemID, &item.ItemCode, &item.Stop, &count); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load POS setup warnings.", "ERR_INTERNAL")
				return
			}
			items = append(items, item)
		}
		if err := rows.Err(); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load POS setup warnings.", "ERR_INTERNAL")
			return
		}
		response.OK(w, setupWarningsPayload{Count: count, Items: items}, "OK")
	}
}
