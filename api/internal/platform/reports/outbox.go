package reports

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/outbox"
)

type scheduledExportPayload struct {
	ScheduleID   int64           `json:"schedule_id"`
	ReportKey    string          `json:"report_key"`
	Filters      json.RawMessage `json:"filters,omitempty"`
	RecipientEmail string        `json:"recipient_email,omitempty"`
}

// HandleOutboxEvent processes report-related outbox events and emails export notice when SMTP is configured.
func HandleOutboxEvent(ctx context.Context, pool *pgxpool.Pool, ev outbox.Event) error {
	if ev.EventType != "report.scheduled_export" {
		return nil
	}
	var p scheduledExportPayload
	if len(ev.Payload) > 0 {
		_ = json.Unmarshal(ev.Payload, &p)
	}
	csvPath := fmt.Sprintf("/exports/tenant-%d/%s-%s.csv", ev.TenantID, p.ReportKey, time.Now().Format("20060102"))
	cfg := outbox.LoadSMTPConfig()
	if !cfg.Enabled() {
		log.Printf("report scheduled export: tenant=%d schedule=%d report=%s csv_path=%q — SMTP not configured",
			ev.TenantID, p.ScheduleID, p.ReportKey, csvPath)
		return nil
	}
	to := strings.TrimSpace(p.RecipientEmail)
	if to == "" {
		_ = pool.QueryRow(ctx, `
			select coalesce(s.recipient_email, u.email, '')
			from public.bi_report_schedules s
			left join public.users u on u.id = s.created_by_user_id
			where s.id = $1 and s.tenant_id = $2`, p.ScheduleID, ev.TenantID).Scan(&to)
	}
	if strings.TrimSpace(to) == "" {
		log.Printf("report scheduled export: tenant=%d schedule=%d — no recipient email", ev.TenantID, p.ScheduleID)
		return nil
	}
	subject := fmt.Sprintf("[Reports] Scheduled export: %s", p.ReportKey)
	body := fmt.Sprintf("Your scheduled report export is ready.\n\nReport: %s\nExport path: %s\n\nDownload from the Reports module in Bluearm ERP.",
		p.ReportKey, csvPath)
	return outbox.SendEmail(cfg, to, subject, body)
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
