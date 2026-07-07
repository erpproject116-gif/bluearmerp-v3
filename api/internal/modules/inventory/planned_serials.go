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

// ValidatePlannedSerialNos checks planned serial count against line qty for serial-tracked items.
func ValidatePlannedSerialNos(ctx context.Context, pool *pgxpool.Pool, tenantID int64, itemID *int64, qty float64, planned []string) error {
	planned = NormalizePlannedSerialNos(planned)
	if len(planned) == 0 {
		return nil
	}
	if itemID == nil || *itemID <= 0 {
		return fmt.Errorf("planned serials require an item")
	}
	var trackSerial bool
	err := pool.QueryRow(ctx, `
		select coalesce(track_serial, false)
		from public.inv_items
		where id = $1 and tenant_id = $2`, *itemID, tenantID).Scan(&trackSerial)
	if err != nil {
		return fmt.Errorf("item not found for planned serials")
	}
	if !trackSerial {
		return fmt.Errorf("item does not track serial numbers")
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
