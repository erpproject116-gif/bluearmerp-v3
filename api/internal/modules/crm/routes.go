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
		cr.Use(auth.RequireViewCRM)
		registerDashboardRoutes(cr, pool)
		registerSalesTeamRoutes(cr, pool)
		registerWarrantyAssetRoutes(cr, pool)
		registerFollowUpTaskRoutes(cr, pool)
		registerNotificationRoutes(cr, pool)
		registerPipelineRoutes(cr, pool)
		registerLeadRoutes(cr, pool)

		cr.Route("/reports", func(rr chi.Router) {
			rr.Use(auth.RequireCrmAnalytics)
			registerReportRoutes(rr, pool)
		})

		cr.Route("/alert-rules", func(ar chi.Router) {
			ar.Get("/", listAlertRules(pool))
			ar.With(auth.RequireManageCrmRules).Patch("/{id}", patchAlertRule(pool))
		})
	})
}
