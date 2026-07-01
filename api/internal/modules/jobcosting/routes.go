package jobcosting

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/job-costing", func(jr chi.Router) {
		jr.Use(auth.RequirePermission("job_costing.projects", auth.AccessRead))
		registerProjectRoutes(jr, pool)
		registerBudgetRoutes(jr, pool)
		registerTimesheetRoutes(jr, pool)
	})
}
