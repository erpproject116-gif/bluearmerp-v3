package okr

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/okr", func(or chi.Router) {
		or.Use(auth.RequirePermission("okr.objectives", auth.AccessRead))
		or.Get("/dashboard/summary", dashboardSummary(pool))
		or.Get("/objectives", listObjectives(pool))
		or.Get("/objectives/{id}", getObjective(pool))
		or.With(auth.RequirePermission("okr.objectives", auth.AccessWrite)).Post("/objectives", createObjective(pool))
		or.With(auth.RequirePermission("okr.objectives", auth.AccessWrite)).Patch("/objectives/{id}", patchObjective(pool))
		or.Get("/objectives/{id}/key-results", listKeyResults(pool))
		or.With(auth.RequirePermission("okr.objectives", auth.AccessWrite)).Post("/objectives/{id}/key-results", createKeyResult(pool))
		or.With(auth.RequirePermission("okr.objectives", auth.AccessWrite)).Patch("/key-results/{id}", patchKeyResult(pool))
	})
}
