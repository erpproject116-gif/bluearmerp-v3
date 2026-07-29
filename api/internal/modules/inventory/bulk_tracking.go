package inventory

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// bulkTrackingBody sets serial/lot tracking on many items in one request.
// Exactly one of track_serial or track_lot must be provided (bool pointer).
// Enabling serial clears lot (and vice versa). Disabling serial/lot follows the same
// open-unit / open-batch guards as single-item update.
type bulkTrackingBody struct {
	IDs          []int64  `json:"ids"`
	TrackSerial  *bool    `json:"track_serial"`
	TrackLot     *bool    `json:"track_lot"`
	SerialPolicy *string  `json:"serial_policy"`
	LotPolicy    *string  `json:"lot_policy"`
}

type bulkTrackingOutcome struct {
	Results  []masterBulkItem `json:"results"`
	Updated  int              `json:"updated"`
	Skipped  int              `json:"skipped"`
}

func bulkSetItemTracking(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body bulkTrackingBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.TrackSerial == nil && body.TrackLot == nil {
			response.Validation(w, map[string]string{"track_serial": "Provide track_serial and/or track_lot."})
			return
		}
		if body.TrackSerial != nil && body.TrackLot != nil && *body.TrackSerial && *body.TrackLot {
			response.Validation(w, map[string]string{"track_serial": "Serial and lot tracking are mutually exclusive."})
			return
		}
		if len(body.IDs) == 0 {
			response.Validation(w, map[string]string{"ids": "At least one id is required."})
			return
		}
		if len(body.IDs) > 500 {
			response.Validation(w, map[string]string{"ids": "At most 500 ids per request."})
			return
		}

		serialPolicy := SanitizeTrackingPolicy(body.SerialPolicy)
		lotPolicy := SanitizeTrackingPolicy(body.LotPolicy)

		results := make([]masterBulkItem, 0, len(body.IDs))
		for _, id := range body.IDs {
			if id <= 0 {
				results = append(results, masterBulkItem{ID: id, OK: false, Reason: "Invalid id."})
				continue
			}
			reason, ok := applyItemTracking(r, pool, tu, id, body, serialPolicy, lotPolicy)
			if !ok {
				results = append(results, masterBulkItem{ID: id, OK: false, Reason: reason})
				continue
			}
			results = append(results, masterBulkItem{ID: id, OK: true})
		}

		out := bulkTrackingOutcome{Results: results}
		for _, item := range results {
			if item.OK {
				out.Updated++
			} else {
				out.Skipped++
			}
		}
		response.OK(w, out, "OK")
	}
}

func applyItemTracking(
	r *http.Request,
	pool *pgxpool.Pool,
	tu auth.TenantUser,
	id int64,
	body bulkTrackingBody,
	serialPolicy, lotPolicy string,
) (string, bool) {
	ctx := r.Context()
	tx, err := pool.Begin(ctx)
	if err != nil {
		return "Failed to update.", false
	}
	defer tx.Rollback(ctx)

	var curSerial, curLot bool
	err = tx.QueryRow(ctx, `
		select track_serial, track_lot from public.inv_items
		where id = $1 and tenant_id = $2 and deleted_at is null`,
		id, tu.TenantID).Scan(&curSerial, &curLot)
	if err != nil {
		return "Not found or deleted.", false
	}

	nextSerial := curSerial
	nextLot := curLot
	if body.TrackSerial != nil {
		nextSerial = *body.TrackSerial
		if nextSerial {
			nextLot = false
		}
	}
	if body.TrackLot != nil {
		nextLot = *body.TrackLot
		if nextLot {
			nextSerial = false
		}
	}

	if !nextSerial && curSerial {
		var openSerials int
		if err := tx.QueryRow(ctx, `
			select count(*) from public.inv_serial_units
			where tenant_id = $1 and item_id = $2 and status not in ('void', 'scrapped')`,
			tu.TenantID, id).Scan(&openSerials); err != nil {
			return "Failed to validate serial units.", false
		}
		if openSerials > 0 {
			return "Cannot disable serial tracking while open serial units exist.", false
		}
	}
	if !nextLot && curLot {
		var openLots int
		if err := tx.QueryRow(ctx, `
			select count(*) from public.inv_lot_batches
			where tenant_id = $1 and item_id = $2 and qty_on_hand > 0`,
			tu.TenantID, id).Scan(&openLots); err != nil {
			return "Failed to validate lot batches.", false
		}
		if openLots > 0 {
			return "Cannot disable lot tracking while open lot batches exist.", false
		}
	}

	nextSerialPolicy := serialPolicy
	nextLotPolicy := lotPolicy
	if !nextSerial {
		nextSerialPolicy = TrackingPolicyRequired
	} else if body.SerialPolicy == nil {
		_ = tx.QueryRow(ctx, `select coalesce(serial_policy, 'required') from public.inv_items where id = $1`, id).Scan(&nextSerialPolicy)
		nextSerialPolicy = NormalizeTrackingPolicy(nextSerialPolicy)
	}
	if !nextLot {
		nextLotPolicy = TrackingPolicyRequired
	} else if body.LotPolicy == nil {
		_ = tx.QueryRow(ctx, `select coalesce(lot_policy, 'required') from public.inv_items where id = $1`, id).Scan(&nextLotPolicy)
		nextLotPolicy = NormalizeTrackingPolicy(nextLotPolicy)
	}

	tag, err := tx.Exec(ctx, `
		update public.inv_items
		set track_serial = $1, track_lot = $2, serial_policy = $3, lot_policy = $4, updated_at = now()
		where id = $5 and tenant_id = $6 and deleted_at is null`,
		nextSerial, nextLot, nextSerialPolicy, nextLotPolicy, id, tu.TenantID)
	if err != nil || tag.RowsAffected() == 0 {
		return "Failed to update.", false
	}

	if err := tx.Commit(ctx); err != nil {
		return "Failed to update.", false
	}
	_ = audit.Log(ctx, pool, tu.TenantID, tu.AppUserID, "inventory.item.bulk_tracking", "inv_item", &id, nil, map[string]any{
		"track_serial":  nextSerial,
		"track_lot":     nextLot,
		"serial_policy": nextSerialPolicy,
		"lot_policy":    nextLotPolicy,
	})
	return "", true
}
