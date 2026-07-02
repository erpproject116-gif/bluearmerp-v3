package portal

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

// RegisterRoutes mounts all /portal endpoints on the /api/v1 router.
// Chi allows only one Route("/portal") mount; public, customer, and admin
// handlers are grouped by auth middleware inside that single tree.
func RegisterRoutes(r chi.Router, pool *pgxpool.Pool, supabaseURL, jwtSecret string) {
	r.Route("/portal", func(pr chi.Router) {
		pr.Post("/auth/request-link", requestMagicLink(pool))
		pr.Get("/auth/session", portalSession(pool))

		pr.Group(func(cr chi.Router) {
			cr.Use(MagicLinkMiddleware(pool))
			cr.Get("/orders", listPortalOrders(pool))
			cr.Get("/invoices", listPortalInvoices(pool))
			cr.Get("/tickets", listPortalTickets(pool))
			cr.Get("/vendor/purchase-orders", listVendorPurchaseOrders(pool))
		})

		pr.Group(func(ar chi.Router) {
			ar.Use(auth.Middleware(pool, supabaseURL, jwtSecret))
			ar.Use(audit.Middleware(pool))
			ar.Use(auth.RequirePermission("portal.users", auth.AccessRead))
			ar.Get("/users", listPortalUsers(pool))
			ar.With(auth.RequirePermission("portal.users", auth.AccessWrite)).Post("/users", createPortalUser(pool))
			ar.With(auth.RequirePermission("portal.users", auth.AccessWrite)).Patch("/users/{id}", patchPortalUser(pool))
			ar.With(auth.RequirePermission("portal.users", auth.AccessWrite)).Post("/users/{id}/magic-links", issueMagicLink(pool))
		})
	})
}
