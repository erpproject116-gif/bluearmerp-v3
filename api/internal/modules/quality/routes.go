package quality

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/quality", func(qr chi.Router) {
		qr.With(auth.RequirePermission("quality.ncrs", auth.AccessRead)).Get("/ncrs", listNcrs(pool))
		qr.With(auth.RequirePermission("quality.ncrs", auth.AccessRead)).Get("/ncrs/{id}", getNcr(pool))
		qr.With(auth.RequirePermission("quality.ncrs", auth.AccessWrite)).Post("/ncrs", createNcr(pool))
		qr.With(auth.RequirePermission("quality.ncrs", auth.AccessWrite)).Patch("/ncrs/{id}", patchNcr(pool))
		qr.With(auth.RequirePermission("quality.ncrs", auth.AccessWrite)).Delete("/ncrs/{id}", deleteNcr(pool))

		qr.With(auth.RequirePermission("quality.gr_inspection", auth.AccessWrite)).Patch("/goods-receipts/{id}/inspection", patchGrInspection(pool))

		qr.With(auth.RequirePermission("quality.capa_read", auth.AccessRead)).Get("/capa", listCapaRecords(pool))
		qr.With(auth.RequirePermission("quality.capa_write", auth.AccessWrite)).Post("/capa", createCapaRecord(pool))
	})
}
