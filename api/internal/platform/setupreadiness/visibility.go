package setupreadiness

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const setupReminderSnooze = 7 * 24 * time.Hour

type userReminderState struct {
	SkippedAt   *time.Time
	SnoozeUntil *time.Time
}

func loadUserReminderState(ctx context.Context, pool *pgxpool.Pool, userID int64) (userReminderState, error) {
	var s userReminderState
	err := pool.QueryRow(ctx, `
		select setup_wizard_skipped_at, setup_reminder_snooze_until
		from public.users where id = $1`, userID).Scan(&s.SkippedAt, &s.SnoozeUntil)
	return s, err
}

func skipWizardForUser(ctx context.Context, pool *pgxpool.Pool, userID int64) error {
	_, err := pool.Exec(ctx, `
		update public.users
		set setup_wizard_skipped_at = coalesce(setup_wizard_skipped_at, now()), updated_at = now()
		where id = $1`, userID)
	return err
}

func snoozeReminderForUser(ctx context.Context, pool *pgxpool.Pool, userID int64) error {
	until := time.Now().Add(setupReminderSnooze)
	_, err := pool.Exec(ctx, `
		update public.users
		set setup_reminder_snooze_until = $2, updated_at = now()
		where id = $1`, userID, until)
	return err
}

func (s userReminderState) snoozed(now time.Time) bool {
	return s.SnoozeUntil != nil && s.SnoozeUntil.After(now)
}

func showSetupBanner(requiredComplete bool, canManage bool, s userReminderState, now time.Time) bool {
	if requiredComplete || !canManage {
		return false
	}
	return !s.snoozed(now)
}

func showBreadcrumbHint(requiredComplete bool, canManage bool, s userReminderState, now time.Time) bool {
	if requiredComplete || !canManage {
		return false
	}
	return s.snoozed(now)
}
