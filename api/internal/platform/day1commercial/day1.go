package day1commercial

import (
	"context"
	"encoding/json"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customerregistry"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/ttlcache"
)

const (
	StatusSetup           = "setup"
	StatusAwaitingPayment = "awaiting_payment"
	StatusUnlocked        = "unlocked"
	StatusCancelled       = "cancelled"

	DefaultAmountCentavos = 450000
)

// Snapshot mirrors inventory workspace Day 1 criteria (2B).
type Snapshot struct {
	ActiveLocations int64 `json:"active_locations"`
	ActiveItems     int64 `json:"active_items"`
	ItemsWithStock  int64 `json:"items_with_stock"`
}

// Commercial is returned on /auth/me.
type Commercial struct {
	Status           string     `json:"status"`
	Day1CompletedAt  *time.Time `json:"day1_completed_at,omitempty"`
	AmountCentavos   int        `json:"amount_centavos"`
	WriteBlocked     bool       `json:"write_blocked"`
	PaymentRequested *time.Time `json:"payment_requested_at,omitempty"`
}

type tenantState struct {
	CustomerID       int64
	Status           string
	AmountCentavos   int
	Day1CompletedAt  *time.Time
	PaymentRequested *time.Time
	IsDemo           bool
	HasCustomer      bool
}

var stateCache = ttlcache.New[tenantState]("DAY1_COMMERCIAL_CACHE_TTL_SECONDS", 15, 10000)

// InvalidateTenant drops cached commercial state after a write.
func InvalidateTenant(tenantID int64) {
	stateCache.Invalidate(strconv.FormatInt(tenantID, 10))
}

// ResetCache clears every cached tenant (tests).
func ResetCache() { stateCache.Reset() }

