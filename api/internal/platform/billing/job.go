package billing

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/config"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customerregistry"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type jobResult struct {
	InvoicesCreated      int `json:"invoices_created"`
	SubscriptionsPastDue int `json:"subscriptions_past_due"`
	LabelsUpdated        int `json:"labels_updated"`
	TasksCreated         int `json:"tasks_created"`
	RemindersQueued      int `json:"reminders_queued"`
	OutboxProcessed      int `json:"outbox_processed"`
}

// RegisterJobRoutes mounts the platform billing cron endpoint.
func RegisterJobRoutes(r chi.Router, pool *pgxpool.Pool, cfg config.Config) {
	r.Post("/platform/jobs/billing", billingJobHandler(pool, cfg))
}

func billingJobHandler(pool *pgxpool.Pool, cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		secret := strings.TrimSpace(os.Getenv("PLATFORM_JOB_SECRET"))
		if secret == "" {
			secret = strings.TrimSpace(cfg.PlatformJobSecret)
		}
		if secret == "" {
			response.Err(w, http.StatusServiceUnavailable, "Platform job secret not configured.", "ERR_UNAVAILABLE")
			return
		}
		if strings.TrimSpace(r.Header.Get("X-Platform-Job-Secret")) != secret {
			response.Err(w, http.StatusUnauthorized, "Invalid job secret.", "ERR_UNAUTHORIZED")
			return
		}

		result, err := runBillingJob(r.Context(), pool, cfg)
		if err != nil {
			log.Printf("billing job: %v", err)
			response.Err(w, http.StatusInternalServerError, "Billing job failed.", "ERR_INTERNAL")
			return
		}
		response.OK(w, result, "Billing job completed.")
	}
}

func runBillingJob(ctx context.Context, pool *pgxpool.Pool, cfg config.Config) (jobResult, error) {
	var result jobResult
	now := time.Now()
	today := now.Truncate(24 * time.Hour)

	for {
		n, err := DrainOutbox(ctx, pool)
		if err != nil {
			return result, err
		}
		result.OutboxProcessed += n
		if n == 0 {
			break
		}
	}

	created, err := generateDueInvoices(ctx, pool, now)
	if err != nil {
		return result, err
	}
	result.InvoicesCreated = created

	tag, err := pool.Exec(ctx, `
		update public.platform_subscriptions s
		set status = 'past_due', updated_at = now()
		where s.status = 'active'
		  and s.monthly_amount > 0
		  and s.plan_kind in ('standard_6mo', 'standard_12mo')
		  and exists (
		    select 1 from public.platform_subscription_invoices i
		    where i.subscription_id = s.id
		      and i.status = 'issued'
		      and i.due_date < $1::date
		  )`, today)
	if err != nil {
		return result, err
	}
	result.SubscriptionsPastDue = int(tag.RowsAffected())

	reminders, err := queuePaymentReminders(ctx, pool, today)
	if err != nil {
		return result, err
	}
	result.RemindersQueued = reminders

	leadgenID, hasLeadgen := customerregistry.LeadgenTenantIDFromCfg(ctx, pool, cfg)
	rows, err := pool.Query(ctx, `
		select distinct s.customer_id
		from public.platform_subscriptions s
		where s.status in ('active', 'past_due')
		  and s.plan_kind in ('standard_6mo', 'standard_12mo')`)
	if err != nil {
		return result, err
	}
	defer rows.Close()

	for rows.Next() {
		var customerID int64
		if err := rows.Scan(&customerID); err != nil {
			return result, err
		}
		prevLabel := ""
		_ = pool.QueryRow(ctx, `select urgency_label from public.platform_customers where id = $1`, customerID).Scan(&prevLabel)
		label, err := customerregistry.UpdateCustomerUrgency(ctx, pool, customerID, now)
		if err != nil {
			return result, err
		}
		if label != prevLabel {
			result.LabelsUpdated++
		}
		if hasLeadgen {
			t, err := ensurePaymentFollowUpTask(ctx, pool, leadgenID, customerID, label, now)
			if err != nil {
				return result, err
			}
			result.TasksCreated += t
		}
	}
	return result, rows.Err()
}

