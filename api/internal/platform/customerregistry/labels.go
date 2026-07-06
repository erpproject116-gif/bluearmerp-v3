package customerregistry

import (
	"context"
	"math"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Urgency labels stored on platform_customers.
const (
	UrgencyNewLead            = "new_lead"
	UrgencyDemoActive         = "demo_active"
	UrgencyDemoExpiringSoon   = "demo_expiring_soon"
	UrgencyDemoExpired        = "demo_expired"
	UrgencyTrialActive        = "trial_active"
	UrgencyTrialUrgent        = "trial_urgent"
	UrgencyTrialCritical      = "trial_critical"
	UrgencyTrialExpired       = "trial_expired"
	UrgencySubscriptionActive = "subscription_active"
	UrgencyRenewalDue         = "renewal_due"
	UrgencyPaymentOverdue     = "payment_overdue"
	UrgencyChurned            = "churned"
)

type subscriptionRow struct {
	PlanKind string
	Status   string
	EndsAt   *time.Time
}

// ComputeUrgencyLabel derives the urgency label from customer + subscription + invoice state.
func ComputeUrgencyLabel(hasTenant bool, subs []subscriptionRow, hasOverdueInvoice bool, now time.Time) string {
	if !hasTenant {
		return UrgencyNewLead
	}
	if hasOverdueInvoice {
		return UrgencyPaymentOverdue
	}

	var active *subscriptionRow
	for i := range subs {
		s := &subs[i]
		if s.Status == SubActive {
			active = s
			break
		}
	}
	if active == nil {
		// Check for recently expired
		for i := range subs {
			if subs[i].Status == SubExpired || subs[i].Status == SubCancelled {
				return UrgencyChurned
			}
		}
		return UrgencyTrialExpired
	}

	daysLeft := daysUntil(active.EndsAt, now)

	switch active.PlanKind {
	case PlanDemo:
		if daysLeft <= 0 {
			return UrgencyDemoExpired
		}
		if daysLeft <= 7 {
			return UrgencyDemoExpiringSoon
		}
		return UrgencyDemoActive
	case PlanTrial90d:
		if daysLeft <= 0 {
			return UrgencyTrialExpired
		}
		if daysLeft <= 3 {
			return UrgencyTrialCritical
		}
		if daysLeft <= 14 {
			return UrgencyTrialUrgent
		}
		return UrgencyTrialActive
	case PlanStandard6Mo, PlanStandard12Mo:
		if daysLeft <= 0 {
			return UrgencyChurned
		}
		if daysLeft <= 30 {
			return UrgencyRenewalDue
		}
		return UrgencySubscriptionActive
	default:
		return UrgencySubscriptionActive
	}
}

func daysUntil(endsAt *time.Time, now time.Time) int {
	if endsAt == nil {
		return 9999
	}
	hours := endsAt.Sub(now).Hours()
	return int(math.Ceil(hours / 24))
}

// UpdateCustomerUrgency recomputes and persists urgency for one customer.
func UpdateCustomerUrgency(ctx context.Context, pool *pgxpool.Pool, customerID int64, now time.Time) (string, error) {
	var tenantID *int64
	err := pool.QueryRow(ctx, `select tenant_id from public.platform_customers where id = $1`, customerID).Scan(&tenantID)
	if err != nil {
		return "", err
	}
	hasTenant := tenantID != nil && *tenantID > 0

	rows, err := pool.Query(ctx, `
		select plan_kind, status, ends_at
		from public.platform_subscriptions
		where customer_id = $1
		order by created_at desc`, customerID)
	if err != nil {
		return "", err
	}
	var subs []subscriptionRow
	for rows.Next() {
		var s subscriptionRow
		if err := rows.Scan(&s.PlanKind, &s.Status, &s.EndsAt); err != nil {
			rows.Close()
			return "", err
		}
		subs = append(subs, s)
	}
	rows.Close()

	var overdue bool
	_ = pool.QueryRow(ctx, `
		select exists(
		  select 1
		  from public.platform_subscription_invoices i
		  join public.platform_subscriptions s on s.id = i.subscription_id
		  where s.customer_id = $1
		    and i.status = 'issued'
		    and i.due_date < $2::date
		)`, customerID, now).Scan(&overdue)

	label := ComputeUrgencyLabel(hasTenant, subs, overdue, now)
	_, err = pool.Exec(ctx, `
		update public.platform_customers
		set urgency_label = $2, urgency_updated_at = $3, updated_at = now()
		where id = $1`, customerID, label, now)
	return label, err
}
