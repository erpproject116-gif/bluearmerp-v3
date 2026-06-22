package formfields

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/form-field-settings", func(fr chi.Router) {
		fr.Get("/", listSettingsHandler(pool))
		fr.Patch("/", patchSettingsHandler(pool))
	})
}
