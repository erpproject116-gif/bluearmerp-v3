package portal

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

// RegisterPublicRoutes exposes unauthenticated portal auth endpoints.
func RegisterPublicRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/portal", func(pr chi.Router) {
		pr.Post("/auth/request-link", requestMagicLink(pool))
		pr.Get("/auth/session", portalSession(pool))
	})
}

// RegisterPortalRoutes exposes magic-link-protected read-only portal APIs.
func RegisterPortalRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/portal", func(pr chi.Router) {
		pr.Use(MagicLinkMiddleware(pool))
		pr.Get("/orders", listPortalOrders(pool))
		pr.Get("/invoices", listPortalInvoices(pool))
		pr.Get("/tickets", listPortalTickets(pool))
	})
}

// RegisterAdminRoutes exposes internal JWT-protected portal user management.
func RegisterAdminRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/portal", func(pr chi.Router) {
		pr.Use(auth.RequirePermission("portal.users", auth.AccessRead))
		pr.Get("/users", listPortalUsers(pool))
		pr.With(auth.RequirePermission("portal.users", auth.AccessWrite)).Post("/users", createPortalUser(pool))
		pr.With(auth.RequirePermission("portal.users", auth.AccessWrite)).Patch("/users/{id}", patchPortalUser(pool))
		pr.With(auth.RequirePermission("portal.users", auth.AccessWrite)).Post("/users/{id}/magic-links", issueMagicLink(pool))
	})
}
