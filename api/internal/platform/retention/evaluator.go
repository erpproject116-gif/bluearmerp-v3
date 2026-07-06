package retention

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/config"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customerregistry"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// RegisterJobRoutes mounts the platform retention cron endpoint.
func RegisterJobRoutes(r chi.Router, pool *pgxpool.Pool, cfg config.Config) {
	r.Post("/platform/jobs/retention", evaluateRetentionJob(pool, cfg))
}

type evaluateResult struct {
	CustomersProcessed int `json:"customers_processed"`
	LabelsUpdated      int `json:"labels_updated"`
	TasksCreated       int `json:"tasks_created"`
	LeadsUpdated       int `json:"leads_updated"`
}

func evaluateRetentionJob(pool *pgxpool.Pool, cfg config.Config) http.HandlerFunc {
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

		result, err := runRetentionEvaluator(r.Context(), pool, cfg)
		if err != nil {
			log.Printf("retention: %v", err)
			response.Err(w, http.StatusInternalServerError, "Retention evaluation failed.", "ERR_INTERNAL")
			return
		}
		response.OK(w, result, "Evaluated.")
	}
}

func runRetentionEvaluator(ctx context.Context, pool *pgxpool.Pool, cfg config.Config) (evaluateResult, error) {
	var result evaluateResult
	now := time.Now()
	leadgenID, hasLeadgen := customerregistry.LeadgenTenantIDFromCfg(ctx, pool, cfg)

	rows, err := pool.Query(ctx, `select id from public.platform_customers order by id`)
	if err != nil {
		return result, err
	}
	defer rows.Close()

	for rows.Next() {
		var customerID int64
		if err := rows.Scan(&customerID); err != nil {
			return result, err
		}
		result.CustomersProcessed++

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
			n, err := syncCRMForCustomer(ctx, pool, leadgenID, customerID, label, prevLabel, now)
			if err != nil {
				return result, err
			}
			result.LeadsUpdated += n
			t, err := ensureRetentionTask(ctx, pool, leadgenID, customerID, label, now)
			if err != nil {
				return result, err
			}
			result.TasksCreated += t
		}
	}
	return result, rows.Err()
}

func syncCRMForCustomer(ctx context.Context, pool *pgxpool.Pool, leadgenID, customerID int64, label, prevLabel string, now time.Time) (int, error) {
	if label == prevLabel {
		return 0, nil
	}
	var leadTenant, leadID *int64
	err := pool.QueryRow(ctx, `
		select crm_lead_tenant_id, crm_lead_id from public.platform_customers where id = $1`, customerID).
		Scan(&leadTenant, &leadID)
	if err != nil || leadTenant == nil || leadID == nil || *leadTenant != leadgenID {
		return 0, nil
	}

	note := fmt.Sprintf("[%s] Urgency: %s → %s", now.Format("2006-01-02"), prevLabel, label)
	tag, err := pool.Exec(ctx, `
		update public.crm_leads
		set notes = coalesce(notes, '') || E'\n' || $3,
		    status = case
		      when $4 in ('trial_expired', 'demo_expired', 'payment_overdue', 'churned') and status not in ('lost', 'converted') then 'contacted'
		      when $4 in ('trial_urgent', 'trial_critical', 'renewal_due') and status = 'new' then 'contacted'
		      else status
		    end,
		    updated_at = now()
		where tenant_id = $1 and id = $2`, *leadTenant, *leadID, note, label)
	if err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}

func ensureRetentionTask(ctx context.Context, pool *pgxpool.Pool, leadgenID, customerID int64, label string, now time.Time) (int, error) {
	taskType, title, due := retentionTaskMeta(ctx, pool, customerID, label, now)
	if taskType == "" {
		return 0, nil
	}

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
	if title == "" {
		title = "Subscription follow-up: " + email
	}
	if company != "" {
		title = title + " (" + company + ")"
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

func retentionTaskMeta(ctx context.Context, pool *pgxpool.Pool, customerID int64, label string, now time.Time) (taskType, title string, due time.Time) {
	due = now
	switch label {
	case customerregistry.UrgencyTrialUrgent, customerregistry.UrgencyTrialCritical:
		taskType = "subscription_trial_follow_up"
		title = "Trial expiring soon"
		var endsAt *time.Time
		_ = pool.QueryRow(ctx, `
			select ends_at from public.platform_subscriptions
			where customer_id = $1 and plan_kind = 'trial_90d' and status = 'active'
			order by created_at desc limit 1`, customerID).Scan(&endsAt)
		if endsAt != nil {
			due = *endsAt
		}
	case customerregistry.UrgencyRenewalDue:
		taskType = "subscription_renewal_follow_up"
		title = "Subscription renewal due"
		var endsAt *time.Time
		_ = pool.QueryRow(ctx, `
			select ends_at from public.platform_subscriptions
			where customer_id = $1 and plan_kind in ('standard_6mo', 'standard_12mo') and status = 'active'
			order by created_at desc limit 1`, customerID).Scan(&endsAt)
		if endsAt != nil {
			due = *endsAt
		}
	case customerregistry.UrgencyPaymentOverdue:
		taskType = "subscription_payment_follow_up"
		title = "Payment overdue"
		_ = pool.QueryRow(ctx, `
			select due_date::timestamptz from public.platform_subscription_invoices i
			join public.platform_subscriptions s on s.id = i.subscription_id
			where s.customer_id = $1 and i.status = 'issued' and i.due_date < $2::date
			order by i.due_date asc limit 1`, customerID, now).Scan(&due)
	default:
		return "", "", now
	}
	return taskType, title, due
}

// MarkDemoSubscriptionsExpired updates platform state before demo tenant deletion.
func MarkDemoSubscriptionsExpired(ctx context.Context, pool *pgxpool.Pool, tenantIDs []int64) {
	if len(tenantIDs) == 0 {
		return
	}
	_, _ = pool.Exec(ctx, `
		update public.platform_subscriptions
		set status = 'expired', updated_at = now()
		where tenant_id = any($1) and plan_kind = 'demo' and status = 'active'`, tenantIDs)
	_, _ = pool.Exec(ctx, `
		update public.platform_customers pc
		set urgency_label = 'demo_expired', urgency_updated_at = now(), updated_at = now()
		from public.platform_subscriptions ps
		where ps.customer_id = pc.id and ps.tenant_id = any($1) and ps.plan_kind = 'demo'`, tenantIDs)
}
