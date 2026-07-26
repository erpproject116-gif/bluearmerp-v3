package crm

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func RegisterJobRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Post("/crm/jobs/evaluate-alerts", evaluateAlertsJob(pool))
}

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/crm", func(cr chi.Router) {
		// Inbox is tenant-wide (activity + CRM alerts), not CRM-module gated.
		registerNotificationRoutes(cr, pool)

		cr.Group(func(g chi.Router) {
			g.Use(auth.RequireViewCRM)
			registerDashboardRoutes(g, pool)
			registerLeadsDashboardRoutes(g, pool)
			registerSalesTeamRoutes(g, pool)
			registerWarrantyAssetRoutes(g, pool)
			registerFollowUpTaskRoutes(g, pool)
			registerPipelineRoutes(g, pool)
			registerLeadRoutes(g, pool)
			registerClientsRoutes(g, pool)

			g.Route("/reports", func(rr chi.Router) {
				rr.Use(auth.RequireCrmAnalytics)
				registerReportRoutes(rr, pool)
			})

			g.Route("/alert-rules", func(ar chi.Router) {
				ar.Get("/", listAlertRules(pool))
				ar.With(auth.RequireManageCrmRules).Patch("/{id}", patchAlertRule(pool))
			})
		})
	})
}
