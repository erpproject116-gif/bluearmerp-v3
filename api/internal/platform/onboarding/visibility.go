package onboarding

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	newUserWindowDays    = 30
	freshTenantDays      = 7
	snoozeDuration       = 7 * 24 * time.Hour
)

type userOnboardingState struct {
	FirstAppSeenAt     *time.Time
	DismissedAt        *time.Time
	SnoozeUntil        *time.Time
	UserCreatedAt      time.Time
	IsTenantOwner      bool
	TenantCreatedAt    time.Time
	TenantHasActivity  bool
}

func touchFirstAppSeen(ctx context.Context, pool *pgxpool.Pool, userID int64) error {
	_, err := pool.Exec(ctx, `
		update public.users
		set first_app_seen_at = coalesce(first_app_seen_at, now()), updated_at = now()
		where id = $1`, userID)
	return err
}

func loadUserOnboardingState(ctx context.Context, pool *pgxpool.Pool, tenantID, userID int64, isOwner bool) (userOnboardingState, error) {
	var s userOnboardingState
	s.IsTenantOwner = isOwner
	err := pool.QueryRow(ctx, `
		select u.first_app_seen_at, u.onboarding_playbook_dismissed_at, u.onboarding_playbook_snooze_until, u.created_at,
		  t.created_at
		from public.users u
		join public.tenants t on t.id = u.tenant_id
		where u.id = $1 and u.tenant_id = $2`, userID, tenantID).Scan(
		&s.FirstAppSeenAt, &s.DismissedAt, &s.SnoozeUntil, &s.UserCreatedAt, &s.TenantCreatedAt)
	if err != nil {
		return s, err
	}
	var salesCount int
	_ = pool.QueryRow(ctx, `
		select count(*)::int from public.sa_sales where tenant_id = $1 and deleted_at is null limit 1`, tenantID).Scan(&salesCount)
	s.TenantHasActivity = salesCount > 0
	return s, nil
}

func dismissPlaybookForUser(ctx context.Context, pool *pgxpool.Pool, userID int64, snoozeOnly bool) error {
	if snoozeOnly {
		until := time.Now().Add(snoozeDuration)
		_, err := pool.Exec(ctx, `
			update public.users
			set onboarding_playbook_snooze_until = $2, updated_at = now()
			where id = $1`, userID, until)
		return err
	}
	_, err := pool.Exec(ctx, `
		update public.users
		set onboarding_playbook_dismissed_at = now(),
		    onboarding_playbook_snooze_until = null,
		    updated_at = now()
		where id = $1`, userID)
	return err
}

func (s userOnboardingState) playbookEligible(now time.Time) bool {
	if s.DismissedAt != nil {
		return false
	}
	if s.SnoozeUntil != nil && s.SnoozeUntil.After(now) {
		return false
	}
	// Established tenant + user who has been around: skip extended playbook.
	if s.TenantHasActivity && now.Sub(s.UserCreatedAt) > freshTenantDays*24*time.Hour {
		return false
	}
	if now.Sub(s.UserCreatedAt) <= newUserWindowDays*24*time.Hour {
		return true
	}
	if now.Sub(s.TenantCreatedAt) <= freshTenantDays*24*time.Hour && s.IsTenantOwner {
		return true
	}
	if s.FirstAppSeenAt != nil && now.Sub(*s.FirstAppSeenAt) <= freshTenantDays*24*time.Hour {
		return true
	}
	return false
}

func resolveVisibility(requiredComplete bool, u userOnboardingState) (showSetup, showPlaybook bool) {
	showSetup = !requiredComplete
	showPlaybook = requiredComplete && u.playbookEligible(time.Now())
	return showSetup, showPlaybook
}

// Used in tests
func resolveVisibilityAt(requiredComplete bool, u userOnboardingState, now time.Time) (showSetup, showPlaybook bool) {
	showSetup = !requiredComplete
	showPlaybook = requiredComplete && u.playbookEligible(now)
	return showSetup, showPlaybook
}
