package reporttemplates

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/report-templates", func(rt chi.Router) {
		rt.Get("/", listTemplates(pool))
		rt.Put("/", upsertTemplate(pool))
		rt.Delete("/{code}", deleteTemplate(pool))
		rt.Post("/logo", uploadLogo(pool))
		rt.Get("/logo/{assetId}/download", downloadLogo(pool))
		rt.Delete("/logo/{assetId}", deleteLogo(pool))
	})
}
