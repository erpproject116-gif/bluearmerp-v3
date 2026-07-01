package bi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

// RegisterRoutes mounts ad-hoc BI saved views and export proxy endpoints.
func RegisterRoutes(r chi.Router, pool *pgxpool.Pool, apiHandler http.Handler) {
	r.Route("/bi", func(br chi.Router) {
		br.Use(auth.RequirePermission("bi.saved_views", auth.AccessRead))
		br.Get("/saved-views", listSavedViews(pool))
		br.Get("/saved-views/{id}", getSavedView(pool))
		br.With(auth.RequirePermission("bi.saved_views", auth.AccessWrite)).Post("/saved-views", createSavedView(pool))
		br.With(auth.RequirePermission("bi.saved_views", auth.AccessWrite)).Patch("/saved-views/{id}", patchSavedView(pool))
		br.With(auth.RequirePermission("bi.saved_views", auth.AccessWrite)).Delete("/saved-views/{id}", deleteSavedView(pool))
		br.Get("/export/{reportKey}", proxyExport(pool, apiHandler))
	})
}
