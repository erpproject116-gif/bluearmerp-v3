package activitylog

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/activity-logs", func(ar chi.Router) {
		ar.Use(auth.RequireViewActivityLogs)
		ar.Get("/", listActivityLogs(pool))
		ar.Get("/changes", listChangeLogs(pool))
	})
}