// CriteriaMet reports whether Day 1 rule 2B is satisfied.
func CriteriaMet(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (bool, Snapshot, error) {
	var snap Snapshot
	if err := pool.QueryRow(ctx, `
		select
		  (select count(*) from public.inv_locations
		    where tenant_id = $1 and deleted_at is null and status = 'active'),
		  (select count(*) from public.inv_items
		    where tenant_id = $1 and deleted_at is null and status = 'active'),
		  (select count(distinct bal.item_id) from public.inv_item_location_balances bal
		    where bal.tenant_id = $1 and bal.qty_on_hand > 0.0001)`,
		tenantID).Scan(&snap.ActiveLocations, &snap.ActiveItems, &snap.ItemsWithStock); err != nil {
		return false, snap, err
	}
	ok := snap.ActiveLocations >= 1 && snap.ActiveItems >= 1 && snap.ItemsWithStock >= 1
	return ok, snap, nil
}

func loadState(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (tenantState, error) {
	key := strconv.FormatInt(tenantID, 10)
	if s, ok := stateCache.Get(key); ok {
		return s, nil
	}
	var s tenantState
	var isDemo bool
	_ = pool.QueryRow(ctx, `select coalesce(is_demo, false) from public.tenants where id = $1`, tenantID).Scan(&isDemo)
	s.IsDemo = isDemo

	err := pool.QueryRow(ctx, `
		select id, coalesce(commercial_status, 'unlocked'), coalesce(paywall_amount_centavos, $2),
		       day1_completed_at, payment_requested_at
		from public.platform_customers
		where tenant_id = $1
		order by updated_at desc
		limit 1`, tenantID, DefaultAmountCentavos).Scan(
		&s.CustomerID, &s.Status, &s.AmountCentavos, &s.Day1CompletedAt, &s.PaymentRequested)
	if err != nil {
		if err == pgx.ErrNoRows {
			// Unmanaged / no customer row: never lock.
			s.Status = StatusUnlocked
			s.AmountCentavos = DefaultAmountCentavos
			stateCache.Set(key, s)
			return s, nil
		}
		return s, err
	}
	s.HasCustomer = true
	if s.IsDemo {
		s.Status = StatusUnlocked
	}
	stateCache.Set(key, s)
	return s, nil
}

// LoadForTenant returns commercial payload for /auth/me.
func LoadForTenant(ctx context.Context, pool *pgxpool.Pool, tenantID int64, isSuperadmin bool) (*Commercial, error) {
	if isSuperadmin || tenantID <= 0 {
		return nil, nil
	}
	s, err := loadState(ctx, pool, tenantID)
	if err != nil {
		return nil, err
	}
	if !s.HasCustomer && !s.IsDemo {
		return &Commercial{Status: StatusUnlocked, AmountCentavos: DefaultAmountCentavos, WriteBlocked: false}, nil
	}
	blocked := s.Status == StatusSetup || s.Status == StatusAwaitingPayment || s.Status == StatusCancelled
	return &Commercial{
		Status:           s.Status,
		Day1CompletedAt:  s.Day1CompletedAt,
		AmountCentavos:   s.AmountCentavos,
		WriteBlocked:     blocked,
		PaymentRequested: s.PaymentRequested,
	}, nil
}

// WriteBlocked reports whether trade mutations should be rejected.
func WriteBlocked(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (blocked bool, status string, err error) {
	s, err := loadState(ctx, pool, tenantID)
	if err != nil {
		return false, "", err
	}
	if s.IsDemo || !s.HasCustomer {
		return false, StatusUnlocked, nil
	}
	blocked = s.Status == StatusSetup || s.Status == StatusAwaitingPayment || s.Status == StatusCancelled
	return blocked, s.Status, nil
}

// SetCommercialSetup marks a newly provisioned self-serve customer as setup-locked.
func SetCommercialSetup(ctx context.Context, pool *pgxpool.Pool, customerID, tenantID int64) error {
	_, err := pool.Exec(ctx, `
		update public.platform_customers
		set commercial_status = $2,
		    day1_completed_at = null,
		    day1_snapshot = null,
		    payment_requested_at = null,
		    payment_confirmed_at = null,
		    payment_confirmed_by_user_id = null,
		    payment_note = null,
		    paywall_amount_centavos = coalesce(nullif(paywall_amount_centavos, 0), $3),
		    updated_at = now()
		where id = $1`, customerID, StatusSetup, DefaultAmountCentavos)
	if err == nil {
		InvalidateTenant(tenantID)
	}
	return err
}

// EnsureDemoUnlocked forces demo sandboxes to stay unlocked.
func EnsureDemoUnlocked(ctx context.Context, pool *pgxpool.Pool, customerID, tenantID int64) error {
	_, err := pool.Exec(ctx, `
		update public.platform_customers
		set commercial_status = $2, updated_at = now()
		where id = $1`, customerID, StatusUnlocked)
	if err == nil {
		InvalidateTenant(tenantID)
	}
	return err
}

// EvaluateAndTransition moves setup → awaiting_payment when Day 1 2B is met.
func EvaluateAndTransition(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (status string, transitioned bool, err error) {
	s, err := loadState(ctx, pool, tenantID)
	if err != nil {
		return "", false, err
	}
	if s.IsDemo || !s.HasCustomer {
		return StatusUnlocked, false, nil
	}
	if s.Status != StatusSetup {
		return s.Status, false, nil
	}
	ok, snap, err := CriteriaMet(ctx, pool, tenantID)
	if err != nil || !ok {
		return s.Status, false, err
	}
	raw, _ := json.Marshal(snap)
	tag, err := pool.Exec(ctx, `
		update public.platform_customers
		set commercial_status = $2,
		    day1_completed_at = coalesce(day1_completed_at, now()),
		    payment_requested_at = coalesce(payment_requested_at, now()),
		    day1_snapshot = $3::jsonb,
		    updated_at = now()
		where id = $1 and commercial_status = $4`,
		s.CustomerID, StatusAwaitingPayment, string(raw), StatusSetup)
	if err != nil {
		return s.Status, false, err
	}
	if tag.RowsAffected() == 0 {
		InvalidateTenant(tenantID)
		s2, _ := loadState(ctx, pool, tenantID)
		return s2.Status, false, nil
	}
	InvalidateTenant(tenantID)
	customerregistry.AppendCRMLeadNote(ctx, pool, s.CustomerID,
		"[day1] Day 1 setup complete (places + products + stock). Awaiting GCash payment confirmation.")
	return StatusAwaitingPayment, true, nil
}

// UnlockCommercial clears the Day 1 / GCash trade lock from any locked status.
// Used for manual checkout: confirm Day 1 payment, or activate a paid subscription in Platform Command.
// Idempotent when already unlocked (returns tenant id, alreadyUnlocked=true, err=nil).
func UnlockCommercial(ctx context.Context, pool *pgxpool.Pool, customerID int64, confirmedByUserID *int64, note string) (tenantID int64, alreadyUnlocked bool, err error) {
	var status string
	err = pool.QueryRow(ctx, `
		select coalesce(tenant_id, 0), coalesce(commercial_status, 'unlocked')
		from public.platform_customers where id = $1`, customerID).Scan(&tenantID, &status)
	if err != nil {
		return 0, false, err
	}
	if status == StatusUnlocked {
		InvalidateTenant(tenantID)
		return tenantID, true, nil
	}
	if status != StatusSetup && status != StatusAwaitingPayment && status != StatusCancelled {
		return tenantID, false, pgx.ErrNoRows
	}

	err = pool.QueryRow(ctx, `
		update public.platform_customers
		set commercial_status = $2,
		    payment_confirmed_at = now(),
		    payment_confirmed_by_user_id = $3,
		    payment_note = nullif($4, ''),
		    day1_completed_at = coalesce(day1_completed_at, now()),
		    payment_requested_at = coalesce(payment_requested_at, now()),
		    updated_at = now()
		where id = $1 and commercial_status in ($5, $6, $7)
		returning coalesce(tenant_id, 0)`,
		customerID, StatusUnlocked, confirmedByUserID, note,
		StatusSetup, StatusAwaitingPayment, StatusCancelled).Scan(&tenantID)
	if err != nil {
		return 0, false, err
	}
	InvalidateTenant(tenantID)
	return tenantID, false, nil
}

// ConfirmPayment unlocks trading after platform owner confirms payment (any locked status).
func ConfirmPayment(ctx context.Context, pool *pgxpool.Pool, customerID int64, confirmedByUserID *int64, note string) (tenantID int64, err error) {
	tenantID, _, err = UnlockCommercial(ctx, pool, customerID, confirmedByUserID, note)
	return tenantID, err
}

// RejectPayment marks commercial cancelled (does not wipe tenant).
func RejectPayment(ctx context.Context, pool *pgxpool.Pool, customerID int64, note string) (tenantID int64, err error) {
	err = pool.QueryRow(ctx, `
		update public.platform_customers
		set commercial_status = $2,
		    payment_note = nullif($3, ''),
		    updated_at = now()
		where id = $1 and commercial_status = $4
		returning tenant_id`,
		customerID, StatusCancelled, note, StatusAwaitingPayment).Scan(&tenantID)
	if err != nil {
		return 0, err
	}
	InvalidateTenant(tenantID)
	return tenantID, nil
}
