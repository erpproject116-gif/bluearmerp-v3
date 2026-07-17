package onboarding

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/setupreadiness"
)

// SnapshotForTenant returns a read-only onboarding projection for Command Center.
// It does not acknowledge steps, snooze reminders, or rewrite platform_customers.onboarding_progress.
func SnapshotForTenant(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (map[string]any, error) {
	if tenantID <= 0 {
		return map[string]any{
			"required_complete": false,
			"ready":             false,
			"percent":           0,
			"overall_percent":   0,
			"tracks":            []any{},
			"blocking_reason":   "No linked tenant.",
		}, nil
	}
	readiness, err := setupreadiness.Load(ctx, pool, tenantID)
	if err != nil {
		return nil, err
	}
	tracks, overallPercent, meta := buildTracks(ctx, pool, tenantID, readiness)

	steps := make([]map[string]any, 0, len(readiness.Steps))
	for _, s := range readiness.Steps {
		if s.ID == "ready" {
			continue
		}
		steps = append(steps, map[string]any{
			"id": s.ID, "label": s.Label, "href": s.Href, "done": s.Done, "required": s.Required,
		})
	}

	out := map[string]any{
		"steps":             steps,
		"percent":           readiness.Percent,
		"overall_percent":   overallPercent,
		"tracks":            tracks,
		"meta":              meta,
		"required_complete": readiness.RequiredComplete,
		"ready":             readiness.Ready,
		"blocking_reason":   readiness.BlockingReason,
	}
	if readiness.NextStep != nil {
		out["next_step"] = map[string]any{
			"id": readiness.NextStep.ID, "label": readiness.NextStep.Label, "href": readiness.NextStep.Href,
		}
	}
	if next := nextIncompleteTrackStep(tracks); next != nil {
		out["next_extended_step"] = next
	}
	return out, nil
}
