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
)

// RegisterRoutes mounts tenant onboarding progress endpoints.
func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	svc := &service{pool: pool}
	r.Route("/platform", func(pr chi.Router) {
		pr.Get("/onboarding", svc.getOnboarding)
		pr.Post("/onboarding/dismiss", svc.dismissOnboarding)
		pr.Get("/billing", svc.getBilling)
		pr.Get("/plans", svc.listPublicPlans)
	})
}

type service struct {
	pool *pgxpool.Pool
}

type stepDef struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Href  string `json:"href"`
}

var defaultSteps = []stepDef{
	{ID: "profile", Label: "Set your company name and logo", Href: "/app/settings/branding"},
	{ID: "partner", Label: "Add a customer or supplier", Href: "/app/inventory/partners"},
	{ID: "item", Label: "Add your first product", Href: "/app/inventory/items"},
	{ID: "quote_or_sale", Label: "Create a quote or sale", Href: "/app/quotation/quotations/new"},
	{ID: "teammate", Label: "Invite a teammate", Href: "/app/user-management/users"},
	{ID: "dashboard", Label: "Open your Business Dashboard", Href: "/app/dashboard"},
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
	_, _ = s.pool.Exec(r.Context(), `
		update public.platform_customers
		set onboarding_progress = onboarding_progress || '{"dismissed": true}'::jsonb,
		    updated_at = now()
		where tenant_id = $1`, tu.TenantID)
	response.OK(w, map[string]bool{"dismissed": true}, "Dismissed.")
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
	steps := make([]map[string]any, 0, len(defaultSteps))
	completed := map[string]bool{}

	var progressJSON []byte
	_ = pool.QueryRow(ctx, `
		select onboarding_progress from public.platform_customers where tenant_id = $1 limit 1`,
		tu.TenantID).Scan(&progressJSON)
	if len(progressJSON) > 0 {
		var stored map[string]any
		_ = json.Unmarshal(progressJSON, &stored)
		if v, ok := stored["completed"].(map[string]any); ok {
			for k, val := range v {
				if b, ok := val.(bool); ok && b {
					completed[k] = true
				}
			}
		}
		if d, ok := stored["dismissed"].(bool); ok && d {
			return map[string]any{"dismissed": true, "steps": steps, "percent": 100}, nil
		}
		if d, ok := stored["dashboard"].(bool); ok && d {
			completed["dashboard"] = true
		}
	}

	detected, err := detectCompletion(ctx, pool, tu.TenantID)
	if err != nil {
		return nil, err
	}
	for k, v := range detected {
		if v {
			completed[k] = true
		}
	}

	done := 0
	var nextStep *stepDef
	for _, def := range defaultSteps {
		isDone := completed[def.ID]
		if isDone {
			done++
		} else if nextStep == nil {
			cp := def
			nextStep = &cp
		}
		steps = append(steps, map[string]any{
			"id": def.ID, "label": def.Label, "href": def.Href, "done": isDone,
		})
	}
	pct := 0
	if len(defaultSteps) > 0 {
		pct = (done * 100) / len(defaultSteps)
	}

	// Persist detected progress best-effort.
	completedMap := make(map[string]bool)
	for k, v := range completed {
		completedMap[k] = v
	}
	blob, _ := json.Marshal(map[string]any{"completed": completedMap})
	_, _ = pool.Exec(ctx, `
		update public.platform_customers
		set onboarding_progress = onboarding_progress || $2::jsonb, updated_at = now()
		where tenant_id = $1`, tu.TenantID, string(blob))

	out := map[string]any{
		"steps": steps, "percent": pct, "dismissed": false,
	}
	if nextStep != nil {
		out["next_step"] = map[string]any{"id": nextStep.ID, "label": nextStep.Label, "href": nextStep.Href}
	}
	return out, nil
}

func detectCompletion(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (map[string]bool, error) {
	out := make(map[string]bool)

	var brandingName string
	_ = pool.QueryRow(ctx, `
		select coalesce(settings->'receipt'->>'company_name', '')
		from public.tenant_branding where tenant_id = $1`, tenantID).Scan(&brandingName)
	if brandingName != "" {
		out["profile"] = true
	}

	var partners int
	_ = pool.QueryRow(ctx, `select count(*)::int from public.inv_partners where tenant_id = $1`, tenantID).Scan(&partners)
	out["partner"] = partners >= 1

	var items int
	_ = pool.QueryRow(ctx, `select count(*)::int from public.inv_items where tenant_id = $1 and deleted_at is null`, tenantID).Scan(&items)
	out["item"] = items >= 1

	var quotes, sales int
	_ = pool.QueryRow(ctx, `select count(*)::int from public.quo_quotations where tenant_id = $1`, tenantID).Scan(&quotes)
	_ = pool.QueryRow(ctx, `select count(*)::int from public.sa_sales where tenant_id = $1`, tenantID).Scan(&sales)
	out["quote_or_sale"] = quotes >= 1 || sales >= 1

	var users int
	_ = pool.QueryRow(ctx, `select count(*)::int from public.users where tenant_id = $1 and status = 'active'`, tenantID).Scan(&users)
	out["teammate"] = users > 1

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
