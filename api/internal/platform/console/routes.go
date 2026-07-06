package console

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/config"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// RegisterRoutes mounts superadmin-only platform console endpoints.
func RegisterRoutes(r chi.Router, pool *pgxpool.Pool, cfg config.Config) {
	svc := &service{pool: pool, cfg: cfg}
	r.Route("/platform/console", func(cr chi.Router) {
		cr.Use(requirePlatformSuperadmin)
		cr.Get("/customers", svc.listCustomers)
		cr.Get("/customers/{id}", svc.getCustomer)
		cr.Post("/customers", svc.createCustomer)
		cr.Patch("/customers/{id}", svc.patchCustomer)
		cr.Post("/customers/{id}/subscriptions", svc.createSubscription)
		cr.Post("/customers/{id}/extend-trial", svc.extendTrial)
		cr.Post("/customers/{id}/convert-demo", svc.convertDemo)
		cr.Post("/subscriptions/{id}/invoices", svc.createInvoice)
		cr.Post("/invoices/{id}/mark-paid", svc.markInvoicePaid)
		cr.Get("/plans", svc.listPlans)
		cr.Get("/plans/{id}", svc.getPlan)
		cr.Post("/plans", svc.createPlan)
		cr.Patch("/plans/{id}", svc.patchPlan)
	})
}

type service struct {
	pool *pgxpool.Pool
	cfg  config.Config
}

func requirePlatformSuperadmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok || !tu.IsPlatformSuperadmin {
			response.Err(w, http.StatusForbidden, "Platform superadmin access required.", "ERR_FORBIDDEN")
			return
		}
		next.ServeHTTP(w, r)
	})
}
