package pos

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/pos", func(pr chi.Router) {
		pr.Use(auth.RequirePermission("pos.terminal", auth.AccessRead))
		registerSessionRoutes(pr, pool)
		registerCatalogRoutes(pr, pool)
		registerSettingsRoutes(pr, pool)
		registerModifierRoutes(pr, pool)
		registerOpsRoutes(pr, pool)
	})
}
