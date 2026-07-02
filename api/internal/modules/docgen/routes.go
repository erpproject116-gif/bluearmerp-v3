package docgen

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/doc-generation", func(dr chi.Router) {
		dr.With(auth.RequirePermission("user_management.doc_generation", auth.AccessRead)).Get("/rules", listRules(pool))
		dr.With(auth.RequirePermission("user_management.doc_generation", auth.AccessWrite)).Post("/rules", createRule(pool))
		dr.With(auth.RequirePermission("user_management.doc_generation", auth.AccessWrite)).Patch("/rules/{id}", patchRule(pool))
		dr.With(auth.RequirePermission("user_management.doc_generation", auth.AccessWrite)).Delete("/rules/{id}", deleteRule(pool))
		dr.With(auth.RequirePermission("user_management.doc_generation", auth.AccessWrite)).Post("/generate", generateDocuments(pool))
		dr.With(auth.RequirePermission("user_management.doc_generation", auth.AccessRead)).Post("/preview", previewGenerate(pool))
	})
}
