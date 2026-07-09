package billing

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/config"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type service struct {
	pool *pgxpool.Pool
	cfg  config.Config
}

// RegisterWebhookRoutes mounts the public PayMongo webhook (no auth).
func RegisterWebhookRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Post("/platform/webhooks/paymongo", paymongoWebhookHandler(pool))
}

// RegisterRoutes mounts tenant billing endpoints (authenticated).
func RegisterRoutes(r chi.Router, pool *pgxpool.Pool, cfg config.Config) {
	svc := &service{pool: pool, cfg: cfg}
	r.Group(func(pr chi.Router) {
		pr.Use(requireTenantBillingAccess)
		pr.Post("/platform/billing/invoices/{id}/checkout", svc.createCheckout)
		pr.Get("/platform/billing/invoices/{id}/pdf", svc.downloadInvoicePDF)
		pr.Get("/platform/billing/payments", svc.listPayments)
	})
}

// RegisterConsoleRoutes mounts superadmin billing summary.
func RegisterConsoleRoutes(r chi.Router, pool *pgxpool.Pool, cfg config.Config) {
	svc := &service{pool: pool, cfg: cfg}
	r.Get("/platform/console/billing/summary", svc.billingSummary)
}

func requireTenantBillingAccess(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		if !tu.IsTenantOwner && !tu.IsPlatformSuperadmin {
			response.Err(w, http.StatusForbidden, "Tenant owner access required.", "ERR_FORBIDDEN")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *service) createCheckout(w http.ResponseWriter, r *http.Request) {
	tu, _ := auth.FromContext(r.Context())
	invID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || invID <= 0 {
		response.Validation(w, map[string]string{"id": "Invalid invoice id."})
		return
	}

	var tenantID int64
	var invNo, status string
	var amount float64
	err = s.pool.QueryRow(r.Context(), `
		select s.tenant_id, i.invoice_no, i.status, i.amount
		from public.platform_subscription_invoices i
		join public.platform_subscriptions s on s.id = i.subscription_id
		where i.id = $1`, invID).Scan(&tenantID, &invNo, &status, &amount)
	if err != nil || tenantID != tu.TenantID {
		response.Err(w, http.StatusNotFound, "Invoice not found.", "ERR_NOT_FOUND")
		return
	}
	if status != "issued" {
		response.Err(w, http.StatusBadRequest, "Invoice is not payable.", "ERR_BAD_REQUEST")
		return
	}

	client := NewPayMongoClient()
	if !client.Enabled() {
		response.Err(w, http.StatusServiceUnavailable, "Online payments not configured.", "ERR_UNAVAILABLE")
		return
	}

	reference := invNo
	base := BillingReturnBase()
	session, err := client.CreateCheckoutSession(r.Context(),
		"Bluearm ERP — "+invNo,
		AmountToCentavos(amount),
		reference,
		base+"?paid=1",
		base+"?cancelled=1",
		map[string]string{
			"invoice_id": strconv.FormatInt(invID, 10),
			"tenant_id":  strconv.FormatInt(tenantID, 10),
		},
	)
	if err != nil {
		response.Err(w, http.StatusBadGateway, "Failed to create checkout session.", "ERR_GATEWAY")
		return
	}

	_, _ = s.pool.Exec(r.Context(), `
		update public.platform_subscription_invoices
		set paymongo_checkout_session_id = $2,
		    paymongo_reference = $3,
		    updated_at = now()
		where id = $1`, invID, session.SessionID, reference)

	response.OK(w, map[string]any{
		"checkout_url": session.CheckoutURL,
		"session_id":   session.SessionID,
	}, "Checkout session created.")
}

func (s *service) downloadInvoicePDF(w http.ResponseWriter, r *http.Request) {
	tu, _ := auth.FromContext(r.Context())
	invID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || invID <= 0 {
		response.Validation(w, map[string]string{"id": "Invalid invoice id."})
		return
	}

	var tenantID int64
	var invNo string
	err = s.pool.QueryRow(r.Context(), `
		select s.tenant_id, i.invoice_no
		from public.platform_subscription_invoices i
		join public.platform_subscriptions s on s.id = i.subscription_id
		where i.id = $1`, invID).Scan(&tenantID, &invNo)
	if err != nil || (tenantID != tu.TenantID && !tu.IsPlatformSuperadmin) {
		response.Err(w, http.StatusNotFound, "Invoice not found.", "ERR_NOT_FOUND")
		return
	}

	pdfBytes, err := renderInvoicePDF(r.Context(), s.pool, invID)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to generate PDF.", "ERR_INTERNAL")
		return
	}
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", `inline; filename="`+invNo+`.pdf"`)
	_, _ = w.Write(pdfBytes)
}

