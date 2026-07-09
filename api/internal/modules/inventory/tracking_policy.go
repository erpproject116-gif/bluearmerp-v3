package inventory

import (
	"context"
	"fmt"
	"math"

	"github.com/jackc/pgx/v5"
)

const (
	TrackingPolicyOptional = "optional"
	TrackingPolicyRequired = "required"
)

// NormalizeTrackingPolicy coerces unknown values to required (safe default).
func NormalizeTrackingPolicy(policy string) string {
	if policy == TrackingPolicyOptional {
		return TrackingPolicyOptional
	}
	return TrackingPolicyRequired
}

// IsTrackingPolicyRequired reports whether capture is mandatory on transactions.
func IsTrackingPolicyRequired(policy string) bool {
	return NormalizeTrackingPolicy(policy) != TrackingPolicyOptional
}

type ItemTrackingSettings struct {
	TrackSerial  bool
	TrackLot     bool
	SerialPolicy string
	LotPolicy    string
}

type pgxQueryRow interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func LoadItemTrackingSettings(ctx context.Context, q pgxQueryRow, tenantID, itemID int64) (ItemTrackingSettings, error) {
	var s ItemTrackingSettings
	err := q.QueryRow(ctx, `
		select coalesce(track_serial, false), coalesce(track_lot, false),
		  coalesce(serial_policy, 'required'), coalesce(lot_policy, 'required')
		from public.inv_items
		where id = $1 and tenant_id = $2 and deleted_at is null`,
		itemID, tenantID).Scan(&s.TrackSerial, &s.TrackLot, &s.SerialPolicy, &s.LotPolicy)
	if err != nil {
		return s, err
	}
	s.SerialPolicy = NormalizeTrackingPolicy(s.SerialPolicy)
	s.LotPolicy = NormalizeTrackingPolicy(s.LotPolicy)
	return s, nil
}

func SanitizeTrackingPolicy(policy *string) string {
	if policy == nil {
		return TrackingPolicyRequired
	}
	return NormalizeTrackingPolicy(*policy)
}

// ValidateSerialUnitCapture enforces serial_unit_ids when policy is required; validates count when any are provided.
func ValidateSerialUnitCapture(lineNo int, policy string, unitCount int, qty float64) error {
	if unitCount == 0 {
		if IsTrackingPolicyRequired(policy) {
			return fmt.Errorf("line %d: serial numbers are required for this item", lineNo)
		}
		return nil
	}
	if qty != float64(int64(qty)) {
		return fmt.Errorf("line %d: quantity must be a whole number for serial-tracked items", lineNo)
	}
	if unitCount != int(qty) {
		return fmt.Errorf("line %d: serial count must match quantity (%.0f)", lineNo, qty)
	}
	return nil
}

// ValidateLotBatchCapture enforces lot_batch_id when policy is required.
func ValidateLotBatchCapture(lineNo int, policy string, lotBatchID *int64) error {
	if lotBatchID != nil && *lotBatchID > 0 {
		return nil
	}
	if IsTrackingPolicyRequired(policy) {
		return fmt.Errorf("line %d: lot batch is required for this item", lineNo)
	}
	return nil
}

// ValidateGRSerialCapture enforces scanned serial count on GR post when policy is required.
func ValidateGRSerialCapture(lineID int64, policy string, serialCount int, receivedQty float64) error {
	if !IsTrackingPolicyRequired(policy) {
		return nil
	}
	need := int(receivedQty + 0.5)
	if float64(serialCount)+0.0001 < receivedQty {
		return fmt.Errorf("line %d requires %d serial(s); only %d scanned", lineID, need, serialCount)
	}
	return nil
}

// ValidateGRLotCapture enforces lot qty sum on GR post when policy is required.
func ValidateGRLotCapture(lineID int64, policy string, lotQty, receivedQty float64) error {
	if !IsTrackingPolicyRequired(policy) {
		return nil
	}
	if lotQty+0.0001 < receivedQty {
		return fmt.Errorf("line %d requires lot entries totaling %.4f; only %.4f recorded", lineID, receivedQty, lotQty)
	}
	return nil
}

// ValidatePlannedSerialCapture enforces planned serial list on quote/SO/PO lines when policy is required.
func ValidatePlannedSerialCapture(lineNo int, policy string, plannedCount int, qty float64) error {
	if plannedCount > 0 {
		maxQty := int(math.Floor(qty + 0.0001))
		if maxQty < 1 {
			maxQty = 1
		}
		if plannedCount > maxQty {
			return fmt.Errorf("line %d: planned serial count (%d) exceeds line quantity (%d)", lineNo, plannedCount, maxQty)
		}
		return nil
	}
	if IsTrackingPolicyRequired(policy) {
		need := int(math.Floor(qty + 0.0001))
		if need < 1 && qty > 0 {
			need = 1
		}
		if qty > 0 && need > 0 {
			return fmt.Errorf("line %d: planned serial numbers are required for this item", lineNo)
		}
	}
	return nil
}
