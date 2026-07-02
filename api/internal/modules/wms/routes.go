package wms

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/wms", func(wr chi.Router) {
		wr.With(auth.RequirePermission("wms.read", auth.AccessRead)).Get("/scheduled-receipts", listScheduledReceipts(pool))
		wr.With(auth.RequirePermission("wms.write", auth.AccessWrite)).Post("/scheduled-receipts", createScheduledReceipt(pool))
		wr.With(auth.RequirePermission("wms.write", auth.AccessWrite)).Post("/scheduled-receipts/{id}/process", processScheduledReceipt(pool))
	})
}
