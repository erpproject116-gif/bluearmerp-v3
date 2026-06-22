package drafts

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/drafts/{entity_type}", func(dr chi.Router) {
		dr.Put("/", upsertDraftHandler(pool))
		dr.Get("/", getDraftHandler(pool))
		dr.Delete("/", deleteDraftHandler(pool))
	})
}
