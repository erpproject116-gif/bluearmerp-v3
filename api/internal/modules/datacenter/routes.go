package datacenter

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/data-center", func(dr chi.Router) {
		registerIngestionRuleRoutes(dr, pool)
		registerIngestedDocumentRoutes(dr, pool)
	})
}

func registerIngestionRuleRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("data_center.read", auth.AccessRead)).Get("/ingestion-rules", listIngestionRules(pool))
	r.With(auth.RequirePermission("data_center.read", auth.AccessRead)).Get("/ingestion-rules/{id}", getIngestionRule(pool))
	r.With(auth.RequirePermission("data_center.manage", "manage")).Post("/ingestion-rules", createIngestionRule(pool))
	r.With(auth.RequirePermission("data_center.manage", "manage")).Patch("/ingestion-rules/{id}", patchIngestionRule(pool))
	r.With(auth.RequirePermission("data_center.manage", "manage")).Delete("/ingestion-rules/{id}", deleteIngestionRule(pool))
}

func registerIngestedDocumentRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("data_center.read", auth.AccessRead)).Get("/inbox", listIngestedDocuments(pool))
	r.With(auth.RequirePermission("data_center.manage", "manage")).Post("/ingest/webhook", ingestWebhook(pool))
	r.With(auth.RequirePermission("data_center.manage", "manage")).Post("/ingest/email", ingestEmail(pool))
	r.With(auth.RequirePermission("data_center.manage", "manage")).Post("/inbox/{id}/generate", generateFromIngested(pool))
}