func (s *service) listPayments(w http.ResponseWriter, r *http.Request) {
	tu, _ := auth.FromContext(r.Context())
	rows, err := s.pool.Query(r.Context(), `
		select p.id, p.invoice_id, i.invoice_no, p.amount, p.currency, p.provider,
		       p.provider_payment_id, p.paid_at, p.status
		from public.platform_subscription_payments p
		join public.platform_subscription_invoices i on i.id = p.invoice_id
		where p.tenant_id = $1
		order by p.paid_at desc
		limit 50`, tu.TenantID)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to load payments.", "ERR_INTERNAL")
		return
	}
	defer rows.Close()

	out := make([]map[string]any, 0)
	for rows.Next() {
		var id, invoiceID int64
		var invNo, currency, provider, providerPayID, status *string
		var amount float64
		var paidAt interface{}
		if err := rows.Scan(&id, &invoiceID, &invNo, &amount, &currency, &provider, &providerPayID, &paidAt, &status); err != nil {
			continue
		}
		out = append(out, map[string]any{
			"id": id, "invoice_id": invoiceID, "invoice_no": invNo,
			"amount": amount, "currency": currency, "provider": provider,
			"provider_payment_id": providerPayID, "paid_at": paidAt, "status": status,
		})
	}
	response.OK(w, map[string]any{"payments": out}, "OK")
}

func (s *service) billingSummary(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var mrr float64
	_ = s.pool.QueryRow(ctx, `
		select coalesce(sum(s.monthly_amount), 0)
		from public.platform_subscriptions s
		where s.status in ('active', 'past_due')
		  and s.plan_kind in ('standard_6mo', 'standard_12mo')`).Scan(&mrr)

	var expiring7, expiring30, overdueInvoices int
	_ = s.pool.QueryRow(ctx, `
		select count(*) from public.platform_subscriptions
		where status = 'active'
		  and plan_kind in ('standard_6mo', 'standard_12mo', 'trial_90d')
		  and ends_at is not null
		  and ends_at <= now() + interval '7 days'
		  and ends_at > now()`).Scan(&expiring7)
	_ = s.pool.QueryRow(ctx, `
		select count(*) from public.platform_subscriptions
		where status = 'active'
		  and plan_kind in ('standard_6mo', 'standard_12mo', 'trial_90d')
		  and ends_at is not null
		  and ends_at <= now() + interval '30 days'
		  and ends_at > now()`).Scan(&expiring30)
	_ = s.pool.QueryRow(ctx, `
		select count(*) from public.platform_subscription_invoices
		where status = 'issued' and due_date < current_date`).Scan(&overdueInvoices)

	var overdueAmount float64
	_ = s.pool.QueryRow(ctx, `
		select coalesce(sum(amount), 0) from public.platform_subscription_invoices
		where status = 'issued' and due_date < current_date`).Scan(&overdueAmount)

	response.OK(w, map[string]any{
		"mrr":              mrr,
		"expiring_7_days":  expiring7,
		"expiring_30_days": expiring30,
		"overdue_invoices": overdueInvoices,
		"overdue_amount":   overdueAmount,
	}, "OK")
}
