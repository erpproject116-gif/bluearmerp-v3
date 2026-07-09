package operations

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/operations", func(or chi.Router) {
		or.Use(auth.RequirePermission("operations.workspaces", auth.AccessRead))
		registerWorkspaceRoutes(or, pool)
		registerWorkItemRoutes(or, pool)
		registerAutomationRoutes(or, pool)
		registerDashboardRoutes(or, pool)
	})
}
