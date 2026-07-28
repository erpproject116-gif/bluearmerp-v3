package inventory

import (
	"context"
	"fmt"
	"math"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// NormalizePlannedSerialNos trims, deduplicates (case-insensitive), and drops blanks.
func NormalizePlannedSerialNos(raw []string) []string {
	if len(raw) == 0 {
		return []string{}
	}
	seen := make(map[string]bool, len(raw))
	out := make([]string, 0, len(raw))
	for _, s := range raw {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		key := strings.ToLower(s)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, s)
	}
	return out
}

// ValidatePlannedSerialNos checks planned serial count against line qty and item serial policy.
// When requireCapture is false (quotations / purchase requests), planned serials stay optional
// even if the item's serial_policy is "required" — physical capture starts at SO/PO/receive/sale.
func ValidatePlannedSerialNos(ctx context.Context, pool *pgxpool.Pool, tenantID int64, lineNo int, itemID *int64, qty float64, planned []string, requireCapture bool) error {
	planned = NormalizePlannedSerialNos(planned)
	if itemID == nil || *itemID <= 0 {
		if len(planned) > 0 {
			return fmt.Errorf("planned serials require an item")
		}
		return nil
	}
	settings, err := LoadItemTrackingSettings(ctx, pool, tenantID, *itemID)
	if err != nil {
		return fmt.Errorf("item not found for planned serials")
	}
	if !settings.TrackSerial {
		if len(planned) > 0 {
			return fmt.Errorf("item does not track serial numbers")
		}
		return nil
	}
	if lineNo <= 0 {
		lineNo = 1
	}
	policy := settings.SerialPolicy
	if !requireCapture {
		policy = TrackingPolicyOptional
	}
	if err := ValidatePlannedSerialCapture(lineNo, policy, len(planned), qty); err != nil {
		return err
	}
	if len(planned) == 0 {
		return nil
	}
	maxQty := int(math.Floor(qty + 0.0001))
	if maxQty < 1 {
		maxQty = 1
	}
	if len(planned) > maxQty {
		return fmt.Errorf("planned serial count (%d) exceeds line quantity (%d)", len(planned), maxQty)
	}
	return nil
}