func generateDueInvoices(ctx context.Context, pool *pgxpool.Pool, now time.Time) (int, error) {
	rows, err := pool.Query(ctx, `
		select s.id, s.customer_id, s.tenant_id, s.starts_at, s.ends_at, s.monthly_amount, s.plan_kind
		from public.platform_subscriptions s
		where s.status in ('active', 'past_due')
		  and s.monthly_amount > 0
		  and s.plan_kind in ('standard_6mo', 'standard_12mo')`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	created := 0
	for rows.Next() {
		var subID, customerID, tenantID int64
		var startsAt time.Time
		var endsAt *time.Time
		var monthly float64
		var planKind string
		if err := rows.Scan(&subID, &customerID, &tenantID, &startsAt, &endsAt, &monthly, &planKind); err != nil {
			return created, err
		}

		periodStart, periodEnd, ok := nextBillingPeriod(ctx, pool, subID, startsAt, endsAt, now)
		if !ok {
			continue
		}

		invNo := fmt.Sprintf("INV-%d-%s", subID, periodStart.Format("200601"))
		dueDate := periodStart.AddDate(0, 0, 7)

		tx, err := pool.Begin(ctx)
		if err != nil {
			return created, err
		}
		var invID int64
		err = tx.QueryRow(ctx, `
			insert into public.platform_subscription_invoices
			  (subscription_id, invoice_no, period_start, period_end, amount, due_date, status)
			values ($1, $2, $3, $4, $5, $6, 'issued')
			on conflict (subscription_id, invoice_no) do nothing
			returning id`, subID, invNo, periodStart, periodEnd, monthly, dueDate).Scan(&invID)
		if err == pgx.ErrNoRows {
			_ = tx.Rollback(ctx)
			continue
		}
		if err != nil {
			_ = tx.Rollback(ctx)
			return created, err
		}

		key := fmt.Sprintf("platform.billing.invoice_issued:%d", invID)
		_ = enqueueBillingEmailTx(ctx, tx, tenantID, "platform.billing.invoice_issued", key, map[string]any{
			"invoice_id": invID,
		})
		if err := tx.Commit(ctx); err != nil {
			return created, err
		}
		created++
		_, _ = customerregistry.UpdateCustomerUrgency(ctx, pool, customerID, now)
	}
	return created, rows.Err()
}

func nextBillingPeriod(ctx context.Context, pool *pgxpool.Pool, subID int64, startsAt time.Time, endsAt *time.Time, now time.Time) (start, end time.Time, ok bool) {
	var lastEnd *time.Time
	_ = pool.QueryRow(ctx, `
		select max(period_end)::date
		from public.platform_subscription_invoices
		where subscription_id = $1 and status in ('issued', 'paid')`, subID).Scan(&lastEnd)

	if lastEnd != nil {
		start = lastEnd.AddDate(0, 0, 1)
	} else {
		start = time.Date(startsAt.Year(), startsAt.Month(), startsAt.Day(), 0, 0, 0, 0, startsAt.Location())
	}
	end = start.AddDate(0, 1, -1)

	if endsAt != nil && start.After(*endsAt) {
		return time.Time{}, time.Time{}, false
	}
	if start.After(now) {
		return time.Time{}, time.Time{}, false
	}
	return start, end, true
}

func queuePaymentReminders(ctx context.Context, pool *pgxpool.Pool, today time.Time) (int, error) {
	rows, err := pool.Query(ctx, `
		select i.id, s.tenant_id, i.due_date
		from public.platform_subscription_invoices i
		join public.platform_subscriptions s on s.id = i.subscription_id
		where i.status = 'issued'
		  and i.due_date <= ($1::date + interval '3 days')
		  and i.due_date >= ($1::date - interval '30 days')
		  and (i.last_reminder_at is null or i.last_reminder_at < $1::date)`, today)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	queued := 0
	for rows.Next() {
		var invID, tenantID int64
		var dueDate time.Time
		if err := rows.Scan(&invID, &tenantID, &dueDate); err != nil {
			return queued, err
		}
		tx, err := pool.Begin(ctx)
		if err != nil {
			return queued, err
		}
		key := fmt.Sprintf("platform.billing.payment_reminder:%d:%s", invID, today.Format("20060102"))
		if err := enqueueBillingEmailTx(ctx, tx, tenantID, "platform.billing.payment_reminder", key, map[string]any{
			"invoice_id": invID,
		}); err != nil {
			_ = tx.Rollback(ctx)
			return queued, err
		}
		_, _ = tx.Exec(ctx, `
			update public.platform_subscription_invoices
			set last_reminder_at = $2::date, updated_at = now()
			where id = $1`, invID, today)
		if err := tx.Commit(ctx); err != nil {
			return queued, err
		}
		queued++
	}
	return queued, rows.Err()
}

func ensurePaymentFollowUpTask(ctx context.Context, pool *pgxpool.Pool, leadgenID, customerID int64, label string, now time.Time) (int, error) {
	if label != customerregistry.UrgencyPaymentOverdue && label != customerregistry.UrgencyRenewalDue {
		return 0, nil
	}
	taskType := "subscription_payment_follow_up"
	title := "Payment overdue"
	if label == customerregistry.UrgencyRenewalDue {
		taskType = "subscription_renewal_follow_up"
		title = "Subscription renewal due"
	}
	due := now
	_ = pool.QueryRow(ctx, `
		select due_date::timestamptz from public.platform_subscription_invoices i
		join public.platform_subscriptions s on s.id = i.subscription_id
		where s.customer_id = $1 and i.status = 'issued' and i.due_date < $2::date
		order by i.due_date asc limit 1`, customerID, now).Scan(&due)

	var exists bool
	_ = pool.QueryRow(ctx, `
		select exists(
		  select 1 from public.crm_follow_up_tasks
		  where tenant_id = $1 and platform_customer_id = $2
		    and task_type = $3 and due_date = $4::date
		    and stage not in ('completed', 'cancelled', 'closed')
		)`, leadgenID, customerID, taskType, due).Scan(&exists)
	if exists {
		return 0, nil
	}

	var email, company string
	_ = pool.QueryRow(ctx, `
		select email, coalesce(company_name, '') from public.platform_customers where id = $1`, customerID).
		Scan(&email, &company)
	if company != "" {
		title = title + " (" + company + ")"
	} else {
		title = title + " — " + email
	}

	_, err := pool.Exec(ctx, `
		insert into public.crm_follow_up_tasks
		  (tenant_id, task_type, stage, due_date, title, notes, platform_customer_id)
		values ($1, $2, 'scheduled', $3::date, $4, $5, $6)`,
		leadgenID, taskType, due, title,
		fmt.Sprintf("Auto-created for urgency label: %s", label), customerID)
	if err != nil {
		return 0, err
	}
	return 1, nil
}
