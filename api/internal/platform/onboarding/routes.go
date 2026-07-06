package onboarding

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/plans"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/setupreadiness"
)

// RegisterRoutes mounts tenant onboarding progress endpoints.
func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	svc := &service{pool: pool}
	r.Get("/platform/onboarding", svc.getOnboarding)
	r.Post("/platform/onboarding/dismiss", svc.dismissOnboarding)
	r.Get("/platform/billing", svc.getBilling)
	r.Get("/platform/plans", svc.listPublicPlans)
}

type service struct {
	pool *pgxpool.Pool
}

func (s *service) getOnboarding(w http.ResponseWriter, r *http.Request) {
	tu, ok := auth.FromContext(r.Context())
	if !ok {
		response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
		return
	}
	payload, err := buildProgress(r.Context(), s.pool, tu)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to load onboarding.", "ERR_INTERNAL")
		return
	}
	response.OK(w, payload, "OK")
}

func (s *service) dismissOnboarding(w http.ResponseWriter, r *http.Request) {
	tu, ok := auth.FromContext(r.Context())
	if !ok {
		response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
		return
	}
	if !tu.IsTenantOwner && tu.TenantRole != "store_admin" {
		response.Err(w, http.StatusForbidden, "Admin access required.", "ERR_FORBIDDEN")
		return
	}
	_, _ = s.pool.Exec(r.Context(), `
		update public.platform_customers
		set onboarding_progress = coalesce(onboarding_progress, '{}'::jsonb) || '{"remind_later_at": "now"}'::jsonb,
		    updated_at = now()
		where tenant_id = $1`, tu.TenantID)
	response.OK(w, map[string]bool{"dismissed": false, "remind_later": true}, "Remind later saved.")
}

func (s *service) getBilling(w http.ResponseWriter, r *http.Request) {
	tu, ok := auth.FromContext(r.Context())
	if !ok {
		response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
		return
	}
	if !tu.IsTenantOwner && !tu.IsPlatformSuperadmin {
		response.Err(w, http.StatusForbidden, "Tenant owner access required.", "ERR_FORBIDDEN")
		return
	}

	var customerID int64
	err := s.pool.QueryRow(r.Context(), `
		select id from public.platform_customers where tenant_id = $1 limit 1`, tu.TenantID).Scan(&customerID)
	if err != nil {
		response.OK(w, map[string]any{
			"subscription": nil,
			"invoices":     []any{},
			"message":      "No billing record for this workspace yet.",
		}, "OK")
		return
	}

	var sub map[string]any
	var plan, status *string
	var endsAt interface{}
	var monthly, total *float64
	err = s.pool.QueryRow(r.Context(), `
		select plan_kind, status, ends_at, monthly_amount, total_contract_amount
		from public.platform_subscriptions
		where customer_id = $1
		order by created_at desc limit 1`, customerID).Scan(&plan, &status, &endsAt, &monthly, &total)
	if err == nil {
		sub = map[string]any{
			"plan_kind": plan, "status": status, "ends_at": endsAt,
			"monthly_amount": monthly, "total_contract_amount": total,
		}
	}

	rows, _ := s.pool.Query(r.Context(), `
		select i.invoice_no, i.period_start, i.period_end, i.amount, i.due_date, i.paid_at, i.status
		from public.platform_subscription_invoices i
		join public.platform_subscriptions s on s.id = i.subscription_id
		where s.customer_id = $1
		order by i.due_date desc limit 24`, customerID)
	invoices := make([]map[string]any, 0)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var invNo, st *string
			var ps, pe, due interface{}
			var amount float64
			var paidAt interface{}
			if err := rows.Scan(&invNo, &ps, &pe, &amount, &due, &paidAt, &st); err == nil {
				invoices = append(invoices, map[string]any{
					"invoice_no": invNo, "period_start": ps, "period_end": pe,
					"amount": amount, "due_date": due, "paid_at": paidAt, "status": st,
				})
			}
		}
	}

	response.OK(w, map[string]any{"subscription": sub, "invoices": invoices}, "OK")
}

func buildProgress(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser) (map[string]any, error) {
	readiness, err := setupreadiness.Load(ctx, pool, tu.TenantID)
	if err != nil {
		return nil, err
	}

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
		"dismissed":         readiness.RequiredComplete,
		"required_complete": readiness.RequiredComplete,
		"ready":             readiness.Ready,
		"blocking_reason":   readiness.BlockingReason,
	}
	if readiness.NextStep != nil {
		out["next_step"] = map[string]any{
			"id": readiness.NextStep.ID, "label": readiness.NextStep.Label, "href": readiness.NextStep.Href,
		}
	}

	completedMap := make(map[string]bool)
	for _, s := range readiness.Steps {
		completedMap[s.ID] = s.Done
	}
	blob, _ := json.Marshal(map[string]any{"completed": completedMap})
	_, _ = pool.Exec(ctx, `
		update public.platform_customers
		set onboarding_progress = coalesce(onboarding_progress, '{}'::jsonb) || $2::jsonb, updated_at = now()
		where tenant_id = $1`, tu.TenantID, string(blob))

	return out, nil
}

func (s *service) listPublicPlans(w http.ResponseWriter, r *http.Request) {
	list, err := plans.List(r.Context(), s.pool, true, true)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to load plans.", "ERR_INTERNAL")
		return
	}
	response.OK(w, map[string]any{"plans": list}, "OK")
}
