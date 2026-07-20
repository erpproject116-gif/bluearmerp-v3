package booking

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// allowedStatusTransitions defines the booking status machine.
var allowedStatusTransitions = map[string]map[string]bool{
	"scheduled": {"scheduled": true, "confirmed": true, "cancelled": true, "no_show": true},
	"confirmed": {"confirmed": true, "scheduled": true, "completed": true, "cancelled": true, "no_show": true},
	"completed": {"completed": true},
	"cancelled": {"cancelled": true, "scheduled": true},
	"no_show":   {"no_show": true, "scheduled": true, "cancelled": true},
}

func validateStatusTransition(from, to string) error {
	if to == "" {
		return fmt.Errorf("status is required")
	}
	if from == "" || from == to {
		if _, ok := allowedStatusTransitions[to]; !ok {
			return fmt.Errorf("invalid status %q", to)
		}
		return nil
	}
	next, ok := allowedStatusTransitions[from]
	if !ok {
		return fmt.Errorf("invalid current status %q", from)
	}
	if !next[to] {
		return fmt.Errorf("cannot move booking from %s to %s", from, to)
	}
	return nil
}

// resourceConflict reports whether another non-cancelled booking overlaps the window,
// expanding each side by the service buffer_minutes (default 0).
func resourceConflict(ctx context.Context, pool *pgxpool.Pool, tenantID int64, resourceID *int64, starts, ends time.Time, excludeID int64) (bool, string, error) {
	if resourceID == nil || *resourceID <= 0 {
		return false, "", nil
	}
	var conflictNo string
	err := pool.QueryRow(ctx, `
		select b.booking_no
		from public.book_bookings b
		left join public.book_services s on s.id = b.service_id and s.tenant_id = b.tenant_id
		where b.tenant_id = $1
		  and b.resource_id = $2
		  and b.id <> $3
		  and b.status not in ('cancelled')
		  and b.starts_at < ($5::timestamptz + make_interval(mins => coalesce(s.buffer_minutes, 0)))
		  and b.ends_at   > ($4::timestamptz - make_interval(mins => coalesce(s.buffer_minutes, 0)))
		order by b.starts_at
		limit 1`,
		tenantID, *resourceID, excludeID, starts.UTC(), ends.UTC(),
	).Scan(&conflictNo)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, "", nil
	}
	if err != nil {
		return false, "", err
	}
	return true, conflictNo, nil
}
