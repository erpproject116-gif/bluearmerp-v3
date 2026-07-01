package reports

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/outbox"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type tickSchedulesResult struct {
	SchedulesTicked int `json:"schedules_ticked"`
	EventsEnqueued  int `json:"events_enqueued"`
}

// RegisterJobRoutes exposes cron-style report schedule tick (secret-protected).
func RegisterJobRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Post("/reports/jobs/tick-schedules", tickSchedulesJob(pool))
}

func tickSchedulesJob(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		secret := strings.TrimSpace(os.Getenv("REPORTS_JOB_SECRET"))
		if secret == "" {
			secret = strings.TrimSpace(os.Getenv("CRM_JOB_SECRET"))
		}
		if secret == "" {
			response.Err(w, http.StatusServiceUnavailable, "Report job secret not configured.", "ERR_UNAVAILABLE")
			return
		}
		if strings.TrimSpace(r.Header.Get("X-Reports-Job-Secret")) != secret &&
			strings.TrimSpace(r.Header.Get("X-CRM-Job-Secret")) != secret {
			response.Err(w, http.StatusUnauthorized, "Invalid job secret.", "ERR_UNAUTHORIZED")
			return
		}

		result, err := tickDueSchedules(r.Context(), pool)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Schedule tick failed.", "ERR_INTERNAL")
			return
		}
		_ = DrainOutbox(r.Context(), pool)
		response.OK(w, result, "Ticked.")
	}
}

func tickDueSchedules(ctx context.Context, pool *pgxpool.Pool) (tickSchedulesResult, error) {
	var result tickSchedulesResult
	rows, err := pool.Query(ctx, `
		select id, tenant_id, report_key, filters
		from public.report_schedules
		where is_active = true and next_run_at <= now()
		order by next_run_at
		limit 100
		for update skip locked`)
	if err != nil {
		return result, err
	}
	defer rows.Close()

	type dueSchedule struct {
		id        int64
		tenantID  int64
		reportKey string
		filters   json.RawMessage
	}
	var due []dueSchedule
	for rows.Next() {
		var s dueSchedule
		if err := rows.Scan(&s.id, &s.tenantID, &s.reportKey, &s.filters); err != nil {
			return result, err
		}
		due = append(due, s)
	}
	if err := rows.Err(); err != nil {
		return result, err
	}

	for _, s := range due {
		tx, err := pool.Begin(ctx)
		if err != nil {
			return result, err
		}
		payload := scheduledExportPayload{
			ScheduleID: s.id,
			ReportKey:  s.reportKey,
			Filters:    s.filters,
		}
		idemKey := fmt.Sprintf("report.scheduled_export:%d:%d", s.id, time.Now().Unix())
		if err := outbox.EnqueueTx(ctx, tx, s.tenantID, "report.scheduled_export", idemKey, payload); err != nil {
			_ = tx.Rollback(ctx)
			return result, err
		}
		tag, err := tx.Exec(ctx, `
			update public.report_schedules
			set last_run_at = now(),
			    next_run_at = next_run_at + interval '1 day',
			    updated_at = now()
			where id = $1 and is_active = true`, s.id)
		if err != nil || tag.RowsAffected() == 0 {
			_ = tx.Rollback(ctx)
			if err != nil {
				return result, err
			}
			continue
		}
		if err := tx.Commit(ctx); err != nil {
			return result, err
		}
		result.SchedulesTicked++
		result.EventsEnqueued++
	}
	return result, nil
}

// EnqueueScheduledExportTx is a helper for tests and future schedule CRUD handlers.
func EnqueueScheduledExportTx(ctx context.Context, tx pgx.Tx, tenantID, scheduleID int64, reportKey string, filters json.RawMessage) error {
	payload := scheduledExportPayload{
		ScheduleID: scheduleID,
		ReportKey:  reportKey,
		Filters:    filters,
	}
	idemKey := fmt.Sprintf("report.scheduled_export:%d:%d", scheduleID, time.Now().UnixNano())
	return outbox.EnqueueTx(ctx, tx, tenantID, "report.scheduled_export", idemKey, payload)
}
