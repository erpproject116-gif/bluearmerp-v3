package manufacturing

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/manufacturing", func(mr chi.Router) {
		mr.With(auth.RequirePermission("manufacturing.boms", auth.AccessRead)).Get("/boms", listBoms(pool))
		mr.With(auth.RequirePermission("manufacturing.boms", auth.AccessRead)).Get("/boms/{id}", getBom(pool))
		mr.With(auth.RequirePermission("manufacturing.boms", auth.AccessWrite)).Post("/boms", createBom(pool))
		mr.With(auth.RequirePermission("manufacturing.boms", auth.AccessWrite)).Patch("/boms/{id}", updateBom(pool))
		mr.With(auth.RequirePermission("manufacturing.boms", auth.AccessWrite)).Delete("/boms/{id}", deleteBom(pool))

		mr.With(auth.RequirePermission("manufacturing.work_orders", auth.AccessRead)).Get("/work-orders", listWorkOrders(pool))
		mr.With(auth.RequirePermission("manufacturing.work_orders", auth.AccessRead)).Get("/work-orders/{id}", getWorkOrder(pool))
		mr.With(auth.RequirePermission("manufacturing.work_orders", auth.AccessWrite)).Post("/work-orders", createWorkOrder(pool))
		mr.With(auth.RequirePermission("manufacturing.work_orders", auth.AccessWrite)).Patch("/work-orders/{id}", updateWorkOrder(pool))
		mr.With(auth.RequireSubmit("manufacturing.work_orders_release")).Post("/work-orders/{id}/release", releaseWorkOrder(pool))
		mr.With(auth.RequireSubmit("manufacturing.work_orders_complete")).Post("/work-orders/{id}/complete", completeWorkOrder(pool))
	})
}
