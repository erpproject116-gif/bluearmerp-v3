package entitlement

import (
	"context"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customerregistry"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/ttlcache"
)

// Snapshot is returned on /auth/me for tenant entitlement state.
type Snapshot struct {
	PlanKind      string     `json:"plan_kind"`
	Status        string     `json:"status"`
	EndsAt        *time.Time `json:"ends_at,omitempty"`
	DaysRemaining *int       `json:"days_remaining,omitempty"`
	UrgencyLabel  string     `json:"urgency_label"`
	WriteBlocked  bool       `json:"write_blocked"`
	Message       string     `json:"message,omitempty"`
}

// billingState is the raw customer + subscription data behind a snapshot. Only
// this is cached; everything time-dependent (days remaining, whether the grace
// deadline has passed) is recomputed per request so a cached row can never keep
// serving an outdated verdict.
type billingState struct {
	HasCustomer bool
	Urgency     string
	PlanKind    string
	Status      string
	EndsAt      *time.Time
}

// ENTITLEMENT_CACHE_TTL_SECONDS=0 disables the cache and restores two DB reads per check.
var billingCache = ttlcache.New[billingState]("ENTITLEMENT_CACHE_TTL_SECONDS", 30, 10000)

func init() {
	customerregistry.OnTenantBillingChanged(InvalidateTenant)
}

// InvalidateTenant drops the cached billing state after a customer or
// subscription write, so suspensions and renewals apply on the next request.
func InvalidateTenant(tenantID int64) {
	billingCache.Invalidate(strconv.FormatInt(tenantID, 10))
}

// ResetCache clears every cached tenant (tests).
func ResetCache() { billingCache.Reset() }

func loadBillingState(ctx context.Context, pool *pgxpool.Pool, tenantID int64) billingState {
	key := strconv.FormatInt(tenantID, 10)
	if state, ok := billingCache.Get(key); ok {
		return state
	}
	var state billingState
	var customerID int64
	if err := pool.QueryRow(ctx, `
		select id, urgency_label from public.platform_customers
		where tenant_id = $1
		order by updated_at desc limit 1`, tenantID).Scan(&customerID, &state.Urgency); err != nil {
		// No customer record: unmanaged workspace, never write-blocked. Cache the
		// negative too — this is the common shape for self-hosted/dev tenants.
		billingCache.Set(key, state)
		return state
	}
	state.HasCustomer = true

	_ = pool.QueryRow(ctx, `
		select plan_kind, status, ends_at
		from public.platform_subscriptions
		where customer_id = $1 and status in ('active', 'past_due')
		order by created_at desc limit 1`, customerID).Scan(&state.PlanKind, &state.Status, &state.EndsAt)

	billingCache.Set(key, state)
	return state
}

// LoadForTenant returns entitlement for the active tenant.
func LoadForTenant(ctx context.Context, pool *pgxpool.Pool, tenantID int64, isSuperadmin bool, graceDays int) (*Snapshot, error) {
	if isSuperadmin {
		return nil, nil
	}
	state := loadBillingState(ctx, pool, tenantID)
	if !state.HasCustomer {
		return nil, nil
	}
	if state.PlanKind == "" {
		return &Snapshot{UrgencyLabel: state.Urgency, WriteBlocked: false}, nil
	}

	snap := &Snapshot{
		PlanKind:     state.PlanKind,
		Status:       state.Status,
		EndsAt:       state.EndsAt,
		UrgencyLabel: state.Urgency,
	}
	if state.EndsAt != nil {
		d := int(time.Until(*state.EndsAt).Hours() / 24)
		snap.DaysRemaining = &d
	}

	snap.WriteBlocked = ShouldBlockWrites(state.PlanKind, state.Status, state.EndsAt, state.Urgency, graceDays)
	if snap.WriteBlocked {
		snap.Message = BlockMessage(state.Urgency)
	}
	return snap, nil
}

func ShouldBlockWrites(planKind, status string, endsAt *time.Time, urgency string, graceDays int) bool {
	if status == customerregistry.SubCancelled {
		return true
	}
	switch urgency {
	case customerregistry.UrgencyTrialExpired, customerregistry.UrgencyDemoExpired,
		customerregistry.UrgencyPaymentOverdue, customerregistry.UrgencyChurned:
		return true
	}
	if endsAt == nil {
		return false
	}
	deadline := endsAt.Add(time.Duration(graceDays) * 24 * time.Hour)
	if time.Now().After(deadline) {
		switch planKind {
		case customerregistry.PlanDemo, customerregistry.PlanTrial90d:
			return true
		case customerregistry.PlanStandard6Mo, customerregistry.PlanStandard12Mo:
			return status == customerregistry.SubPastDue || urgency == customerregistry.UrgencyPaymentOverdue
		}
	}
	return false
}

func BlockMessage(urgency string) string {
	switch urgency {
	case customerregistry.UrgencyTrialExpired:
		return "Your 90-day trial has ended. Contact sales or your administrator to subscribe."
	case customerregistry.UrgencyDemoExpired:
		return "Your demo workspace has expired. Start a trial or contact sales to continue."
	case customerregistry.UrgencyPaymentOverdue:
		return "Your subscription has an overdue payment. Please settle your invoice to restore full access."
	case customerregistry.UrgencyChurned:
		return "Your subscription has ended. Contact sales to renew."
	default:
		return "Your workspace access is limited. Contact your administrator."
	}
}
