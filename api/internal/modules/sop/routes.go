package sop

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/sop", func(sr chi.Router) {
		sr.Use(auth.RequirePermission("sop.documents", auth.AccessRead))
		sr.Get("/dashboard/summary", dashboardSummary(pool))
		sr.Get("/documents", listDocuments(pool))
		sr.Get("/documents/{id}", getDocument(pool))
		sr.With(auth.RequirePermission("sop.documents_write", auth.AccessWrite)).Post("/documents", createDocument(pool))
		sr.With(auth.RequirePermission("sop.documents_write", auth.AccessWrite)).Patch("/documents/{id}", patchDocument(pool))
		sr.With(auth.RequirePermission("sop.documents_write", auth.AccessWrite)).Post("/documents/{id}/publish", publishDocument(pool))
	})
}
