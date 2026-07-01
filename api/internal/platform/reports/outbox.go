package reports

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/outbox"
)

type scheduledExportPayload struct {
	ScheduleID int64           `json:"schedule_id"`
	ReportKey  string          `json:"report_key"`
	Filters    json.RawMessage `json:"filters,omitempty"`
}

// HandleOutboxEvent processes report-related outbox events (scheduled CSV export stub).
func HandleOutboxEvent(ctx context.Context, pool *pgxpool.Pool, ev outbox.Event) error {
	if ev.EventType != "report.scheduled_export" {
		return nil
	}
	var p scheduledExportPayload
	if len(ev.Payload) > 0 {
		_ = json.Unmarshal(ev.Payload, &p)
	}
	csvPath := fmt.Sprintf("/exports/tenant-%d/%s-%s.csv", ev.TenantID, p.ReportKey, time.Now().Format("20060102"))
	log.Printf("report scheduled export stub: tenant=%d schedule=%d report=%s csv_path=%q",
		ev.TenantID, p.ScheduleID, p.ReportKey, csvPath)
	return nil
}

// DrainOutbox processes pending report-related outbox events.
func DrainOutbox(ctx context.Context, pool *pgxpool.Pool) error {
	for {
		n, err := outbox.DrainPending(ctx, pool, HandleOutboxEvent)
		if err != nil {
			return err
		}
		if n == 0 {
			return nil
		}
	}
}
