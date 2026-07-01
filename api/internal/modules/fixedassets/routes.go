package fixedassets

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/fixed-assets", func(fr chi.Router) {
		fr.Use(auth.RequirePermission("fixed_assets.assets", auth.AccessRead))
		registerAssetRoutes(fr, pool)
		registerDepreciationRoutes(fr, pool)
	})
}
