package dashboard

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/dashboard", func(dr chi.Router) {
		dr.Use(auth.RequirePermission("dashboard.view", auth.AccessRead))

		dr.Group(func(kpi chi.Router) {
			kpi.Use(auth.RequirePermission("dashboard.kpis", auth.AccessRead))
			kpi.Get("/summary", summaryHandler(pool))
			kpi.Get("/financial-health", financialHealthHandler(pool))
			kpi.Get("/period-summary", periodSummaryHandler(pool))
			kpi.Get("/ops-intelligence", opsIntelligenceHandler(pool))
		})

		dr.Group(func(charts chi.Router) {
			charts.Use(auth.RequirePermission("dashboard.charts", auth.AccessRead))
			charts.Get("/sales-trend", salesTrendHandler(pool))
			charts.Get("/inventory-trend", inventoryTrendHandler(pool))
			charts.Get("/top-customers", topCustomersHandler(pool))
			charts.Get("/top-vendors", topVendorsHandler(pool))
			charts.Get("/top-items", topItemsHandler(pool))
		})

		dr.Group(func(flags chi.Router) {
			flags.Use(auth.RequirePermission("dashboard.red_flags", auth.AccessRead))
			flags.Get("/red-flags", redFlagsHandler(pool))
		})
	})
}
