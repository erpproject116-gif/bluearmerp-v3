package columnlabels

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/column-label-settings", func(cr chi.Router) {
		cr.Get("/", listHandler(pool))
		cr.Patch("/", patchHandler(pool))
	})
}
