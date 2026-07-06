package entitlement

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customerregistry"
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

// LoadForTenant returns entitlement for the active tenant.
func LoadForTenant(ctx context.Context, pool *pgxpool.Pool, tenantID int64, isSuperadmin bool, graceDays int) (*Snapshot, error) {
	if isSuperadmin {
		return nil, nil
	}
	var customerID int64
	var urgency string
	err := pool.QueryRow(ctx, `
		select id, urgency_label from public.platform_customers
		where tenant_id = $1
		order by updated_at desc limit 1`, tenantID).Scan(&customerID, &urgency)
	if err != nil {
		return nil, nil
	}

	var planKind, status string
	var endsAt *time.Time
	_ = pool.QueryRow(ctx, `
		select plan_kind, status, ends_at
		from public.platform_subscriptions
		where customer_id = $1 and status in ('active', 'past_due')
		order by created_at desc limit 1`, customerID).Scan(&planKind, &status, &endsAt)

	if planKind == "" {
		return &Snapshot{UrgencyLabel: urgency, WriteBlocked: false}, nil
	}

	snap := &Snapshot{
		PlanKind:     planKind,
		Status:       status,
		EndsAt:       endsAt,
		UrgencyLabel: urgency,
	}
	if endsAt != nil {
		d := int(time.Until(*endsAt).Hours() / 24)
		snap.DaysRemaining = &d
	}

	snap.WriteBlocked = ShouldBlockWrites(planKind, status, endsAt, urgency, graceDays)
	if snap.WriteBlocked {
		snap.Message = BlockMessage(urgency)
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
