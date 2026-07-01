package support

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/support", func(sr chi.Router) {
		sr.Use(auth.RequirePermission("support.tickets", auth.AccessRead))
		registerTicketRoutes(sr, pool)
	})
}
