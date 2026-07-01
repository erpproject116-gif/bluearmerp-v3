package hr

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/hr", func(hr chi.Router) {
		hr.Use(auth.RequirePermission("hr.employees", auth.AccessRead))
		registerEmployeeRoutes(hr, pool)
		registerPayrollRoutes(hr, pool)
	})
}
