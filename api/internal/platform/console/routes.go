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
	r.Group(func(cr chi.Router) {
		cr.Use(requirePlatformSuperadmin)
		cr.Get("/platform/console/customers", svc.listCustomers)
		cr.Get("/platform/console/customers/{id}", svc.getCustomer)
		cr.Post("/platform/console/customers", svc.createCustomer)
		cr.Patch("/platform/console/customers/{id}", svc.patchCustomer)
		cr.Post("/platform/console/customers/{id}/subscriptions", svc.createSubscription)
		cr.Post("/platform/console/customers/{id}/extend-trial", svc.extendTrial)
		cr.Post("/platform/console/customers/{id}/convert-demo", svc.convertDemo)
		cr.Post("/platform/console/subscriptions/{id}/invoices", svc.createInvoice)
		cr.Post("/platform/console/invoices/{id}/mark-paid", svc.markInvoicePaid)
		cr.Get("/platform/console/plans", svc.listPlans)
		cr.Get("/platform/console/plans/{id}", svc.getPlan)
		cr.Post("/platform/console/plans", svc.createPlan)
		cr.Patch("/platform/console/plans/{id}", svc.patchPlan)
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
